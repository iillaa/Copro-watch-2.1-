import { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import backupService from '../services/backup';
export default function DiagnosticPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const logEndRef = useRef(null);
  const logsRef = useRef([]);

  // [NEW] Hide/Show logic based on Settings
  const [isVisible, setIsVisible] = useState(
    () => localStorage.getItem('copro_dev_mode') === 'true'
  );

  useEffect(() => {
    const handleDevMode = (e) => {
      setIsVisible(e.detail);
      if (!e.detail) setIsOpen(false); // Close panel if toggled off while open
    };
    window.addEventListener('dev-mode-changed', handleDevMode);
    return () => window.removeEventListener('dev-mode-changed', handleDevMode);
  }, []);

  // Hijack the console to capture logs globally
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const captureLog = (type, ...args) => {
      const message = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);

      setLogs((prev) => {
        // [FIX] Keep only the last 500 logs to prevent memory leaks
        const next = [...prev, `[${timestamp}] [${type.toUpperCase()}] ${message}`].slice(-500);
        logsRef.current = next;
        return next;
      });

      if (type === 'log') originalLog(...args);
      if (type === 'warn') originalWarn(...args);
      if (type === 'error') originalError(...args);
    };

    console.log = (...args) => captureLog('log', ...args);
    console.warn = (...args) => captureLog('warn', ...args);
    console.error = (...args) => captureLog('error', ...args);

    const onWindowError = (event) => {
      captureLog('error', '[WINDOW_ERROR]', event.message, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      });
    };

    const onUnhandledRejection = (event) => {
      captureLog('error', '[UNHANDLED_REJECTION]', event.reason);
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // Developer helper: dump all captured terminal logs from existing DiagnosticPanel
    window.dumpDiagnostics = () => logsRef.current.join('\n');

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      delete window.dumpDiagnostics;
    };
  }, []);

  useEffect(() => {
    if (logEndRef.current) logEndRef.current.scrollIntoView({ behavior: 'smooth' });
  }, [logs, isOpen]);

  const copyLogs = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    alert('Logs copiés dans le presse-papiers !');
  };

  const clearLogs = () => setLogs([]);

  // --- THE MASSIVE HEADLESS STRESS TEST ---
  const runDiagnostics = async () => {
    setIsRunning(true);
    console.log('--- STARTING OMNI-DIAGNOSTIC SEQUENCE ---');
    try {
      // 1. Check Initial State
      console.log('Testing DB API connections...');
      const depts = await db.getDepartments();
      console.log(`Current Departments count: ${depts.length}`);

      // 2. Create Fake Foundation Structures
      console.log('--- CREATING DIAGNOSTIC STRUCTURES ---');
      const fakeDept = await db.saveDepartment({ name: 'DIAG_DEPT_GHOST' });
      // [FIX] saveWorkplace returns a raw ID, not an object
      const fakeWorkplaceId = await db.saveWorkplace({ name: 'DIAG_WORKPLACE_GHOST' });
      const fakeWaterDept = await db.saveWaterDepartment({ name: 'DIAG_WATER_DEPT_GHOST' });
      const fakeWeaponDept = await db.saveWeaponDepartment({ name: 'DIAG_WEAPON_DEPT_GHOST' });
      console.log('Base structures created successfully.');

      // 3. Test Worker & Medical Exam Module
      console.log('--- TESTING WORKER MODULE ---');
      const testWorker = await db.saveWorker({
        full_name: 'GHOST_WORKER_001',
        national_id: '000000000',
        department_id: fakeDept.id,
        workplace_id: fakeWorkplaceId, // [FIX] Passed raw ID directly
        archived: false,
      });
      console.log(`Ghost Worker created: ID ${testWorker.id}`);

      const testExam = await db.saveExam({
        worker_id: testWorker.id,
        exam_date: new Date().toISOString().split('T')[0],
        decision: { status: 'apte' },
      });
      console.log(`Medical Exam saved: ID ${testExam.id}`);

      // 4. Test Weapon Holder Module
      console.log('--- TESTING WEAPON MODULE ---');
      const testWeapon = await db.saveWeaponHolder({
        full_name: 'GHOST_WEAPON_HOLDER',
        national_id: '111111111',
        department_id: fakeWeaponDept.id,
        status: 'pending',
        archived: false,
      });
      console.log(`Ghost Weapon Holder created: ID ${testWeapon.id}`);

      const testWeaponExam = await db.saveWeaponExam({
        holder_id: testWeapon.id,
        exam_date: new Date().toISOString().split('T')[0],
        final_decision: 'apte',
      });
      console.log(`Weapon Exam saved: ID ${testWeaponExam.id}`);

      // 5. Test Water Module
      console.log('--- TESTING WATER MODULE ---');
      const testWater = await db.saveWaterAnalysis({
        structure_id: fakeWaterDept.id,
        sample_date: new Date().toISOString().split('T')[0],
        result: 'potable',
      });
      console.log(`Water Analysis saved: ID ${testWater.id}`);

      // 6. Test Backup Engine
      console.log('--- TESTING BACKUP ENGINE ---');
      const triggerType = await backupService.registerChange();
      console.log(`Backup Trigger Status: [ ${triggerType || 'No threshold reached yet'} ]`);
      const backupStatus = await backupService.getBackupStatus();
      console.log(`Backup Counter: ${backupStatus.counter}/${backupStatus.threshold}`);

      // 7. Cleanup & Cascade Test
      console.log('--- INITIATING CASCADING DELETION (JANITOR) ---');

      await db.deleteWorker(testWorker.id);
      console.log('Ghost Worker deleted. (Cascade should have killed medical exams).');

      await db.deleteWeaponHolder(testWeapon.id);
      console.log('Ghost Weapon Holder deleted. (Cascade should have killed weapon exams).');

      await db.deleteWaterAnalysis(testWater.id);
      console.log('Ghost Water Analysis deleted.');

      // Delete Base Structures
      await db.deleteDepartment(fakeDept.id);
      await db.deleteWorkplace(fakeWorkplaceId); // [FIX] Passing raw ID directly
      await db.deleteWaterDepartment(fakeWaterDept.id);
      await db.deleteWeaponDepartment(fakeWeaponDept.id);
      console.log('Base structures wiped. Database restored to initial state.');

      // 8. Verification
      const finalCheck = await db.getExamsByWorker(testWorker.id);
      if (finalCheck.length === 0) {
        console.log('SUCCESS: Cascade deletion verified. No orphans found.');
      } else {
        console.error(`FAILURE: Found ${finalCheck.length} orphan exams! DB relation broken.`);
      }

      console.log('--- OMNI-DIAGNOSTIC SEQUENCE COMPLETE ---');
    } catch (error) {
      console.error('DIAGNOSTIC SEQUENCE FAILED:', error.stack || error.message);
    } finally {
      setIsRunning(false);
    }
  };

  // [NEW] Return nothing if DEV mode is OFF
  if (!isVisible) return null;

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 9999,
          background: '#000',
          color: '#0f0',
          border: '2px solid #0f0',
          borderRadius: '50%',
          width: '50px',
          height: '50px',
          fontWeight: 'bold',
          cursor: 'pointer',
          boxShadow: '0 0 10px rgba(0,255,0,0.5)',
        }}
      >
        DEV
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: '5%',
            left: '5%',
            width: '90%',
            height: '90%',
            background: '#1e1e1e',
            color: '#00ff00',
            zIndex: 10000,
            borderRadius: '10px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
            border: '1px solid #333',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '15px',
              borderBottom: '1px solid #333',
              background: '#2d2d2d',
              borderRadius: '10px 10px 0 0',
            }}
          >
            <h3 style={{ margin: 0, color: '#fff' }}>Terminal Diagnostic</h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'red',
                color: 'white',
                border: 'none',
                borderRadius: '5px',
                padding: '5px 10px',
                cursor: 'pointer',
              }}
            >
              Fermer
            </button>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '15px',
              fontFamily: 'monospace',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}
          >
            {logs.length === 0 ? (
              <span style={{ color: '#666' }}>En attente de logs...</span>
            ) : (
              logs.map((log, i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: '4px',
                    color:
                      log.includes('[ERROR]') || log.includes('FAILURE')
                        ? '#ff5555'
                        : log.includes('[WARN]')
                        ? '#ffb86c'
                        : '#50fa7b',
                  }}
                >
                  {log}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          <div
            style={{
              padding: '15px',
              borderTop: '1px solid #333',
              background: '#2d2d2d',
              display: 'flex',
              gap: '10px',
              borderRadius: '0 0 10px 10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              onClick={runDiagnostics}
              disabled={isRunning}
              style={{
                background: isRunning ? '#555' : '#bd93f9',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              {isRunning ? 'Exécution...' : '▶ Lancer le Test Intégral'}
            </button>
            <button
              onClick={copyLogs}
              style={{
                background: '#8be9fd',
                color: '#000',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                fontWeight: 'bold',
                cursor: 'pointer',
              }}
            >
              Copier Logs
            </button>
            <button
              onClick={clearLogs}
              style={{
                background: '#444',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '5px',
                cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              Effacer
            </button>
          </div>
        </div>
      )}
    </>
  );
}
