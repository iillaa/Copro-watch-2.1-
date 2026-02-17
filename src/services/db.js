import Dexie from 'dexie';
import backupService from './backup';
import { encryptString, decryptString } from './crypto'; // IMPORT ADDED

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
function stringifyInWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new ExportWorker();
    
    worker.onmessage = (e) => {
      if (e.data.success) {
        resolve(e.data.json);
      } else {
        reject(new Error(e.data.error));
      }
      worker.terminate(); // Kill worker after job is done to save RAM
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    // Send the massive object to the background
    worker.postMessage({ data });
  });
}

// [FIXED] Split Logic: Increment NOW (Async), Export LATER (Background)
async function triggerBackupCheck() {
  try {
    // 1. IMMEDIATE: Increment counter & save to DB.
    // We await this so the UI updates instantly.
    const triggerType = await backupService.registerChange();

    // 2. BACKGROUND: If backup is due, schedule the heavy export lazily
    if (triggerType) {
      console.log(`[DB] Backup due (${triggerType}). Scheduling export...`);

      const runExport = async () => {
        try {
          await backupService.performAutoExport(async () => await exportData(), triggerType);
        } catch (e) {
          console.warn('[DB] Background export failed', e);
        }
      };

      // Use idle callback for heavy JSON generation
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(runExport, { timeout: 10000 });
      } else {
        setTimeout(runExport, 1000);
      }
    }
  } catch (e) {
    console.error('[DB] Backup trigger error:', e);
  }
}

// 4. Export Global Function (Used by UI and Backup)
// [UPDATED] Now uses Worker to prevent UI Freeze
async function exportData() {
  // A. Gather Data (Must happen on Main Thread)
  const rawData = {
    // [NEW] Metadata allows us to trust the data, not the file system
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
  
  // B. Stringify in Background (No UI Freeze)
  // This replaces "return JSON.stringify(rawData)"
  return await stringifyInWorker(rawData);
}

// 5. The Public API
export const db = {
  async init() {
    const deptCount = await dbInstance.departments.count();
    if (deptCount === 0) {
      console.log('Seeding database (First Run)...');
    }
  },

  // --- WEAPONS (NEW) ---
  async getWeaponHolders() {
    return await dbInstance.weapon_holders.toArray();
  },
  async getWeaponHolder(id) {
    return await dbInstance.weapon_holders.get(Number(id));
  },
  async saveWeaponHolder(holder) {
    const id = await dbInstance.weapon_holders.put(holder);
    await triggerBackupCheck();
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
    await triggerBackupCheck();
  },
  async getWeaponExams() {
    return await dbInstance.weapon_exams.toArray();
  },
  async getWeaponExamsByHolder(holderId) {
    return await dbInstance.weapon_exams.where('holder_id').equals(Number(holderId)).toArray();
  },
  async saveWeaponExam(exam) {
    const id = await dbInstance.weapon_exams.put(exam);

    // Auto-update holder status and review date
    const holder = await dbInstance.weapon_holders.get(Number(exam.holder_id));
    if (holder) {
      holder.status = exam.final_decision;
      if (exam.next_review_date) {
        holder.next_review_date = exam.next_review_date;
      }
      await dbInstance.weapon_holders.put(holder);
    }

    await triggerBackupCheck();
    return { ...exam, id };
  },
  async deleteWeaponExam(id) {
    await dbInstance.weapon_exams.delete(Number(id));
    await triggerBackupCheck();
  },

  // --- WEAPON DEPARTMENTS (NEW) ---
  async getWeaponDepartments() {
    return await dbInstance.weapon_departments.toArray();
  },
  async saveWeaponDepartment(dept) {
    const id = await dbInstance.weapon_departments.put(dept);
    await triggerBackupCheck();
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
    await triggerBackupCheck();
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
    const json = await exportData();
    return await encryptString(password, json);
  },

  async importDataEncrypted(encryptedContent, password) {
    try {
      const decryptedJson = await decryptString(password, encryptedContent);
      // Calls the plain import function below
      return await this.importData(decryptedJson);
    } catch (e) {
      console.error('Decryption failed', e);
      return false;
    }
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
    await triggerBackupCheck(); // [FIX] Awaited
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

      await triggerBackupCheck();
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
    await triggerBackupCheck(); // [FIX] Awaited
    return { ...exam, id };
  },
  async deleteExam(id) {
    await dbInstance.exams.delete(id);
    await triggerBackupCheck(); // [FIX] Awaited
  },

  // --- DEPARTMENTS ---
  async getDepartments() {
    return await dbInstance.departments.toArray();
  },
  async saveDepartment(dept) {
    const id = await dbInstance.departments.put(dept);
    await triggerBackupCheck(); // [FIX] Awaited
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

    await triggerBackupCheck(); // [FIX] Awaited
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
    await triggerBackupCheck(); // [FIX] Awaited
  },

  // --- WATER ---
  async getWaterAnalyses() {
    return await dbInstance.water_analyses.toArray();
  },
  async saveWaterAnalysis(analysis) {
    const id = await dbInstance.water_analyses.put(analysis);
    await triggerBackupCheck(); // [FIX] Awaited
    return { ...analysis, id };
  },
  async deleteWaterAnalysis(id) {
    await dbInstance.water_analyses.delete(id);
    await triggerBackupCheck(); // [FIX] Awaited
  },
  async getWaterDepartments() {
    return await dbInstance.water_departments.toArray();
  },
  async saveWaterDepartment(dept) {
    const id = await dbInstance.water_departments.put(dept);
    await triggerBackupCheck(); // [FIX] Awaited
    return { ...dept, id };
  },
  // 1. Fix for Water Services
  async deleteWaterDepartment(id) {
    const numId = Number(id); // [CRITICAL] Convert once, use everywhere

    // Delete Orphans (Uses numId)
    await dbInstance.water_analyses.where('structure_id').equals(numId).delete();

    // Delete Service (Uses numId)
    await dbInstance.water_departments.delete(numId);
    await triggerBackupCheck(); // [FIX] Awaited
  },

  // --- IMPORT / EXPORT ---
  exportData,

  async importData(jsonString) {
    try {
      const data = JSON.parse(jsonString);
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
  
  // [NEW] JANITOR FUNCTION
  async cleanupOrphans() {
    console.log('🧹 Starting Cleanup...');
    let deletedExams = 0;
    let deletedWater = 0;

    // 1. Clean Exams (Ghost Workers)
    const workerIds = new Set((await dbInstance.workers.toArray()).map((w) => w.id));
    const allExams = await dbInstance.exams.toArray();
    const orphanExamIds = allExams.filter((e) => !workerIds.has(e.worker_id)).map((e) => e.id);

    if (orphanExamIds.length > 0) {
      await dbInstance.exams.bulkDelete(orphanExamIds);
      deletedExams = orphanExamIds.length;
    }

    // 2. Clean Water Logs (Ghost Locations)
    const deptIds = new Set((await dbInstance.departments.toArray()).map((d) => d.id));
    const waterDeptIds = new Set((await dbInstance.water_departments.toArray()).map((d) => d.id));
    const allWater = await dbInstance.water_analyses.toArray();

    const orphanWaterIds = allWater
      .filter((log) => {
        // Rule 1: If it has a department_id, that ID must exist
        if (log.department_id && !deptIds.has(log.department_id)) return true;
        // Rule 2: If it has a structure_id, that ID must exist
        if (log.structure_id && !waterDeptIds.has(log.structure_id)) return true;
        return false;
      })
      .map((l) => l.id);

    if (orphanWaterIds.length > 0) {
      await dbInstance.water_analyses.bulkDelete(orphanWaterIds);
      deletedWater = orphanWaterIds.length;
    }

    await triggerBackupCheck();
    return { exams: deletedExams, water: deletedWater };
  },
};