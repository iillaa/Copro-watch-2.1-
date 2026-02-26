import { db } from '../services/db';
import backupService from '../services/backup';

async function runTests() {
  console.log('--- STARTING OMNI-DIAGNOSTIC SEQUENCE ---');
  
  try {
    // 1. Test DB Init
    console.log('Testing DB API connections...');
    await db.init();
    const depts = await db.getDepartments();
    console.log(`Current Departments count: ${depts.length}`);

    // 2. Test Backup Init
    console.log('Initializing backup service...');
    await backupService.init(db);
    const status = await backupService.getBackupStatus();
    console.log(`Initial Backup Counter: ${status.counter}/${status.threshold}`);

    // 3. Test Change Registration
    console.log('Registering a ghost change...');
    await db.saveWorker({
      full_name: 'Test Ghost',
      national_id: 'GHOST-001',
      department_id: depts[0]?.id || 1,
      created_at: new Date().toISOString()
    });
    
    const newStatus = await backupService.getBackupStatus();
    console.log(`New Backup Counter: ${newStatus.counter}`);

    // 4. Test Orphan Cleanup
    console.log('Running Janitor (Orphan Cleanup)...');
    const cleanupResult = await db.cleanupOrphans();
    console.log(`Cleanup result: Deleted ${cleanupResult.exams} exams, ${cleanupResult.water} water logs.`);

    console.log('SUCCESS: Diagnostic sequence complete.');
  } catch (err) {
    console.error('DIAGNOSTIC FAILED:', err);
  }
}

// In a real browser/test environment this would run
// runTests();
