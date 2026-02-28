import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useToast } from './components/Toast';
import { db } from './services/db';
import { hashString } from './services/crypto'; // [NEW]
import DiagnosticPanel from './components/DiagnosticPanel';
import ErrorBoundary from './components/ErrorBoundary';
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

// [STRATEGY] Lazy load OCR Modal - NOT included in main bundle
const UniversalOCRModal = lazy(() => import('./components/UniversalOCRModal'));

// [FIX] Move these variables OUTSIDE the function to act as a global singleton
let isAppListenerInitialized = false;
let globalBackupLock = false;

function App() {
  // --- STATE (Original) ---
  const { showToast, ToastContainer } = useToast();
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null); // [NEW] Catch startup errors
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedWeaponHolderId, setSelectedWeaponHolderId] = useState(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [waterResetKey, setWaterResetKey] = useState(0);
  const [compactMode, setCompactMode] = useState(true);
  // [OCR] State for lazy-loaded OCR Modal
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [ocrTargetMode, setOcrTargetMode] = useState('worker'); // 'worker' or 'weapon'
  const [departments, setDepartments] = useState([]); // For OCR Modal
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

  // [NEW] Touch Swipe Gestures for Tablet
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    
    // Swipe left to close, Swipe right to open
    if (isLeftSwipe && isSidebarOpen) setSidebarOpen(false);
    if (isRightSwipe && !isSidebarOpen) setSidebarOpen(true);
  };

  // [CRITICAL FIX] Emergency Backup on App Close/Pause
  // This ensures that even 1 single unsaved edit is captured when the app is swiped away.
  useEffect(() => {
    const setupLifecycle = async () => {
      // [FIX] If a listener already exists, do not create another one
      if (isAppListenerInitialized) return;

      try {
        const { App: CapApp } = await import('@capacitor/app');

        // Ensure a clean slate
        await CapApp.removeAllListeners();

        await CapApp.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive) {
            // [FIX] Throttle Lock: Ignore duplicate events firing within 2 seconds
            if (globalBackupLock) return;
            globalBackupLock = true;

            console.log('[App] App moving to background. Forcing emergency backup check...');
            const status = await backupService.getBackupStatus();

            if (status.counter > 0) {
              console.log(`[App] ${status.counter} unsaved changes detected. Forcing export...`);
              await backupService.performAutoExport(async () => await db.exportData(), 'COUNTER');
            }

            // Release lock after delay
            setTimeout(() => {
              globalBackupLock = false;
            }, 2000);
          }
        });

        isAppListenerInitialized = true;
        console.log('[App] Lifecycle singleton initialized.');
      } catch (e) {
        console.warn('[App] Capacitor App Plugin not available.');
      }
    };

    setupLifecycle();

    // Note: We don't remove the listener on unmount anymore because we want
    // it to persist as a singleton across React's development remounts.
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
        const importResult = await backupService.checkAndAutoImport(db);
        
        // Handle case where auto-import found a backup but it needs a different password
        if (importResult && importResult.reason === 'NEED_PASSWORD') {
          console.log('[App] Auto-import requires a password');
          let result = importResult;
          while (result && (result.error === 'NEED_PASSWORD' || result.reason === 'NEED_PASSWORD')) {
            const pw = prompt(`Une sauvegarde plus récente (${importResult.source}) a été trouvée mais elle est protégée par un autre PIN. Entrez le PIN ou mot de passe :`);
            if (pw === null) break; // User cancelled
            if (!pw.trim()) continue;
            
            const ok = await db.importData(importResult.encryptedData, pw);
            if (ok === true) {
              console.log('[App] Auto-import successful after manual password entry');
              // [NEW] Tell backup service we've imported this file
              try {
                const realDate = backupService.getRealDate({ text: importResult.encryptedData });
                await backupService.setLastImported(realDate);
              } catch (e) {
                console.warn('Failed to update lastImported:', e);
              }
              break;
            } else {
              result = ok; // Could be error object again
            }
          }
        }
        console.log('[App] Auto-import check completed');
      } catch (e) {
        console.warn('Auto-import check failed:', e);
      }

      // 3. Load User Settings
      const settings = await db.getSettings();
      if (settings.pin) {
        setPin(settings.pin);
      }

      // 4. Load Departments for OCR Modal
      const depts = await db.getDepartments();
      setDepartments(depts);
      console.log('[App] Initialization complete');
    } catch (error) {
      console.error('App Initialization Failed:', error);
      setInitError(error.message || 'Erreur inconnue lors du démarrage.');
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

  // Helper to validate PIN (Supports Old Plain, and New Secure Hashed PINs)
  const checkPin = async (inputPin) => {
    // 1. If stored PIN is 4 digits, it's an OLD plain PIN (pre-hashing update)
    if (pin.length === 4) {
      return inputPin === pin;
    }

    // 2. Validation with current Hashing logic (uses internal pepper in crypto.js)
    const inputHash = await hashString(inputPin);
    if (inputHash === pin) return true;

    // PIN is invalid
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

  // --- ERROR SCREEN ---
  if (initError) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100%',
          width: '100%',
          flexDirection: 'column',
          backgroundColor: '#fee2e2',
          color: '#b91c1c',
          padding: '20px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h3>Erreur au démarrage</h3>
        <p>{initError}</p>
        <button
          className="btn btn-primary"
          style={{ marginTop: '20px' }}
          onClick={() => window.location.reload()}
        >
          Réessayer
        </button>
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
    <ErrorBoundary>
      <div 
        className={`app-shell ${isSidebarOpen ? '' : 'sidebar-closed'}`}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <ToastContainer />
      <DiagnosticPanel />
      {/* =========================================
          PREMIUM SIDEBAR (PIXEL-PERFECT PROPORTIONS)
          ========================================= */}
      <aside 
        className="sidebar no-print" 
        style={{ 
          width: isSidebarOpen ? '260px' : '70px',
          transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          background: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          height: '100vh',
          overflow: 'hidden',
          padding: 0
        }}
      >
        {/* 1. THE HEADER */}
        <div 
          style={{ 
            padding: isSidebarOpen ? '1.5rem 1.25rem' : '1.5rem 0', 
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: isSidebarOpen ? 'flex-start' : 'center',
            alignItems: 'center',
            gap: isSidebarOpen ? '12px' : '0',
            transition: 'all 0.3s ease',
            height: '85px', // Fixed height to prevent jumping
            boxSizing: 'border-box'
          }}
        >
          {/* Shield Logo */}
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, var(--primary) 0%, #0284c7 100%)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            boxShadow: '0 4px 10px rgba(14, 165, 233, 0.3)', flexShrink: 0
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
              <path d="M12 8v8"></path><path d="M8 12h8"></path>
            </svg>
          </div>

          {isSidebarOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap' }}>
              <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, letterSpacing: '-0.5px', color: '#0f172a', lineHeight: 1.1 }}>
                Medi<span style={{ color: 'var(--primary)' }}>Watch</span>
              </h1>
              <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                Prévention & Aptitude
              </span>
            </div>
          )}
        </div>

        {/* 2. THE NAVIGATION LINKS */}
        <nav style={{ 
          padding: isSidebarOpen ? '1.5rem 1rem' : '1.5rem 0',
          display: 'flex', flexDirection: 'column', 
          gap: isSidebarOpen ? '0.25rem' : '0.5rem', 
          flex: 1, 
          minHeight: 0,
          overflowY: 'auto', 
          overflowX: 'hidden',
          alignItems: isSidebarOpen ? 'stretch' : 'center',
          justifyContent: 'flex-start'
        }}>
          
          {(() => {
            const getBtnStyle = (isActive) => ({
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: isSidebarOpen ? 'flex-start' : 'center',
              padding: isSidebarOpen ? '0.75rem 1rem' : '0', 
              borderRadius: '10px', 
              background: isActive ? 'var(--primary-light)' : 'transparent',
              color: isActive ? 'var(--primary)' : '#64748b', 
              border: 'none', 
              cursor: 'pointer', 
              width: isSidebarOpen ? '100%' : '46px', 
              height: isSidebarOpen ? 'auto' : '46px',
              marginTop: 0,
              marginBottom: 0,
              marginLeft: 0,
              marginRight: 0,
              transition: 'background 0.2s, color 0.2s',
              flexShrink: 0
            });

            return (
              <>
                {/* --- COPROCULTURE --- */}
                {isSidebarOpen && <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', margin: '0.5rem 0 0.5rem 0.5rem', letterSpacing: '1px' }}>Coproculture</div>}
                
                <button className={`nav-item ${view === 'dashboard' ? 'active' : ''}`} onClick={() => setView('dashboard')} style={getBtnStyle(view === 'dashboard')} title="Bilan Copro">
                  <div className="nav-icon" style={{ display: 'flex' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"></rect><rect x="14" y="3" width="7" height="5" rx="1"></rect><rect x="14" y="12" width="7" height="9" rx="1"></rect><rect x="3" y="16" width="7" height="5" rx="1"></rect></svg></div>
                  {isSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>Bilan Copro</span>}
                </button>

                <button className={`nav-item ${view === 'workers' || view === 'worker-detail' ? 'active' : ''}`} onClick={() => { setView('workers'); setSelectedWorkerId(null); }} style={getBtnStyle(view === 'workers' || view === 'worker-detail')} title="Registre Copro">
                  <div className="nav-icon" style={{ display: 'flex' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg></div>
                  {isSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>Registre Copro</span>}
                </button>

                {/* --- SANITAIRE --- */}
                {isSidebarOpen && <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', margin: '1.5rem 0 0.5rem 0.5rem', letterSpacing: '1px' }}>Sanitaire</div>}
                
                <button className={`nav-item ${view === 'water-analyses' ? 'active' : ''}`} onClick={() => { setView('water-analyses'); setWaterResetKey(prev => prev + 1); }} style={getBtnStyle(view === 'water-analyses')} title="Analyses d'Eau">
                  <div className="nav-icon" style={{ display: 'flex' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path></svg></div>
                  {isSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>Analyses d'Eau</span>}
                </button>

                {/* --- PORT D'ARME --- */}
                {isSidebarOpen && <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', margin: '1.5rem 0 0.5rem 0.5rem', letterSpacing: '1px' }}>Port d'Arme</div>}
                
                <button className={`nav-item ${view === 'weapons-dashboard' ? 'active' : ''}`} onClick={() => setView('weapons-dashboard')} style={getBtnStyle(view === 'weapons-dashboard')} title="Bilan Armes">
                  <div className="nav-icon" style={{ display: 'flex' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div>
                  {isSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>Bilan Armes</span>}
                </button>

                <button className={`nav-item ${view === 'weapons-list' || view === 'weapon-detail' ? 'active' : ''}`} onClick={() => { setView('weapons-list'); setSelectedWeaponHolderId(null); }} style={getBtnStyle(view === 'weapons-list' || view === 'weapon-detail')} title="Détenteurs d'Armes">
                  <div className="nav-icon" style={{ display: 'flex' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><circle cx="12" cy="11" r="3"></circle></svg></div>
                  {isSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>Détenteurs d'Armes</span>}
                </button>

                {/* --- SETTINGS (Pushed to bottom of nav with marginTop: auto) --- */}
                <button 
                  className={`nav-item ${view === 'settings' ? 'active' : ''}`} 
                  onClick={() => setView('settings')} 
                  style={{...getBtnStyle(view === 'settings'), marginTop: 'auto'}} 
                  title="Paramètres"
                >
                  <div className="nav-icon" style={{ display: 'flex' }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></div>
                  {isSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}>Paramètres</span>}
                </button>
              </>
            );
          })()}
        </nav>
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
              compactMode={compactMode}
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
            <WeaponList 
              onNavigateWeaponHolder={navigateToWeaponHolder} 
              compactMode={compactMode} 
            />
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

      {/* [OCR] Lazy-loaded Modal with Suspense */}
      {showOCRModal && (
        <Suspense fallback={<div className="loading-overlay">Initialisation du moteur OCR...</div>}>
          <UniversalOCRModal
            mode={ocrTargetMode}
            departments={departments}
            onClose={() => setShowOCRModal(false)}
            onImportSuccess={(count) => {
              showToast(`${count} importés !`, 'success');
            }}
          />
                </Suspense>
              )}
              </div>
            </ErrorBoundary>
          );
        }
export default App;
