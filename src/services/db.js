import Dexie from 'dexie';
import backupService from './backup';
import { encryptString, decryptString, hashString } from './crypto'; // IMPORT ADDED
import { logic } from './logic'; // IMPORT ADDED

// [NEW] WORKER IMPORT (Vite Syntax)
// We use a dedicated worker for heavy JSON operations to prevent UI freeze
import ExportWorker from '../workers/export.worker?worker';

// 1. Define the Database
class CoproDatabase extends Dexie {
  constructor() {
    super('CoproWatchDB');

    // KEEP Version 1 (For history)
    this.version(1).stores({
      workers: '++id, full_name, national_id, department_id, archived',
      departments: '++id',
      workplaces: '++id',
      exams: '++id, worker_id, exam_date',
      water_analyses: '++id, sample_date',
      water_departments: '++id',
      settings: 'key',
    });

    // [ADD THIS] Version 2: Updates the database structure
    this.version(2).stores({
      workers: '++id, full_name, national_id, department_id, archived',
      departments: '++id',
      workplaces: '++id',
      exams: '++id, worker_id, exam_date',
      // 👇 ADDED 'department_id' and 'structure_id' here
      water_analyses: '++id, sample_date, department_id, structure_id',
      water_departments: '++id',
      settings: 'key',
    });

    // [NEW] Version 3: Weapon Management Module
    this.version(3).stores({
      workers: '++id, full_name, national_id, department_id, archived',
      departments: '++id',
      workplaces: '++id',
      exams: '++id, worker_id, exam_date',
      water_analyses: '++id, sample_date, department_id, structure_id',
      water_departments: '++id',
      settings: 'key',
      weapon_holders:
        '++id, full_name, national_id, department_id, status, next_review_date, archived',
      weapon_exams: '++id, holder_id, exam_date, visit_reason, final_decision',
      weapon_departments: '++id, name',
    });
  }
}

const dbInstance = new CoproDatabase();

// --- WORKER HELPER ---
// [NEW] Wraps the Worker in a Promise so we can await it
async function stringifyInWorker(data) {
  try {
    return await new Promise((resolve, reject) => {
      const worker = new ExportWorker();
      
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Export worker timeout (30s)'));
      }, 30000);

      worker.onmessage = (e) => {
        clearTimeout(timeout);
        if (e.data.success) {
          resolve(e.data.json);
        } else {
          reject(new Error(e.data.error || 'Worker execution failed'));
        }
        worker.terminate(); // Kill worker after job is done to save RAM
      };

      worker.onerror = (err) => {
        clearTimeout(timeout);
        console.error('[ExportWorker] Critical Error:', err);
        // [FIX] ErrorEvents are not automatically readable as JSON
        reject(new Error(err.message || 'Worker Thread Crash'));
        worker.terminate();
      };

      // Send the massive object to the background
      worker.postMessage({ data });
    });
  } catch (e) {
    console.warn('[DB] Background stringify failed, using main thread fallback...', e);
    return JSON.stringify(data);
  }
}

let lastExportDataStr = null;

// [CRITICAL FIX] Synchronous-ish Export to prevent data loss on force close
async function triggerBackupCheck() {
  try {
    const triggerType = await backupService.registerChange();

    if (triggerType) {
      console.log(`[DB] Backup due (${triggerType}). Executing export IMMEDIATELY...`);
      try {
        await backupService.performAutoExport(async () => {
          const dataStr = await exportDataRaw();
          // [OPTIMIZATION] Check if data is actually different from last successful export
          if (dataStr === lastExportDataStr) {
            console.log('[DB] Data unchanged since last backup, skipping write.');
            return null; // Signals skip
          }
          lastExportDataStr = dataStr;
          
          // Always encrypt with current PIN for auto-backups
          const settings = await db.getSettings();
          const pinHash = settings.pin || '0000';
          const ext = settings.backup_password_extension || '';
          return await encryptString(pinHash, dataStr, ext);
        }, triggerType);
      } catch (e) {
        console.warn('[DB] Background export failed', e);
      }
    }
  } catch (e) {
    console.error('[DB] Backup trigger error:', e);
  }
}

// Internal raw export (plain JSON)
async function exportDataRaw() {
  const rawData = {
    meta: {
      version: '1.1',
      exported_at: new Date().getTime(),
    },
    departments: await dbInstance.departments.toArray(),
    workplaces: await dbInstance.workplaces.toArray(),
    workers: await dbInstance.workers.toArray(),
    exams: await dbInstance.exams.toArray(),
    water_analyses: await dbInstance.water_analyses.toArray(),
    water_departments: await dbInstance.water_departments.toArray(),
    weapon_holders: await dbInstance.weapon_holders.toArray(),
    weapon_exams: await dbInstance.weapon_exams.toArray(),
    weapon_departments: await dbInstance.weapon_departments.toArray(),
  };

  return await stringifyInWorker(rawData);
}

// 4. Export Global Function (Used by UI and Backup)
// [UPDATED] Now always returns ENCRYPTED data by default using current PIN
async function exportData(password = null) {
  const rawJson = await exportDataRaw();
  const settings = await db.getSettings();
  const ext = settings.backup_password_extension || '';
  
  console.log('[DB EXPORT] Starting export - hasCustomPassword:', !!password, 'extension:', ext);
  
  if (password) {
    console.log('[DB EXPORT] Using custom password for encryption');
    // For custom password, we use it as PIN with the extension (Combined Key)
    return await encryptString(password, rawJson, ext);
  }
  
  // Default: use current app PIN hash
  const pinHash = settings.pin || '0000';
  console.log('[DB EXPORT] Using PIN hash for encryption, pinHash length:', pinHash.length);
  return await encryptString(pinHash, rawJson, ext);
}

// 5. The Public API
export const db = {
  async init() {
    const deptCount = await dbInstance.departments.count();
    if (deptCount === 0) {
      console.log('Seeding database (First Run)...');
    }
  },

  // ... (keeping other methods as they are) ...

  // --- WEAPONS (NEW) ---
  async getWeaponHolders() {
    return await dbInstance.weapon_holders.toArray();
  },
  async getWeaponHolder(id) {
    return await dbInstance.weapon_holders.get(Number(id));
  },
  async saveWeaponHolder(holder) {
    const id = await dbInstance.weapon_holders.put(holder);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
    return { ...holder, id };
  },
  async deleteWeaponHolder(id) {
    const numId = Number(id);
    await dbInstance.transaction(
      'rw',
      dbInstance.weapon_exams,
      dbInstance.weapon_holders,
      async () => {
        await dbInstance.weapon_exams.where('holder_id').equals(numId).delete();
        await dbInstance.weapon_holders.delete(numId);
      }
    );
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
  },
  async getWeaponExams() {
    return await dbInstance.weapon_exams.toArray();
  },
  async getWeaponExamsByHolder(holderId) {
    return await dbInstance.weapon_exams.where('holder_id').equals(Number(holderId)).toArray();
  },
  async saveWeaponExam(exam) {
    const id = await dbInstance.weapon_exams.put(exam);

    // Auto-update holder status and review date based on FULL HISTORY
    const holder = await dbInstance.weapon_holders.get(Number(exam.holder_id));
    if (holder) {
      const exams = await dbInstance.weapon_exams.where('holder_id').equals(holder.id).toArray();
      const statusUpdate = logic.recalculateWeaponHolderStatus(exams);
      await dbInstance.weapon_holders.put({ ...holder, ...statusUpdate });
    }

    // Run backup in background - DO NOT AWAIT (prevents UI lag)
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
    
    return { ...exam, id };
  },
  async deleteWeaponExam(id) {
    await dbInstance.weapon_exams.delete(Number(id));
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
  },

  // --- WEAPON DEPARTMENTS (NEW) ---
  async getWeaponDepartments() {
    return await dbInstance.weapon_departments.toArray();
  },
  async saveWeaponDepartment(dept) {
    const id = await dbInstance.weapon_departments.put(dept);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
    return { ...dept, id };
  },
  async deleteWeaponDepartment(id) {
    const numId = Number(id);
    await dbInstance.transaction(
      'rw',
      dbInstance.weapon_holders,
      dbInstance.weapon_departments,
      async () => {
        await dbInstance.weapon_holders.where('department_id').equals(numId).delete();
        await dbInstance.weapon_departments.delete(numId);
      }
    );
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
  },

  // [CLONED] Move logic adapted for Weapons
  async moveWeaponHolders(holderIds, newDepartmentId) {
    return await dbInstance.transaction('rw', dbInstance.weapon_holders, async () => {
      const holders = await dbInstance.weapon_holders.bulkGet(Array.from(holderIds));
      // Tweak: "workplace_id" becomes "department_id"
      const updates = holders.map((h) => ({ ...h, department_id: Number(newDepartmentId) }));
      await dbInstance.weapon_holders.bulkPut(updates);
    });
  },

  // --- SETTINGS (FIXED) ---
  async getSettings() {
    const s = await dbInstance.settings.get('app_settings');
    return s || { key: 'app_settings' };
  },

  async saveSettings(newSettings) {
    const current = (await dbInstance.settings.get('app_settings')) || { key: 'app_settings' };
    const updated = { ...current, ...newSettings };
    await dbInstance.settings.put(updated);
    return updated;
  },

  // --- ENCRYPTION (FIXED) ---
  async exportDataEncrypted(password) {
    return await exportData(password);
  },

  async importDataEncrypted(encryptedContent, password) {
    return await this.importData(encryptedContent, password);
  },

  // --- WORKERS ---
  async getWorkers() {
    return await dbInstance.workers.toArray();
  },
  async getWorker(id) {
    // Fetch only ONE worker (Fast)
    // Ensure ID is a number
    return await dbInstance.workers.get(Number(id));
  },
  async saveWorker(worker) {
    const id = await dbInstance.workers.put(worker);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
    return { ...worker, id };
  },
  // 3. Fix for Workers
  async deleteWorker(id) {
    const numId = Number(id);

    try {
      // Use a transaction to ensure atomic deletion (all or nothing)
      await dbInstance.transaction('rw', dbInstance.exams, dbInstance.workers, async () => {
        // 1. Delete all exams for this worker first
        await dbInstance.exams.where('worker_id').equals(numId).delete();

        // 2. Delete the worker
        await dbInstance.workers.delete(numId);
      });

      // 3. Safety Check: Verify no orphans remain
      const orphanCheck = await dbInstance.exams.where('worker_id').equals(numId).count();
      if (orphanCheck > 0) {
        console.warn(`[DB] Warning: ${orphanCheck} orphan exams remained. Cleaning up...`);
        await dbInstance.exams.where('worker_id').equals(numId).delete();
      }

      triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
      console.log(`[DB] Worker ${numId} deleted successfully.`);
    } catch (error) {
      console.error('[DB] Worker deletion failed:', error);
      throw error; // Re-throw to let UI know
    }
  },

  // --- EXAMS ---
  async getExams() {
    return await dbInstance.exams.toArray();
  },
  async getExamsByWorker(workerId) {
    // Fetch only exams for this worker (Fast)
    return await dbInstance.exams.where('worker_id').equals(Number(workerId)).toArray();
  },
  async saveExam(exam) {
    const id = await dbInstance.exams.put(exam);
    
    // Auto-update worker status based on FULL HISTORY
    const worker = await dbInstance.workers.get(Number(exam.worker_id));
    if (worker) {
      const exams = await dbInstance.exams.where('worker_id').equals(worker.id).toArray();
      const statusUpdate = logic.recalculateWorkerStatus(exams);
      await dbInstance.workers.put({ ...worker, ...statusUpdate });
    }

    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
    return { ...exam, id };
  },
  async deleteExam(id) {
    const exam = await dbInstance.exams.get(id);
    await dbInstance.exams.delete(id);
    
    // Auto-update worker status after deletion
    if (exam && exam.worker_id) {
      const worker = await dbInstance.workers.get(Number(exam.worker_id));
      if (worker) {
        const exams = await dbInstance.exams.where('worker_id').equals(worker.id).toArray();
        const statusUpdate = logic.recalculateWorkerStatus(exams);
        await dbInstance.workers.put({ ...worker, ...statusUpdate });
      }
    }

    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
  },

  // --- DEPARTMENTS ---
  async getDepartments() {
    return await dbInstance.departments.toArray();
  },
  async saveDepartment(dept) {
    const id = await dbInstance.departments.put(dept);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
    return { ...dept, id };
  },
  // 2. Fix for HR Services (Settings > Services RH)
  async deleteDepartment(id) {
    const numId = Number(id); // Force Number

    // A. PRIMARY: Delete Workers (This is the most important part for HR)
    await dbInstance.workers.where('department_id').equals(numId).delete();

    // B. SECONDARY: Safety Net for Water (Prevents errors if any test was linked)
    await dbInstance.water_analyses.where('department_id').equals(numId).delete();

    // C. FINAL: Delete the Service itself
    await dbInstance.departments.delete(numId);

    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
  },

  // --- WORKPLACES ---
  async getWorkplaces() {
    return await dbInstance.workplaces.toArray();
  },
  async saveWorkplace(workplace) {
    // Allows passing either a string (old way) or an object (new way)
    const item =
      typeof workplace === 'string' ? { name: workplace, certificate_text: '' } : workplace;

    return dbInstance.workplaces.add(item);
  },
  async deleteWorkplace(id) {
    await dbInstance.workplaces.delete(id);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
  },

  // --- WATER ---
  async getWaterAnalyses() {
    return await dbInstance.water_analyses.toArray();
  },
  async saveWaterAnalysis(analysis) {
    const id = await dbInstance.water_analyses.put(analysis);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
    return { ...analysis, id };
  },
  async deleteWaterAnalysis(id) {
    await dbInstance.water_analyses.delete(id);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
  },
  async getWaterDepartments() {
    return await dbInstance.water_departments.toArray();
  },
  async saveWaterDepartment(dept) {
    const id = await dbInstance.water_departments.put(dept);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
    return { ...dept, id };
  },
  // 1. Fix for Water Services
  async deleteWaterDepartment(id) {
    const numId = Number(id); // [CRITICAL] Convert once, use everywhere

    // Delete Orphans (Uses numId)
    await dbInstance.water_analyses.where('structure_id').equals(numId).delete();

    // Delete Service (Uses numId)
    await dbInstance.water_departments.delete(numId);
    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err)); // [FIX] Awaited
  },

  // --- IMPORT / EXPORT ---
  exportData,

  async importData(jsonString, password = null) {
    if (!jsonString) return false;
    try {
      let data;
      try {
        data = JSON.parse(jsonString);
      } catch (e) {
        console.error('Invalid JSON', e);
        return false;
      }

      // Detection: Is this an encrypted CoproWatch payload?
      const isEncrypted = data.method && data.data && (data.method === 'aes-gcm' || data.method === 'xor');

      if (isEncrypted) {
        const settings = await this.getSettings();
        const ext = settings.backup_password_extension || '';
        console.log('[DB IMPORT] Starting decryption - extension:', ext);
        let decrypted = null;
        
        // 1. Try provided password if any
        if (password) {
          console.log('[DB IMPORT] Trying provided password:', password);
          // A. Try as "Full Combined Code" (Extension already added or empty)
          try {
            console.log('[DB IMPORT] Try 1: password as-is (empty ext)');
            decrypted = await decryptString(password, jsonString, '');
            console.log('[DB IMPORT] SUCCESS: password as-is worked!');
          } catch (e) {
            // B. Try as plain PIN (Add current extension) - THIS IS THE KEY FIX!
            // User provides plain old PIN, we add current extension
            try {
              console.log('[DB IMPORT] Try 2: plain PIN + current extension');
              decrypted = await decryptString(password, jsonString, ext);
              console.log('[DB IMPORT] SUCCESS: plain PIN + extension worked!');
            } catch (e2) {
              // C. Try as PIN Hash (Hash password, then add current extension)
              try {
                console.log('[DB IMPORT] Try 3: hash(password) + extension');
                const pwHash = await hashString(password, ext);
                decrypted = await decryptString(pwHash, jsonString, ext);
                console.log('[DB IMPORT] SUCCESS: hashed password + extension worked!');
              } catch (e3) {
                // D. NEW: Try with empty extension (old format without extension)
                try {
                  console.log('[DB IMPORT] Try 4: hash(password) + empty extension (legacy)');
                  const pwHashNoExt = await hashString(password, '');
                  decrypted = await decryptString(pwHashNoExt, jsonString, '');
                  console.log('[DB IMPORT] SUCCESS: hashed password + no extension worked!');
                } catch (e4) {
                  // E. Try password as-is with current extension (direct encryption key)
                  try {
                    console.log('[DB IMPORT] Try 5: password directly as encryption key + current extension');
                    decrypted = await decryptString(password, jsonString, ext);
                    console.log('[DB IMPORT] SUCCESS: password as direct key + extension!');
                  } catch (e5) {
                    console.warn('[DB IMPORT] Provided password failed all attempts:', e5.message);
                  }
                }
              }
            }
          }
        }
        
        // 2. Try current app PIN if not decrypted yet
        if (!decrypted) {
          console.log('[DB IMPORT] Trying current app PIN...');
          const pinHash = settings.pin || '0000';
          try {
            decrypted = await decryptString(pinHash, jsonString, ext);
            console.log('[DB IMPORT] SUCCESS: Current PIN + Extension worked!');
          } catch (e) {
            console.warn('[DB IMPORT] Current PIN + Extension failed:', e.message);
          }
        }
        
        // 3. If still not decrypted, we need the "Full Combined Code" from the user
        if (!decrypted) {
          console.log('[DB IMPORT] NEED_COMBINED_CODE - no password worked');
          return { error: 'NEED_COMBINED_CODE', encryptedData: jsonString };
        }
        
        data = JSON.parse(decrypted);
      }

      await dbInstance.transaction('rw', dbInstance.tables, async () => {
        if (data.departments) await dbInstance.departments.bulkPut(data.departments);
        if (data.workplaces) await dbInstance.workplaces.bulkPut(data.workplaces);
        if (data.workers) await dbInstance.workers.bulkPut(data.workers);
        if (data.exams) await dbInstance.exams.bulkPut(data.exams);
        if (data.water_analyses) await dbInstance.water_analyses.bulkPut(data.water_analyses);
        if (data.water_departments)
          await dbInstance.water_departments.bulkPut(data.water_departments);
        if (data.weapon_holders) await dbInstance.weapon_holders.bulkPut(data.weapon_holders);
        if (data.weapon_exams) await dbInstance.weapon_exams.bulkPut(data.weapon_exams);
        if (data.weapon_departments)
          await dbInstance.weapon_departments.bulkPut(data.weapon_departments);
      });
      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  },

  // [NEW] JANITOR FUNCTION (Updated to include Weapons and smarter Water logic)
  async cleanupOrphans() {
    console.log('🧹 Starting Full Database Cleanup...');
    let deletedExams = 0;
    let deletedWater = 0;
    let deletedWeaponExams = 0;
    let deletedWeaponHolders = 0;
    let deletedWorkers = 0;

    // 1. Get all valid IDs for reference
    const [
      allDepts,
      allWaterDepts,
      allWeaponDepts,
      allWorkers,
      allWeaponHolders
    ] = await Promise.all([
      dbInstance.departments.toArray(),
      dbInstance.water_departments.toArray(),
      dbInstance.weapon_departments.toArray(),
      dbInstance.workers.toArray(),
      dbInstance.weapon_holders.toArray()
    ]);

    const deptIds = new Set(allDepts.map(d => d.id));
    const waterDeptIds = new Set(allWaterDepts.map(d => d.id));
    const weaponDeptIds = new Set(allWeaponDepts.map(d => d.id));
    const workerIds = new Set(allWorkers.map(w => w.id));
    const weaponHolderIds = new Set(allWeaponHolders.map(h => h.id));

    // 2. Clean Medical Exams (Ghost Workers)
    const allExams = await dbInstance.exams.toArray();
    const orphanExamIds = allExams.filter((e) => !workerIds.has(Number(e.worker_id))).map((e) => e.id);
    if (orphanExamIds.length > 0) {
      await dbInstance.exams.bulkDelete(orphanExamIds);
      deletedExams = orphanExamIds.length;
    }

    // 3. Clean Workers (Ghost Departments)
    const orphanWorkerIds = allWorkers.filter(w => w.department_id && !deptIds.has(Number(w.department_id))).map(w => w.id);
    if (orphanWorkerIds.length > 0) {
      // Note: We don't delete workers automatically because department might be optional/missing,
      // but here we only delete if it HAS a department_id that no longer exists.
      // Wait, maybe we should just set department_id to null? 
      // User said "delete exams", so they want cleanup.
      // In this app, workers MUST belong to a department usually.
      // But let's follow the user's request for comprehensive cleanup.
      await Promise.all(orphanWorkerIds.map(id => this.deleteWorker(id)));
      deletedWorkers = orphanWorkerIds.length;
    }

    // 4. Clean Water Logs (Ghost Locations)
    // [SMART FIX] Water analyses can be linked to EITHER RH Depts or Water Depts
    const allWater = await dbInstance.water_analyses.toArray();
    const orphanWaterIds = allWater
      .filter((log) => {
        const dId = Number(log.department_id);
        const sId = Number(log.structure_id);
        
        // Check if it has ANY valid link
        const hasValidDept = dId && deptIds.has(dId);
        const hasValidStructure = sId && waterDeptIds.has(sId);
        
        // If it has BOTH, and one is invalid? We check if AT LEAST one is valid.
        // Actually, many records use department_id to store water_department ID.
        const isDIdWater = dId && waterDeptIds.has(dId);
        
        if (hasValidDept || hasValidStructure || isDIdWater) return false;
        
        // If we reach here, it's an orphan
        return true;
      })
      .map((l) => l.id);

    if (orphanWaterIds.length > 0) {
      await dbInstance.water_analyses.bulkDelete(orphanWaterIds);
      deletedWater = orphanWaterIds.length;
    }

    // 5. Clean Weapon Exams (Ghost Holders)
    const allWeaponExams = await dbInstance.weapon_exams.toArray();
    const orphanWeaponExamIds = allWeaponExams
      .filter(e => !weaponHolderIds.has(Number(e.holder_id)))
      .map(e => e.id);
    if (orphanWeaponExamIds.length > 0) {
      await dbInstance.weapon_exams.bulkDelete(orphanWeaponExamIds);
      deletedWeaponExams = orphanWeaponExamIds.length;
    }

    // 6. Clean Weapon Holders (Ghost Departments)
    const orphanWeaponHolderIds = allWeaponHolders
      .filter(h => h.department_id && !weaponDeptIds.has(Number(h.department_id)))
      .map(h => h.id);
    if (orphanWeaponHolderIds.length > 0) {
      await Promise.all(orphanWeaponHolderIds.map(id => this.deleteWeaponHolder(id)));
      deletedWeaponHolders = orphanWeaponHolderIds.length;
    }

    triggerBackupCheck().catch(err => console.error('[Backup] Background trigger failed:', err));
    return { 
      exams: deletedExams, 
      water: deletedWater,
      weaponExams: deletedWeaponExams,
      weaponHolders: deletedWeaponHolders,
      workers: deletedWorkers
    };
  },
};
