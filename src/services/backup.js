// src/services/backup.js
// [FIX] Improved initialization with retry mechanism

const BACKUP_STORE = 'backup_settings';

// --- FILES ---
const MANUAL_BACKUP_FILE = 'backup-manuel';
const AUTO_BACKUP_PREFIX = 'backup-auto-';

// --- CONSTANTS ---
const DEFAULT_THRESHOLD = 10;
const DEFAULT_TIME_THRESHOLD = 4 * 60 * 60 * 1000; // 4 Hours
const INIT_RETRY_DELAY = 100; // ms
const MAX_INIT_RETRIES = 50;

// --- STATE ---
let counter = 0;
let threshold = DEFAULT_THRESHOLD;
let timeThreshold = DEFAULT_TIME_THRESHOLD;
let lastAutoBackup = 0;
let lastRegisterTime = 0;

let autoImportEnabled = false;
let lastImported = 0;
let backupDir = null;
let isInitialized = false;
let dbApi = null;

// --- INITIALIZATION ---
// [FIX] Improved initialization with proper retry mechanism
export async function init(providedDb, maxRetries = MAX_INIT_RETRIES) {
  // If DB is already provided and initialized, skip
  if (dbApi && isInitialized) {
    return true;
  }

  if (providedDb) dbApi = providedDb;

  // Retry mechanism for race conditions
  let retries = 0;
  while (!dbApi && retries < maxRetries) {
    console.log(`[Backup] Waiting for DB (attempt ${retries + 1}/${maxRetries})...`);
    await new Promise((r) => setTimeout(r, INIT_RETRY_DELAY));
    retries++;
  }

  if (!dbApi) {
    console.error('[Backup] CRITICAL: Init failed - DB not available after retries');
    // Don't throw - allow app to continue without backup
    return false;
  }

  try {
    const settings = await dbApi.getSettings();

    threshold = settings.backup_threshold || DEFAULT_THRESHOLD;
    counter = settings.backup_counter || 0;
    timeThreshold = settings.backup_timeThreshold || DEFAULT_TIME_THRESHOLD;

    // Default to NOW if missing (fresh install fix)
    lastAutoBackup = settings.backup_lastAutoBackup || Date.now();

    autoImportEnabled = !!settings.backup_autoImport;
    lastImported = settings.backup_lastImported || 0;

    isInitialized = true;
    console.log('[BACKUP] Service initialized - Counter:', counter, 'Threshold:', threshold);
    return true;
  } catch (e) {
    console.warn('[BACKUP] Settings load error, using defaults:', e);
    isInitialized = true;
    lastAutoBackup = Date.now();
    return true;
  }
}

// Helper to ensure DB is available before operations
async function ensureDb() {
  if (!dbApi) {
    console.warn('[Backup] DB not ready, attempting to re-init...');
    await init(dbApi, 3);
    if (!dbApi) {
      throw new Error('Database not available for backup operation');
    }
  }
  return dbApi;
}

async function saveMeta() {
  if (dbApi) {
    await dbApi.saveSettings({
      backup_threshold: threshold,
      backup_autoImport: autoImportEnabled,
      backup_lastImported: lastImported,
      backup_timeThreshold: timeThreshold,
      backup_lastAutoBackup: lastAutoBackup,
    });
  }
}

// --- DIRECTORY SELECTION ---
export async function chooseDirectory() {
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    return {
      type: 'android',
      path: 'Documents/copro-watch',
      name: 'Dossier Documents/copro-watch',
    };
  }
  if (typeof window !== 'undefined' && 'showDirectoryPicker' in window) {
    try {
      const dirHandle = await window.showDirectoryPicker();
      backupDir = dirHandle;
      return { type: 'web', handle: dirHandle, name: dirHandle.name };
    } catch (e) {
      throw new Error('Sélection annulée');
    }
  }
  throw new Error('Non supporté');
}

// --- CORE: SAVE JSON ---
export async function saveBackupJSON(jsonString, filename) {
  const { Capacitor } = await import('@capacitor/core');

  try {
    console.log(`[Backup] Saving to ${filename}...`);

    // 1. ANDROID
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
      try {
        await Filesystem.requestPermissions();
        try {
          await Filesystem.stat({ path: 'copro-watch', directory: Directory.Documents });
        } catch {
          await Filesystem.mkdir({
            path: 'copro-watch',
            directory: Directory.Documents,
            recursive: true,
          });
        }

        await Filesystem.writeFile({
          path: `copro-watch/${filename}`,
          data: jsonString,
          directory: Directory.Documents,
          encoding: Encoding.UTF8,
        });
        return true;
      } catch (e) {
        console.error('[Backup] Native write failed:', e);
        return false; // Return false instead of throwing
      }
    }

    // 2. WEB
    if (typeof window !== 'undefined' && backupDir) {
      try {
        const fileHandle = await backupDir.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(jsonString);
        await writable.close();
        return true;
      } catch (e) {
        console.error('[Backup] Web write failed:', e);
        return false;
      }
    }

    // 3. FALLBACK Download
    try {
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 0);
      return true;
    } catch (e) {
      console.error('[Backup] Fallback download failed:', e);
      return false;
    }
  } catch (e) {
    console.error('[Backup] Critical failure:', e);
    return false;
  }
}

// --- CORE: READ FILE ---
async function getFileContent(filename) {
  const { Capacitor } = await import('@capacitor/core');

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    try {
      const stat = await Filesystem.stat({
        path: `copro-watch/${filename}`,
        directory: Directory.Documents,
      });
      const contents = await Filesystem.readFile({
        path: `copro-watch/${filename}`,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      return { text: contents.data, lastModified: stat.mtime, name: filename };
    } catch (e) {
      return null;
    }
  } else if (backupDir) {
    try {
      const handle = await backupDir.getFileHandle(filename);
      const file = await handle.getFile();
      const text = await file.text();
      return { text, lastModified: file.lastModified, name: filename };
    } catch (e) {
      return null;
    }
  }
  return null;
}

function getRealDate(fileObj) {
  if (!fileObj || !fileObj.text) return 0;
  try {
    const data = JSON.parse(fileObj.text);
    if (data.meta && data.meta.exported_at) {
      return data.meta.exported_at;
    }
  } catch (e) {
    return 0;
  }
  return fileObj.lastModified;
}

// REPLACES the old readBackupJSON function
// [SURGICAL REPLACEMENT]
export async function readBackupJSON() {
  // 1. Load Capacitor (Works in APK & Standalone)
  const { Capacitor } = await import('@capacitor/core');
  let candidates = [];

  try {
    // ---------------------------------------------------------
    // A. APK MODE (Android Native)
    // ---------------------------------------------------------
    if (Capacitor.isNativePlatform()) {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      try {
        // [FIX] Request permissions explicitly before reading
        // This ensures access is granted even after a "Clear Data"
        try {
          await Filesystem.requestPermissions();
        } catch (e) {
          /* Ignore if already granted */
        }

        const result = await Filesystem.readdir({
          path: 'copro-watch',
          directory: Directory.Documents,
        });

        candidates = result.files
          .filter((f) => f.name.endsWith('.json'))
          .map((f) => ({
            name: f.name,
            time: Number(f.mtime),
            platform: 'android',
          }));
      } catch (e) {
        console.warn('[Backup] Android scan failed. Permission denied?');
        // Do not crash. Just ignore folder scanning.
      }
    }
    // ---------------------------------------------------------
    // B. STANDALONE HTML / WEB MODE
    // ---------------------------------------------------------
    else if (backupDir) {
      try {
        // Only works if user previously granted permission
        for await (const entry of backupDir.values()) {
          if (entry.kind === 'file' && entry.name.endsWith('.json')) {
            const file = await entry.getFile();
            candidates.push({
              name: entry.name,
              time: file.lastModified,
              platform: 'web',
            });
          }
        }
      } catch (e) {
        console.warn('[Backup] Web folder scan failed. Browser blocked access.');
        // Do not crash. Just ignore folder scanning.
      }
    }

    // ---------------------------------------------------------
    // C. FAIL-SAFE DECISION
    // ---------------------------------------------------------
    if (candidates.length === 0) {
      console.log('[Backup] No folder access. Switching to internal storage (Legacy).');
      return await readBackupJSONLegacy();
    }

    // If we found files, pick the newest one
    candidates.sort((a, b) => b.time - a.time);
    const winner = candidates[0];
    console.log(`[Backup] Auto-loading external file: ${winner.name}`);

    const content = await getFileContent(winner.name);
    if (!content) return await readBackupJSONLegacy(); // Safety fallback

    return content;
  } catch (e) {
    console.error('[Backup] Critical error handled:', e);
    // 🚨 SAFETY NET: Never crash, always fallback
    return await readBackupJSONLegacy();
  }
}
// [HELPER] Legacy fallback in case 'readdir' is denied permission
async function readBackupJSONLegacy() {
  console.log('[Backup] Scanning failed, using legacy fallback...');

  // Search for any backup file (manual or auto with timestamps)
  const patterns = [
    'backup-manuel_', // Manual backup with timestamp
    'backup-counter_', // Auto counter backup with timestamp
    'backup-time_', // Auto time backup with timestamp
  ];

  // Also check old fixed-name files for compatibility
  const oldFiles = ['backup-manuel.json', 'backup-auto-compteur.json', 'backup-auto-temps.json'];

  let best = null;
  let maxDate = 0;

  // Import Filesystem for legacy fallback
  const { Capacitor } = await import('@capacitor/core');
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    // Check new timestamped files first
    for (const pattern of patterns) {
      try {
        const result = await Filesystem.readdir({
          path: 'copro-watch',
          directory: Directory.Documents,
        });

        for (const file of result.files) {
          if (file.name.startsWith(pattern) && file.name.endsWith('.json')) {
            try {
              const content = await getFileContent(file.name);
              if (content && content.lastModified > maxDate) {
                maxDate = content.lastModified;
                best = content;
              }
            } catch (e) {
              // Skip this file
            }
          }
        }
      } catch (e) {
        // Continue to next pattern
      }
    }

    // If no timestamped files found, check old fixed-name files
    if (!best) {
      for (const filename of oldFiles) {
        try {
          const content = await getFileContent(filename);
          if (content && content.lastModified > maxDate) {
            maxDate = content.lastModified;
            best = content;
          }
        } catch (e) {
          // Skip this file
        }
      }
    }
  }

  if (best) return best;
  throw new Error('Aucune sauvegarde trouvée.');
}

// [SURGICAL REPLACEMENT] src/services/backup.js

export async function registerChange() {
  // Ensure DB is available
  await ensureDb();

  // [FIX] Debounce: If updates happen within 500ms, count them as ONE action.
  const now = Date.now();
  if (now - lastRegisterTime < 500) {
    return false;
  }
  lastRegisterTime = now;

  counter++;

  // 1. Calc Time
  if (!lastAutoBackup) lastAutoBackup = now;

  const timeElapsed = now - lastAutoBackup;
  const isTimeDue = timeElapsed >= timeThreshold;
  const isCounterDue = counter >= threshold;

  // 2. Save Progress
  try {
    await dbApi.saveSettings({ backup_counter: counter });
  } catch (e) {
    console.warn('[Backup] Failed to save counter to DB', e);
  }

  // 3. Trigger Logic
  if (isTimeDue) {
    console.log('[Backup] Time Triggered!');
    return 'TIME';
  }

  if (isCounterDue) {
    console.log('[Backup] Counter Triggered!');
    return 'COUNTER';
  }

  return false;
}

// Wrappers
export async function registerExamChange() {
  return registerChange();
}
export async function registerWaterAnalysisChange() {
  return registerChange();
}

// Helper function to generate unique filename with timestamp
export function generateBackupFilename(prefix = 'backup') {
  const now = new Date();
  const dateStr =
    now.getFullYear() +
    '-' +
    String(now.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(now.getDate()).padStart(2, '0') +
    '_' +
    String(now.getHours()).padStart(2, '0') +
    '-' +
    String(now.getMinutes()).padStart(2, '0') +
    '-' +
    String(now.getSeconds()).padStart(2, '0');
  return `${prefix}_${dateStr}.json`;
}

// [NEW] Retention Policy: Keep only the last 20 auto-backups
async function runRetentionPolicy() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor.isNativePlatform()) return;

  const { Filesystem, Directory } = await import('@capacitor/filesystem');

  try {
    // 1. List all backup files
    const result = await Filesystem.readdir({
      path: 'copro-watch',
      directory: Directory.Documents,
    });

    // 2. Filter & Sort by Time (Newest First)
    const backups = result.files
      .filter((f) => f.name.startsWith('backup-counter_') || f.name.startsWith('backup-time_'))
      .sort((a, b) => b.mtime - a.mtime); // Sort Descending

    // 3. Keep top 20, Delete the rest
    const MAX_HISTORY = 20;
    if (backups.length > MAX_HISTORY) {
      const toDelete = backups.slice(MAX_HISTORY);
      console.log(`[Janitor] Cleaning up ${toDelete.length} old backups...`);

      for (const file of toDelete) {
        await Filesystem.deleteFile({
          path: `copro-watch/${file.name}`,
          directory: Directory.Documents,
        });
      }
    }
  } catch (e) {
    console.warn('[Janitor] Cleanup failed:', e);
  }
}

let isExporting = false;

// [UPDATED] Export now takes a specific filename based on type
export async function performAutoExport(getJsonCallback, type = 'COUNTER') {
  if (isExporting) {
    console.warn('[Backup] Export already in progress, skipping concurrent request.');
    return false;
  }
  
  try {
    isExporting = true;
    const json = await getJsonCallback();
    
    // [NEW] Skip if callback returns null (logic in db.js)
    if (json === null) {
      await resetCounter();
      return true;
    }

    // Generate unique filename with timestamp (like manual backup)
    const prefix = type === 'TIME' ? 'backup-time' : 'backup-counter';
    const filename = generateBackupFilename(prefix);

    const success = await saveBackupJSON(json, filename);

    if (success) {
      await resetCounter(); // Reset on success
      console.log(`[Backup] Auto backup saved: ${filename}`);

      // NEW: Run retention policy after successful save
      await runRetentionPolicy();

      return true;
    } else {
      // Backup failed - DO NOT reset counter so user knows there's a problem
      console.warn(`[Backup] Auto backup FAILED: ${filename} - Counter kept for retry`);
      return false;
    }
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error('[Backup] Auto export error:', errorMsg);
    // DO NOT reset counter on error - user should know there's a problem
    return false;
  } finally {
    isExporting = false;
  }
}

// Reset both Clocks
export async function resetCounter() {
  counter = 0;
  lastAutoBackup = Date.now();
  if (dbApi) {
    await dbApi.saveSettings({
      backup_counter: 0,
      backup_lastAutoBackup: lastAutoBackup,
    });
  }
}

// --- IMPORT LOGIC ---
export async function setAutoImport(enabled) {
  autoImportEnabled = !!enabled;
  await saveMeta();
}
export async function getAutoImport() {
  return autoImportEnabled;
}

export async function checkAndAutoImport(dbInstance) {
  if (!autoImportEnabled) return { imported: false, reason: 'disabled' };

  try {
    // [CRITICAL FIX] 1. Check if we have local data first.
    // NEVER overwrite an existing local database with an auto-import.
    const workerCount = await dbInstance.workers.count();
    if (workerCount > 0) {
      console.log(
        '[Backup] Local data exists. Skipping auto-import to prevent the Reversion Trap.'
      );
      return { imported: false, reason: 'local_data_exists' };
    }

    // readBackupJSON now automatically finds the newest of the 3 files
    const backup = await readBackupJSON();
    if (!backup) return { imported: false, reason: 'no_data' };

    const realDate = getRealDate(backup);
    if (realDate > lastImported + 1000) {
      console.log(`[Backup] Newer backup found (${backup.name}). Importing...`);
      const result = await dbInstance.importData(backup.text);
      
      if (result === true) {
        lastImported = realDate;
        await saveMeta();
        return { imported: true, source: backup.name };
      } else if (result && result.error === 'NEED_PASSWORD') {
        console.log('[Backup] Auto-import requires a password.');
        return { imported: false, reason: 'NEED_PASSWORD', encryptedData: result.encryptedData, source: backup.name };
      }
    }
    return { imported: false, reason: 'not_newer' };
  } catch (e) {
    return { imported: false, error: e.message };
  }
}

// --- STATUS & UTILS ---
export async function getBackupStatus() {
  if (!isInitialized) await init(dbApi);

  const now = Date.now();

  // Safety fix
  if (!lastAutoBackup || lastAutoBackup === 0) lastAutoBackup = now;

  const timeElapsed = Math.max(0, now - lastAutoBackup);
  const isTimeDue = timeElapsed >= timeThreshold;
  const isCounterDue = counter >= threshold;

  return {
    counter,
    threshold,
    timeThreshold,
    lastAutoBackup,
    autoImportEnabled,
    progress: `Modifs: ${counter}/${threshold} | Temps: ${(timeElapsed / 60000).toFixed(0)}/${(
      timeThreshold / 60000
    ).toFixed(0)} min`,
    shouldBackup: isCounterDue || isTimeDue,
    backupNeeded: isCounterDue || isTimeDue,
  };
}

// Standard exports
export async function setThreshold(value) {
  if (typeof value === 'number' && value > 0) {
    threshold = value;
    await saveMeta();
    return true;
  }
  return false;
}
export function getDirHandle() {
  return backupDir;
}
export function getBackupDirName() {
  if (backupDir) return backupDir.name;
  return 'Dossier Documents (Android) ou Non sélectionné';
}
export function isDirectoryAvailable() {
  return typeof window !== 'undefined';
}
export function getCurrentStorageInfo() {
  if (backupDir)
    return { type: 'Web API', path: backupDir.name, available: true, permission: 'granted' };
  return {
    type: 'Système / Android',
    path: 'Documents/copro-watch',
    available: true,
    permission: 'unknown',
  };
}
export async function clearDirectory() {
  backupDir = null;
}

export function getThreshold() {
  // Returns true if counter limit is reached
  return counter >= threshold;
}

export async function getCurrentThreshold() {
  return threshold;
}

// [NEW] Helper for the Time Limit (Optional but useful for UI)
export function getTimeThreshold() {
  return timeThreshold;
}

export async function setLastImported(date) {
  lastImported = date;
  await saveMeta();
}

export { getRealDate };

export default {
  init,
  chooseDirectory,
  saveBackupJSON,
  readBackupJSON,
  getThreshold,
  getCurrentThreshold,
  getBackupStatus,
  setThreshold,
  registerChange,
  registerExamChange,
  registerWaterAnalysisChange,
  resetCounter,
  performAutoExport,
  getDirHandle,
  getBackupDirName,
  clearDirectory,
  setAutoImport,
  getAutoImport,
  checkAndAutoImport,
  isDirectoryAvailable,
  getCurrentStorageInfo,
  generateBackupFilename,
  setLastImported,
  getRealDate,
};
