import { useState, useEffect } from 'react';
import { db } from './services/db';
import { hashString } from './services/crypto'; // [NEW]
import backupService from './services/backup';

import Dashboard from './components/Dashboard';
import WorkerList from './components/WorkerList';
import WorkerDetail from './components/WorkerDetail';
import PinLock from './components/PinLock';
import Settings from './components/Settings';
import WaterAnalyses from './components/WaterAnalyses';

import WeaponDashboard from './components/Weapons/WeaponDashboard';
import WeaponList from './components/Weapons/WeaponList';
import WeaponDetail from './components/Weapons/WeaponDetail';

import { FaUsers, FaChartLine, FaCog, FaFlask, FaShieldAlt, FaUserShield } from 'react-icons/fa';

function App() {
  // --- STATE (Original) ---
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedWeaponHolderId, setSelectedWeaponHolderId] = useState(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [waterResetKey, setWaterResetKey] = useState(0);
  const [compactMode, setCompactMode] = useState(true);
  // [FIX] Initialize from Memory (so it stays ON after reload)
  const [forceMobile, setForceMobile] = useState(
    () => localStorage.getItem('copro_force_mobile') === 'true'
  );

  // [FIX] Apply CSS & Save to Memory whenever it changes
  // [FIX] Apply CSS class to <HTML> tag to override global scroll lock
  useEffect(() => {
    if (forceMobile) {
      document.documentElement.classList.add('force-mobile');
    } else {
      document.documentElement.classList.remove('force-mobile');
    }
    localStorage.setItem('copro_force_mobile', forceMobile);
  }, [forceMobile]);

  const [pin, setPin] = useState('0000');

  // [CRITICAL FIX] Emergency Backup on App Close/Pause
  // This ensures that even 1 single unsaved edit is captured when the app is swiped away.
  useEffect(() => {
    const setupLifecycle = async () => {
      try {
        const { App: CapApp } = await import('@capacitor/app');
        await CapApp.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive) {
            console.log('[App] App moving to background. Forcing emergency backup check...');
            const status = await backupService.getBackupStatus();
            // If there is even 1 unsaved edit, force the export immediately
            if (status.counter > 0) {
               console.log(`[App] ${status.counter} unsaved changes detected. Forcing export before suspend...`);
               // Bypass threshold and force an export
               await backupService.performAutoExport(async () => await db.exportData(), 'COUNTER');
            }
          }
        });
      } catch (e) {
        console.warn('[App] Capacitor App Plugin not available or failed to load.');
      }
    };
    setupLifecycle();
  }, []);

  // --- ENGINE STARTUP (The Only Change) ---
  const initApp = async () => {
    try {
      setLoading(true);
      console.log('[App] Starting initialization...');

      // 1. Start the Database
      console.log('[App] Initializing database...');
      await db.init();
      console.log('[App] Database initialized');

      // 2. Start Backup Service (Explicitly pass DB here to fix Race Condition)
      console.log('[App] Initializing backup service...');
      await backupService.init(db); // [FIXED]
      try {
        await backupService.checkAndAutoImport(db);
        console.log('[App] Auto-import check completed');
      } catch (e) {
        console.warn('Auto-import check failed:', e);
      }

      // 3. Load User Settings
      const settings = await db.getSettings();
      if (settings.pin) {
        setPin(settings.pin);
      } else {
        // Migration: If no PIN in DB, use default "0011" hashed
        setPin('0000');
      }
      console.log('[App] Initialization complete');
    } catch (error) {
      console.error('App Initialization Failed:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  // [NEW] Auto-Lock Timer (Security)
  useEffect(() => {
    let timer;
    const TIMEOUT_MS = 5 * 60 * 1000; // 5 Minutes

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      // Only set timer if the app is currently UNLOCKED
      if (!isLocked) {
        timer = setTimeout(() => {
          console.log('Session timed out. Locking...');
          setIsLocked(true);
        }, TIMEOUT_MS);
      }
    };

    // Listen for activity
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('touchstart', resetTimer);

    // Start initial timer
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [isLocked]); // Re-run when lock state changes

  // --- NAVIGATION ---
  const navigateToWorker = (id) => {
    setSelectedWorkerId(id);
    setView('worker-detail');
  };

  const navigateToWeaponHolder = (id) => {
    setSelectedWeaponHolderId(id);
    setView('weapon-detail');
  };

  // Helper to validate PIN (Supports both Old Plain "0011" and New Hashed PINs)
  const checkPin = async (inputPin) => {
    // 1. If stored PIN is 4 digits, it's an OLD plain PIN
    if (pin.length === 4) {
      return inputPin === pin;
    }
    // 2. If stored PIN is long (64 chars), it's a NEW hashed PIN
    if (pin.length === 64) {
      const inputHash = await hashString(inputPin);
      return inputHash === pin;
    }
    // Fallback
    return false;
  };

  // --- LOADING SCREEN ---
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          width: '100%',
          flexDirection: 'column',
          backgroundColor: 'var(--bg-app)',
        }}
      >
        <div className="loading-spinner"></div>
        <p style={{ marginTop: '1rem', color: 'var(--text-main)' }}>Chargement...</p>
      </div>
    );
  }

  // --- PIN LOCK ---
  if (isLocked) {
    return (
      <PinLock
        onCheckPin={checkPin} // [NEW] Pass the validator
        onUnlock={() => setIsLocked(false)}
      />
    );
  }

  // --- MAIN UI (Original Layout Restored) ---
  return (
    <div className={`app-shell ${isSidebarOpen ? '' : 'sidebar-closed'}`}>
      {/* SIDEBAR */}
      <aside className="sidebar no-print">
        <div className="brand">
          <span className="brand-text">𝓒𝓸𝓹𝓻𝓸</span>
          <span className="brand-icon">🧪</span>
          <span className="brand-text">𝓦𝓪𝓽𝓬𝓱</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div
            className={`nav-item ${view === 'dashboard' ? 'active' : ''}`}
            onClick={() => setView('dashboard')}
            title="Tableau de bord"
          >
            <FaChartLine className="nav-icon" />
            <span className="nav-text">Tableau de bord</span>
          </div>
          <div
            className={`nav-item ${view === 'workers' || view === 'worker-detail' ? 'active' : ''}`}
            onClick={() => {
              setView('workers');
              setSelectedWorkerId(null);
            }}
            title="Travailleurs"
          >
            <FaUsers className="nav-icon" />
            <span className="nav-text">Travailleurs</span>
          </div>
          <div
            className={`nav-item ${view === 'water-analyses' ? 'active' : ''}`}
            onClick={() => {
              setView('water-analyses');
              setWaterResetKey((prev) => prev + 1);
            }}
            title="Analyses d'eau"
          >
            <FaFlask className="nav-icon" />
            <span className="nav-text">Analyses d'eau</span>
          </div>

          <div style={{ margin: '0.5rem 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}></div>

          <div
            className={`nav-item ${view === 'weapons-dashboard' ? 'active' : ''}`}
            onClick={() => setView('weapons-dashboard')}
            title="Tableau Armes"
          >
            <FaShieldAlt className="nav-icon" />
            <span className="nav-text">Tableau Armes</span>
          </div>
          <div
            className={`nav-item ${
              view === 'weapons-list' || view === 'weapon-detail' ? 'active' : ''
            }`}
            onClick={() => {
              setView('weapons-list');
              setSelectedWeaponHolderId(null);
            }}
            title="Détenteurs Armes"
          >
            <FaUserShield className="nav-icon" />
            <span className="nav-text">Détenteurs Armes</span>
          </div>

          <div
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => setView('settings')}
            title="Paramètres"
          >
            <FaCog className="nav-icon" />
            <span className="nav-text">Paramètres</span>
          </div>
        </nav>

        {/* CREDITS: Restored to 1.1 as requested */}
        <div className="credit" style={{ marginTop: 'auto' }}>
          <div className="credit-title">Développé par</div>
          <div className="credit-author">Dr Kibeche Ali Dia Eddine</div>
          <div className="credit-version">2.1</div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        <div className="container">
          <button
            aria-label="Toggle sidebar"
            className="btn btn-sm no-print toggle-sidebar"
            style={{ marginBottom: '2.5rem' }}
            onClick={() => setSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? 'Masquer' : 'Afficher'}
          </button>

          {view === 'dashboard' && (
            <Dashboard
              onNavigateWorker={navigateToWorker}
              compactMode={compactMode}
              forceMobile={forceMobile} // <--- [ADD THIS LINE]
            />
          )}
          {view === 'workers' && (
            <WorkerList
              onNavigateWorker={navigateToWorker}
              compactMode={compactMode} // <--- [NEW] Pass Prop
            />
          )}
          {view === 'worker-detail' && selectedWorkerId && (
            <WorkerDetail
              workerId={selectedWorkerId}
              onBack={() => setView('workers')}
              compactMode={compactMode} // <--- [NEW] Pass Prop
            />
          )}
          {view === 'water-analyses' && (
            <WaterAnalyses
              key={waterResetKey}
              compactMode={compactMode} // <--- [NEW] Pass Prop
            />
          )}

          {view === 'weapons-dashboard' && (
            <WeaponDashboard
              onNavigateWeaponHolder={navigateToWeaponHolder}
              compactMode={compactMode}
              forceMobile={forceMobile}
            />
          )}
          {view === 'weapons-list' && (
            <WeaponList onNavigateWeaponHolder={navigateToWeaponHolder} compactMode={compactMode} />
          )}
          {view === 'weapon-detail' && selectedWeaponHolderId && (
            <WeaponDetail
              holderId={selectedWeaponHolderId}
              onBack={() => setView('weapons-list')}
              compactMode={compactMode}
            />
          )}

          {view === 'settings' && (
            <Settings
              currentPin={pin}
              onPinChange={setPin}
              compactMode={compactMode}
              setCompactMode={setCompactMode}
              forceMobile={forceMobile} // <--- [ADD THIS LINE]
              setForceMobile={setForceMobile} // <--- [ADD THIS LINE]
            />
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
