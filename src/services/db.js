import Dexie from 'dexie';
import backupService from './backup.js';
import { encryptString, decryptString, hashString } from './crypto.js';
import { logic } from './logic.js';

// [NEW] WORKER IMPORT (Vite Syntax)
import ExportWorker from '../workers/export.worker?worker';

// 1. Define the Database
class CoproDatabase extends Dexie {
  constructor() {
    super('CoproWatchDB');

    this.version(1).stores({
      workers: '++id, full_name, national_id, department_id, archived',
      departments: '++id',
      workplaces: '++id',
      exams: '++id, worker_id, exam_date',
      water_analyses: '++id, sample_date',
      water_departments: '++id',
      settings: 'key',
    });

    this.version(2).stores({
      workers: '++id, full_name, national_id, department_id, archived',
      departments: '++id',
      workplaces: '++id',
      exams: '++id, worker_id, exam_date',
      water_analyses: '++id, sample_date, department_id, structure_id',
      water_departments: '++id',
      settings: 'key',
    });

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

    this.version(4).stores({
      workers: '++id, full_name, full_name_ar, job_role_ar, national_id, department_id, archived',
      weapon_holders:
        '++id, full_name, full_name_ar, job_function_ar, national_id, department_id, status, next_review_date, archived',
    });
  }
}

const dbInstance = new CoproDatabase();

// --- WORKER HELPER ---
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
        if (e.data.success) resolve(e.data.json);
        else reject(new Error(e.data.error || 'Worker execution failed'));
        worker.terminate();
      };

      worker.onerror = (err) => {
        clearTimeout(timeout);
        reject(new Error(err.message || 'Worker Thread Crash'));
        worker.terminate();
      };

      worker.postMessage({ data });
    });
  } catch (e) {
    console.warn('[DB] Background stringify failed, fallback...', e);
    return JSON.stringify(data);
  }
}

let lastExportDataStr = null;

// [REFINED] Internal trigger for auto-backups
async function triggerBackupCheck() {
  try {
    const triggerType = await backupService.registerChange();
    if (triggerType) {
      console.log(`[DB] Backup due (${triggerType}). Executing export...`);
      try {
        await backupService.performAutoExport(async () => {
          const dataStr = await exportDataRaw();
          if (dataStr === lastExportDataStr) return null;
          lastExportDataStr = dataStr;
          
          const settings = await db.getSettings();
          const pw = settings.backup_password || '00000000'; // Seamless fallback
          return await encryptString(pw, dataStr);
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
    meta: { version: '1.2', exported_at: new Date().getTime() },
    // --- [NEW] APP SETTINGS (NON-SENSITIVE) ---
    app_settings: {
      ocr_smart_dict: localStorage.getItem('ocr_smart_dict'),
      ocr_grid_presets: localStorage.getItem('ocr_grid_presets'),
      copro_app_lang: localStorage.getItem('copro_app_lang'),
      copro_force_mobile: localStorage.getItem('copro_force_mobile')
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

// Global Export Function
async function exportData(password = null) {
  const rawJson = await exportDataRaw();
  const settings = await db.getSettings();
  const pwToUse = password || settings.backup_password || '00000000';
  console.log(`[DB EXPORT] Encrypting with ${password ? 'custom' : 'stored'} password`);
  return await encryptString(pwToUse, rawJson);
}

// The Public API
export const db = {
  async init() {
    await dbInstance.open();
  },

  setSessionPin(pin) {
    console.log('[DB] Session PIN updated');
  },

  // --- SETTINGS ---
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

  // --- WORKERS ---
  async getWorkers() { return await dbInstance.workers.toArray(); },
  async getWorker(id) { return await dbInstance.workers.get(Number(id)); },
  async saveWorker(worker) {
    const id = await dbInstance.workers.put(worker);
    triggerBackupCheck();
    return { ...worker, id };
  },
  async deleteWorker(id) {
    const numId = Number(id);
    await dbInstance.transaction('rw', dbInstance.exams, dbInstance.workers, async () => {
      await dbInstance.exams.where('worker_id').equals(numId).delete();
      await dbInstance.workers.delete(numId);
    });
    triggerBackupCheck();
  },

  // --- EXAMS ---
  async getExams() { return await dbInstance.exams.toArray(); },
  async getExamsByWorker(workerId) {
    return await dbInstance.exams.where('worker_id').equals(Number(workerId)).toArray();
  },
  async saveExam(exam) {
    let result;
    await dbInstance.transaction('rw', dbInstance.exams, dbInstance.workers, async () => {
      const id = await dbInstance.exams.put(exam);
      const worker = await dbInstance.workers.get(Number(exam.worker_id));
      if (worker) {
        const exams = await dbInstance.exams.where('worker_id').equals(worker.id).toArray();
        const statusUpdate = logic.recalculateWorkerStatus(exams);
        await dbInstance.workers.put({ ...worker, ...statusUpdate });
      }
      result = { ...exam, id };
    });
    triggerBackupCheck();
    return result;
  },
  async deleteExam(id) {
    const exam = await dbInstance.exams.get(id);
    await dbInstance.exams.delete(id);
    if (exam && exam.worker_id) {
      const worker = await dbInstance.workers.get(Number(exam.worker_id));
      if (worker) {
        const exams = await dbInstance.exams.where('worker_id').equals(worker.id).toArray();
        const statusUpdate = logic.recalculateWorkerStatus(exams);
        await dbInstance.workers.put({ ...worker, ...statusUpdate });
      }
    }
    triggerBackupCheck();
  },

  // --- DEPARTMENTS ---
  async getDepartments() { return await dbInstance.departments.toArray(); },
  async saveDepartment(dept) {
    const id = await dbInstance.departments.put(dept);
    triggerBackupCheck();
    return { ...dept, id };
  },
  async deleteDepartment(id) {
    const numId = Number(id);
    await dbInstance.workers.where('department_id').equals(numId).delete();
    await dbInstance.water_analyses.where('department_id').equals(numId).delete();
    await dbInstance.departments.delete(numId);
    triggerBackupCheck();
  },

  // --- WORKPLACES ---
  async getWorkplaces() { return await dbInstance.workplaces.toArray(); },
  async saveWorkplace(wp) {
    const item = typeof wp === 'string' ? { name: wp, certificate_text: '' } : wp;
    return dbInstance.workplaces.add(item);
  },
  async deleteWorkplace(id) {
    await dbInstance.workplaces.delete(id);
    triggerBackupCheck();
  },

  // --- WATER ---
  async getWaterAnalyses() { return await dbInstance.water_analyses.toArray(); },
  async saveWaterAnalysis(a) {
    const id = await dbInstance.water_analyses.put(a);
    triggerBackupCheck();
    return { ...a, id };
  },
  async deleteWaterAnalysis(id) {
    await dbInstance.water_analyses.delete(id);
    triggerBackupCheck();
  },
  async getWaterDepartments() { return await dbInstance.water_departments.toArray(); },
  async saveWaterDepartment(d) {
    const id = await dbInstance.water_departments.put(d);
    triggerBackupCheck();
    return { ...d, id };
  },
  async deleteWaterDepartment(id) {
    const numId = Number(id);
    await dbInstance.water_analyses.where('structure_id').equals(numId).delete();
    await dbInstance.water_departments.delete(numId);
    triggerBackupCheck();
  },

  // --- WEAPONS ---
  async getWeaponHolders() { return await dbInstance.weapon_holders.toArray(); },
  async getWeaponHolder(id) { return await dbInstance.weapon_holders.get(Number(id)); },
  async saveWeaponHolder(h) {
    const id = await dbInstance.weapon_holders.put(h);
    triggerBackupCheck();
    return { ...h, id };
  },
  async deleteWeaponHolder(id) {
    const numId = Number(id);
    await dbInstance.transaction('rw', dbInstance.weapon_exams, dbInstance.weapon_holders, async () => {
      await dbInstance.weapon_exams.where('holder_id').equals(numId).delete();
      await dbInstance.weapon_holders.delete(numId);
    });
    triggerBackupCheck();
  },
  async getWeaponExams() { return await dbInstance.weapon_exams.toArray(); },
  async getWeaponExamsByHolder(holderId) {
    return await dbInstance.weapon_exams.where('holder_id').equals(Number(holderId)).toArray();
  },
  async saveWeaponExam(e) {
    let result;
    await dbInstance.transaction('rw', dbInstance.weapon_exams, dbInstance.weapon_holders, async () => {
      const id = await dbInstance.weapon_exams.put(e);
      const holder = await dbInstance.weapon_holders.get(Number(e.holder_id));
      if (holder) {
        const exams = await dbInstance.weapon_exams.where('holder_id').equals(holder.id).toArray();
        const statusUpdate = logic.recalculateWeaponHolderStatus(exams);
        await dbInstance.weapon_holders.put({ ...holder, ...statusUpdate });
      }
      result = { ...e, id };
    });
    triggerBackupCheck();
    return result;
  },
  async deleteWeaponExam(id) {
    await dbInstance.weapon_exams.delete(Number(id));
    triggerBackupCheck();
  },
  async getWeaponDepartments() { return await dbInstance.weapon_departments.toArray(); },
  async saveWeaponDepartment(d) {
    const id = await dbInstance.weapon_departments.put(d);
    triggerBackupCheck();
    return { ...d, id };
  },
  async deleteWeaponDepartment(id) {
    const numId = Number(id);
    await dbInstance.weapon_holders.where('department_id').equals(numId).delete();
    await dbInstance.weapon_departments.delete(numId);
    triggerBackupCheck();
  },

  // --- BATCH MOVE HELPERS ---
  async moveWorkers(ids, newDeptId) {
    const numIds = Array.from(ids).map(Number);
    await dbInstance.workers.where('id').anyOf(numIds).modify({ department_id: Number(newDeptId) });
    triggerBackupCheck();
  },

  async moveWeaponHolders(ids, newDeptId) {
    const numIds = Array.from(ids).map(Number);
    await dbInstance.weapon_holders.where('id').anyOf(numIds).modify({ department_id: Number(newDeptId) });
    triggerBackupCheck();
  },

  // --- IMPORT / EXPORT ---
  exportData,
  exportDataEncrypted: exportData,

  async importData(jsonString, password = null) {
    if (!jsonString) return false;
    try {
      let data;
      try { data = JSON.parse(jsonString); } catch (e) { return false; }

      const isEncrypted = data.method && data.data && (data.method === 'aes-gcm' || data.method === 'xor');

      if (isEncrypted) {
        const settings = await this.getSettings();
        console.log('[DB IMPORT] Encrypted file detected');
        let decrypted = null;
        
        if (password) {
          try {
            decrypted = await decryptString(password, jsonString);
            console.log('[DB IMPORT] SUCCESS: Provided password worked!');
          } catch (e) { console.warn('[DB IMPORT] Provided password failed'); }
        }
        
        if (!decrypted && settings.backup_password) {
          try {
            decrypted = await decryptString(settings.backup_password, jsonString);
            console.log('[DB IMPORT] SUCCESS: Stored backup password worked!');
          } catch (e) { console.warn('[DB IMPORT] Stored backup password failed'); }
        }
        
        if (!decrypted) {
          try {
            decrypted = await decryptString('00000000', jsonString);
            console.log('[DB IMPORT] SUCCESS: Default password worked!');
          } catch (e) { console.warn('[DB IMPORT] Default password failed'); }
        }
        
        if (!decrypted) return { error: 'NEED_PASSWORD', encryptedData: jsonString };
        data = JSON.parse(decrypted);
      }

      await dbInstance.transaction('rw', dbInstance.tables, async () => {
        if (data.departments) await dbInstance.departments.bulkPut(data.departments);
        if (data.workplaces) await dbInstance.workplaces.bulkPut(data.workplaces);
        if (data.workers) await dbInstance.workers.bulkPut(data.workers);
        if (data.exams) await dbInstance.exams.bulkPut(data.exams);
        if (data.water_analyses) await dbInstance.water_analyses.bulkPut(data.water_analyses);
        if (data.water_departments) await dbInstance.water_departments.bulkPut(data.water_departments);
        if (data.weapon_holders) await dbInstance.weapon_holders.bulkPut(data.weapon_holders);
        if (data.weapon_exams) await dbInstance.weapon_exams.bulkPut(data.weapon_exams);
        if (data.weapon_departments) await dbInstance.weapon_departments.bulkPut(data.weapon_departments);
      });

      // --- [NEW] RESTORE APP SETTINGS ---
      if (data.app_settings) {
        console.log('[DB IMPORT] Restoring App Settings & OCR Memory...');
        const s = data.app_settings;
        if (s.ocr_smart_dict) localStorage.setItem('ocr_smart_dict', s.ocr_smart_dict);
        if (s.ocr_grid_presets) localStorage.setItem('ocr_grid_presets', s.ocr_grid_presets);
        if (s.copro_app_lang) localStorage.setItem('copro_app_lang', s.copro_app_lang);
        if (s.copro_force_mobile) localStorage.setItem('copro_force_mobile', s.copro_force_mobile);
      }

      return true;
    } catch (e) {
      console.error('Import failed', e);
      return false;
    }
  },

  async cleanupOrphans() {
    console.log('🧹 Starting Full Database Cleanup...');
    let deletedExams = 0;
    let deletedWater = 0;
    let deletedWeaponExams = 0;
    let deletedWeaponHolders = 0;
    let deletedWorkers = 0;

    const [allDepts, allWaterDepts, allWeaponDepts, allWorkers, allWeaponHolders] = await Promise.all([
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

    // 1. Clean Exams
    const allExams = await dbInstance.exams.toArray();
    const orphanExamIds = allExams.filter(e => !workerIds.has(Number(e.worker_id))).map(e => e.id);
    if (orphanExamIds.length > 0) {
      await dbInstance.exams.bulkDelete(orphanExamIds);
      deletedExams = orphanExamIds.length;
    }

    // 2. Clean Workers (Ghost Depts)
    const orphanWorkerIds = allWorkers.filter(w => w.department_id && !deptIds.has(Number(w.department_id))).map(w => w.id);
    if (orphanWorkerIds.length > 0) {
      for (const id of orphanWorkerIds) await this.deleteWorker(id);
      deletedWorkers = orphanWorkerIds.length;
    }

    // 3. Clean Water Logs
    const allWater = await dbInstance.water_analyses.toArray();
    const orphanWaterIds = allWater.filter(log => {
      const dId = Number(log.department_id);
      const sId = Number(log.structure_id);
      return !( (dId && deptIds.has(dId)) || (sId && waterDeptIds.has(sId)) || (dId && waterDeptIds.has(dId)) );
    }).map(l => l.id);
    if (orphanWaterIds.length > 0) {
      await dbInstance.water_analyses.bulkDelete(orphanWaterIds);
      deletedWater = orphanWaterIds.length;
    }

    // 4. Clean Weapon Exams
    const allWExams = await dbInstance.weapon_exams.toArray();
    const orphanWExamIds = allWExams.filter(e => !weaponHolderIds.has(Number(e.holder_id))).map(e => e.id);
    if (orphanWExamIds.length > 0) {
      await dbInstance.weapon_exams.bulkDelete(orphanWExamIds);
      deletedWeaponExams = orphanWExamIds.length;
    }

    // 5. Clean Weapon Holders
    const orphanWHolderIds = allWeaponHolders.filter(h => h.department_id && !weaponDeptIds.has(Number(h.department_id))).map(h => h.id);
    if (orphanWHolderIds.length > 0) {
      for (const id of orphanWHolderIds) await this.deleteWeaponHolder(id);
      deletedWeaponHolders = orphanWHolderIds.length;
    }

    triggerBackupCheck();
    return { exams: deletedExams, water: deletedWater, weaponExams: deletedWeaponExams, weaponHolders: deletedWeaponHolders, workers: deletedWorkers };
  },
};
