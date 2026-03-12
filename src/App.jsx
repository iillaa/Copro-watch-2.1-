import React, { useState, useEffect, Suspense, lazy } from 'react';
import { useToast } from './components/Toast';
import { db } from './services/db';
import { hashString } from './services/crypto';
import DiagnosticPanel from './components/DiagnosticPanel';
import ErrorBoundary from './components/ErrorBoundary';
import backupService from './services/backup';

import Dashboard from './components/Dashboard';
import WorkerList from './components/WorkerList';
import WorkerDetail from './components/WorkerDetail';
import PinLock from './components/PinLock';
import Settings from './components/Settings';
import WaterAnalyses from './components/WaterAnalyses';
import FastDataInputModal from './components/FastDataInputModal';

import WeaponDashboard from './components/Weapons/WeaponDashboard';
import WeaponList from './components/Weapons/WeaponList';
import WeaponDetail from './components/Weapons/WeaponDetail';

import { 
  FaUsers, 
  FaChartLine, 
  FaCog, 
  FaFlask, 
  FaShieldAlt, 
  FaUserShield, 
  FaGlobe,
  FaBolt,
  FaImage,
  FaList,
  FaCamera
} from 'react-icons/fa';

const UniversalOCRModal = lazy(() => import('./components/UniversalOCRModal'));

let isAppListenerInitialized = false;
let globalBackupLock = false;

function App() {
  const { showToast, ToastContainer } = useToast();
  const [view, setView] = useState('dashboard');
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState(null);
  const [selectedWorkerId, setSelectedWorkerId] = useState(null);
  const [selectedWeaponHolderId, setSelectedWeaponHolderId] = useState(null);
  const [isLocked, setIsLocked] = useState(true);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [waterResetKey, setWaterResetKey] = useState(0);
  const [compactMode, setCompactMode] = useState(true);
  const [listRefreshKey, setListRefreshKey] = useState(0); // [NEW] Force reload lists
  
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [ocrTargetMode, setOcrTargetMode] = useState('worker');
  const [showFastInput, setShowFastInput] = useState(false);
  const [fastInputMode, setFastInputMode] = useState('worker');
  const [departments, setDepartments] = useState([]);
  const [weaponDepartments, setWeaponDepartments] = useState([]); // [NEW]
  const [workplaces, setWorkplaces] = useState([]);
  
  const [forceMobile, setForceMobile] = useState(
    () => localStorage.getItem('copro_force_mobile') === 'true'
  );

  useEffect(() => {
    if (forceMobile) {
      document.documentElement.classList.add('force-mobile');
    } else {
      document.documentElement.classList.remove('force-mobile');
    }
    localStorage.setItem('copro_force_mobile', forceMobile);
  }, [forceMobile]);

  const [pin, setPin] = useState('0000');
  const [appLanguage, setAppLanguage] = useState(() => localStorage.getItem('copro_app_lang') || 'fr');

  useEffect(() => {
    localStorage.setItem('copro_app_lang', appLanguage);
  }, [appLanguage]);

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
    if (isLeftSwipe && isSidebarOpen) setSidebarOpen(false);
    if (isRightSwipe && !isSidebarOpen) setSidebarOpen(true);
  };

  useEffect(() => {
    const setupLifecycle = async () => {
      if (isAppListenerInitialized) return;
      try {
        const { App: CapApp } = await import('@capacitor/app');
        await CapApp.removeAllListeners();
        await CapApp.addListener('appStateChange', async ({ isActive }) => {
          if (!isActive) {
            if (globalBackupLock) return;
            globalBackupLock = true;
            const status = await backupService.getBackupStatus();
            if (status.counter > 0) {
              await backupService.performAutoExport(async () => await db.exportData(), 'COUNTER');
            }
            setTimeout(() => { globalBackupLock = false; }, 2000);
          }
        });
        isAppListenerInitialized = true;
      } catch (e) {
        console.warn('[App] Capacitor App Plugin not available.');
      }
    };
    setupLifecycle();
  }, []);

  const initApp = async () => {
    try {
      setLoading(true);
      await db.init();
      await backupService.init(db);
      try {
        const importResult = await backupService.checkAndAutoImport(db);
        if (importResult && importResult.reason === 'NEED_PASSWORD') {
          let result = importResult;
          while (result && (result.error === 'NEED_PASSWORD' || result.reason === 'NEED_PASSWORD')) {
            const pw = prompt(`Sauvegarde plus récente trouvée. PIN ?`);
            if (pw === null) break;
            const ok = await db.importData(importResult.encryptedData, pw);
            if (ok === true) break;
            else result = ok;
          }
        }
      } catch (e) {}
      const settings = await db.getSettings();
      if (settings.pin) setPin(settings.pin);
      const depts = await db.getDepartments();
      const weaponDepts = await db.getWeaponDepartments(); // [NEW]
      const works = await db.getWorkplaces();
      setDepartments(depts);
      setWeaponDepartments(weaponDepts); // [NEW]
      setWorkplaces(works);
    } catch (error) {
      setInitError(error.message || 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    let timer;
    const TIMEOUT_MS = 5 * 60 * 1000;
    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      if (!isLocked) {
        timer = setTimeout(() => setIsLocked(true), TIMEOUT_MS);
      }
    };
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('keydown', resetTimer);
    window.addEventListener('click', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    resetTimer();
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('keydown', resetTimer);
      window.removeEventListener('click', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
    };
  }, [isLocked]);

  const navigateToWorker = (id) => {
    setSelectedWorkerId(id);
    setView('worker-detail');
  };

  const navigateToWeaponHolder = (id) => {
    setSelectedWeaponHolderId(id);
    setView('weapon-detail');
  };

  const checkPin = async (inputPin) => {
    if (pin.length === 4) return inputPin === pin;
    const inputHash = await hashString(inputPin);
    return inputHash === pin;
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column' }}>
        <div className="loading-spinner"></div>
        <p>Chargement...</p>
      </div>
    );
  }

  if (initError) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', flexDirection: 'column', backgroundColor: '#fee2e2', padding: '20px' }}>
        <h3>Erreur au démarrage</h3>
        <p>{initError}</p>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>Réessayer</button>
      </div>
    );
  }

  if (isLocked) {
    return <PinLock onCheckPin={checkPin} onUnlock={() => setIsLocked(false)} />;
  }

  const isMobileView = typeof window !== 'undefined' && window.innerWidth < 768;
  const showSlimSidebar = forceMobile || isMobileView;
  const sidebarWidth = showSlimSidebar ? '60px' : (isSidebarOpen ? '260px' : '70px');
  const effectiveIsSidebarOpen = showSlimSidebar ? false : isSidebarOpen;

  return (
    <ErrorBoundary>
      <div 
        className={`app-shell ${effectiveIsSidebarOpen ? '' : 'sidebar-closed'}`}
        style={{ '--sidebar-width': sidebarWidth }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <ToastContainer />
        <DiagnosticPanel />
        
        <aside 
          className="sidebar no-print" 
          style={{ 
            width: sidebarWidth,
            transition: 'width 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex', flexDirection: 'column', background: '#fff', borderRight: '1px solid #e2e8f0', height: '100vh', zIndex: 100, overflow: 'hidden'
          }}
        >
          <div style={{ 
            padding: effectiveIsSidebarOpen ? '1.5rem 1.25rem' : '1.5rem 0', 
            borderBottom: '1px solid #e2e8f0', display: 'flex', 
            justifyContent: effectiveIsSidebarOpen ? 'flex-start' : 'center', 
            alignItems: 'center', gap: '12px', height: '85px', boxSizing: 'border-box' 
          }}>
            <div style={{ 
              width: effectiveIsSidebarOpen ? '40px' : '36px', height: effectiveIsSidebarOpen ? '40px' : '36px', 
              borderRadius: '10px', background: 'linear-gradient(135deg, var(--primary) 0%, #0284c7 100%)', 
              display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 4px 10px rgba(14, 165, 233, 0.3)' 
            }}>
              <svg width={effectiveIsSidebarOpen ? "22" : "18"} height={effectiveIsSidebarOpen ? "22" : "18"} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M12 8v8"></path><path d="M8 12h8"></path>
              </svg>
            </div>
            {effectiveIsSidebarOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', whiteSpace: 'nowrap' }}>
                <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                  Medi<span style={{ color: 'var(--primary)' }}>Watch</span>
                </h1>
                <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Prévention & Aptitude</span>
              </div>
            )}
          </div>

          <nav style={{ padding: effectiveIsSidebarOpen ? '1.5rem 1rem' : '1.5rem 0', display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {(() => {
              const getBtnStyle = (isActive) => ({
                display: 'flex', alignItems: 'center', justifyContent: effectiveIsSidebarOpen ? 'flex-start' : 'center',
                padding: effectiveIsSidebarOpen ? '0.75rem 1rem' : '0', borderRadius: '10px',
                background: isActive ? 'var(--primary-light)' : 'transparent',
                color: isActive ? 'var(--primary)' : '#64748b',
                border: 'none', cursor: 'pointer', width: effectiveIsSidebarOpen ? '100%' : '42px', height: effectiveIsSidebarOpen ? 'auto' : '42px',
                transition: 'background 0.2s, color 0.2s'
              });
              return (
                <>
                  {effectiveIsSidebarOpen && <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', margin: '0.5rem 0 0.5rem 0.5rem' }}>Coproculture</div>}
                  <button className="nav-item" onClick={() => setView('dashboard')} style={getBtnStyle(view === 'dashboard')} title="Bilan Copro">
                    <div className="nav-icon" style={{ display: 'flex' }}><FaChartLine size={20} /></div>
                    {effectiveIsSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700 }}>Bilan Copro</span>}
                  </button>
                  <button className="nav-item" onClick={() => { setView('workers'); setSelectedWorkerId(null); }} style={getBtnStyle(view === 'workers' || view === 'worker-detail')} title="Registre Copro">
                    <div className="nav-icon" style={{ display: 'flex' }}><FaUsers size={20} /></div>
                    {effectiveIsSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700 }}>Registre Copro</span>}
                  </button>

                  {effectiveIsSidebarOpen && <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', margin: '1.5rem 0 0.5rem 0.5rem' }}>Sanitaire</div>}
                  <button className="nav-item" onClick={() => { setView('water-analyses'); setWaterResetKey(p => p + 1); }} style={getBtnStyle(view === 'water-analyses')} title="Analyses d'Eau">
                    <div className="nav-icon" style={{ display: 'flex' }}><FaFlask size={20} /></div>
                    {effectiveIsSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700 }}>Analyses d'Eau</span>}
                  </button>

                  {effectiveIsSidebarOpen && <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', margin: '1.5rem 0 0.5rem 0.5rem' }}>Port d'Arme</div>}
                  <button className="nav-item" onClick={() => setView('weapons-dashboard')} style={getBtnStyle(view === 'weapons-dashboard')} title="Bilan Armes">
                    <div className="nav-icon" style={{ display: 'flex' }}><FaShieldAlt size={20} /></div>
                    {effectiveIsSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700 }}>Bilan Armes</span>}
                  </button>
                  <button className="nav-item" onClick={() => { setView('weapons-list'); setSelectedWeaponHolderId(null); }} style={getBtnStyle(view === 'weapons-list' || view === 'weapon-detail')} title="Détenteurs d'Armes">
                    <div className="nav-icon" style={{ display: 'flex' }}><FaUserShield size={20} /></div>
                    {effectiveIsSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700 }}>Détenteurs d'Armes</span>}
                  </button>

                  <button className="nav-item" onClick={() => setView('settings')} style={{...getBtnStyle(view === 'settings'), marginTop: 'auto'}} title="Paramètres">
                    <div className="nav-icon" style={{ display: 'flex' }}><FaCog size={20} /></div>
                    {effectiveIsSidebarOpen && <span style={{ marginLeft: '12px', fontWeight: 700 }}>Paramètres</span>}
                  </button>
                </>
              );
            })()}
          </nav>
        </aside>

        <main className="main-content">
          <div className="container">
            {!showSlimSidebar && (
              <button className="btn btn-sm no-print toggle-sidebar" style={{ marginBottom: '2.5rem' }} onClick={() => setSidebarOpen(!isSidebarOpen)}>
                {effectiveIsSidebarOpen ? 'Masquer Sidebar' : 'Afficher Sidebar'}
              </button>
            )}
            
            {view === 'dashboard' && <Dashboard onNavigateWorker={navigateToWorker} compactMode={compactMode} forceMobile={forceMobile} />}
            {view === 'workers' && (
              <WorkerList 
                key={`workers-${listRefreshKey}`}
                onNavigateWorker={navigateToWorker} 
                compactMode={compactMode} 
                appLanguage={appLanguage} 
                onToggleLanguage={() => setAppLanguage(p => p === 'fr' ? 'ar' : 'fr')}
                onShowFastInput={(m) => { setFastInputMode(m); setShowFastInput(true); }}
              />
            )}
            {view === 'worker-detail' && selectedWorkerId && <WorkerDetail workerId={selectedWorkerId} onBack={() => setView('workers')} compactMode={compactMode} appLanguage={appLanguage} />}
            {view === 'water-analyses' && <WaterAnalyses key={waterResetKey} compactMode={compactMode} />}
            {view === 'weapons-dashboard' && <WeaponDashboard onNavigateWeaponHolder={navigateToWeaponHolder} compactMode={compactMode} forceMobile={forceMobile} />}
            {view === 'weapons-list' && (
              <WeaponList 
                key={`weapons-${listRefreshKey}`}
                onNavigateWeaponHolder={navigateToWeaponHolder} 
                compactMode={compactMode} 
                appLanguage={appLanguage} 
                onToggleLanguage={() => setAppLanguage(p => p === 'fr' ? 'ar' : 'fr')}
                onShowFastInput={(m) => { setFastInputMode(m); setShowFastInput(true); }}
              />
            )}
            {view === 'weapon-detail' && selectedWeaponHolderId && <WeaponDetail holderId={selectedWeaponHolderId} onBack={() => setView('weapons-list')} compactMode={compactMode} appLanguage={appLanguage} />}
            {view === 'settings' && <Settings currentPin={pin} onPinChange={setPin} compactMode={compactMode} setCompactMode={setCompactMode} forceMobile={forceMobile} setForceMobile={setForceMobile} />}
          </div>
        </main>

        {showOCRModal && (
          <Suspense fallback={<div className="loading-overlay">Initialisation du moteur OCR...</div>}>
            <UniversalOCRModal 
              mode={ocrTargetMode} 
              departments={ocrTargetMode === 'worker' ? departments : weaponDepartments} 
              onClose={() => setShowOCRModal(false)} 
              onImportSuccess={(count) => {
                showToast(`${count} importés !`, 'success');
                setListRefreshKey(p => p + 1);
              }} 
            />
          </Suspense>
        )}

        {showFastInput && (
          <FastDataInputModal 
            mode={fastInputMode} 
            departments={fastInputMode === 'worker' ? departments : weaponDepartments} 
            workplaces={workplaces} 
            onClose={() => setShowFastInput(false)} 
            onSave={() => { 
              setShowFastInput(false); 
              showToast('Données enregistrées !', 'success'); 
              setListRefreshKey(p => p + 1);
              if (fastInputMode === 'worker') setWaterResetKey(p => p + 1); 
            }} 
          />
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
