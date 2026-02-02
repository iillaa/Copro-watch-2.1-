import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import {
  FaClipboardList,
  FaExclamationTriangle,
  FaMicroscope,
  FaClock,
  FaEye,
} from 'react-icons/fa';

export default function Dashboard({ onNavigateWorker, compactMode }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // [SURGICAL] Expansion State
  const [expandedSection, setExpandedSection] = useState(null); // 'due', 'retest' or null
  
  // [DEBUG] Log state changes
  useEffect(() => {
    console.log('[Dashboard DEBUG] expandedSection changed to:', expandedSection);
  }, [expandedSection]);
  
  const toggleExpand = (section) => {
    console.log('[Dashboard DEBUG] toggleExpand called with:', section, 'current:', expandedSection);
    setExpandedSection(expandedSection === section ? null : section);
  };

  // [FIX] IMPROVED MOBILE/TABLET DETECTION
  const checkMobile = () => {
    if (typeof window === 'undefined') {
      return false;
    }
    
    // 1. User Agent Detection for Mobile/Tablet
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    // 2. Touch Detection (for tablets without mobile UA)
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // 3. Screen Width Detection
    const isSmallScreen = window.innerWidth <= 1024;
    
    // 4. Check for tablet patterns in user agent
    const isTabletUA = /tablet|ipad|playbook|silk|kindle/i.test(userAgent);
    
    // Logic: Mobile if UA matches OR (touch device AND small screen)
    const result = isMobileUA || (isTouchDevice && isSmallScreen) || isTabletUA;
    
    console.log('[Dashboard] Mobile Detection - UA:', isMobileUA, 'Touch:', isTouchDevice, 'Screen:', isSmallScreen, 'Tablet:', isTabletUA, 'Result:', result);
    
    return result;
  };

  const [isMobile, setIsMobile] = useState(checkMobile());

  // [DEBUG] Log mobile detection
  console.log('[Dashboard DEBUG] isMobile:', isMobile, 'stats.dueSoon.length:', stats?.dueSoon.length, 'stats.retests.length:', stats?.retests.length);
  
  // [DEBUG] Alert for mobile detection (remove after debugging)
  if (typeof window !== 'undefined' && stats?.dueSoon?.length > 5) {
    setTimeout(() => {
      console.log('[Dashboard DEBUG] Mobile check - UA:', navigator.userAgent.substring(0, 50), '...');
      console.log('[Dashboard DEBUG] Screen width:', window.innerWidth, 'Touch points:', navigator.maxTouchPoints);
    }, 1000);
  }

  useEffect(() => {
    const handleResize = () => {
      const newIsMobile = checkMobile();
      console.log('[Dashboard DEBUG] Resize detected, isMobile:', newIsMobile);
      setIsMobile(newIsMobile);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // [GRID CONFIG] Name(1.5) | Date(1) | Action(80)
  const gridDashboard = '1.5fr 1fr 80px';

  const loadStats = async () => {
    try {
      setLoading(true);
      // Safety check for DB
      if (!db) throw new Error('DB not ready');

      const [workers, exams] = await Promise.all([db.getWorkers(), db.getExams()]);

      // 1. Filtrer les archivés
      const activeWorkers = (workers || []).filter((w) => !w.archived);

      // 2. Calculer les stats
      const computed = logic.getDashboardStats(activeWorkers, exams || []);

      // 3. TRI AUTOMATIQUE
      // ISO strings (yyyy-mm-dd) sort correctly alphabetically!
      if (computed.dueSoon)
        computed.dueSoon.sort((a, b) =>
          (a.next_exam_due || '').localeCompare(b.next_exam_due || '')
        );
      if (computed.overdue)
        computed.overdue.sort((a, b) =>
          (a.next_exam_due || '').localeCompare(b.next_exam_due || '')
        );
      if (computed.retests)
        computed.retests.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      setStats(computed);
    } catch (e) {
      console.error('Dashboard error:', e);
    } finally {
      setLoading(false); // CRITICAL: This forces the screen to show, even if empty
    }
  };
  useEffect(() => {
    loadStats();
  }, []);

  if (loading)
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          height: '60vh',
          gap: '1rem',
        }}
      >
        <div className="loading-spinner"></div>
        <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Chargement des données...</div>
      </div>
    );

  return (
    <div>
      {/* [DEBUG] Visible Mobile Detection Status */}
      <div style={{ 
        background: isMobile ? '#4CAF50' : '#f44336', 
        color: 'white', 
        padding: '8px', 
        marginBottom: '10px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold'
      }}>
        [DEBUG] Mobile Detection: {isMobile ? 'ENABLED ✓' : 'DISABLED ✗'} | Screen: {typeof window !== 'undefined' ? window.innerWidth : 'N/A'}px | Touch: {typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 'N/A'}
      </div>
      
      {/* FIX: Reduced marginBottom to 0.75rem to pull charts UP */}
      {/* --- HEADER (Hybrid) --- */}
      <header style={{ marginBottom: isMobile ? '0.75rem' : '1.5rem' }}>
        <h2
          style={
            isMobile
              ? { marginBottom: 0, marginTop: 0, lineHeight: 1.2 }
              : { marginBottom: '0', marginTop: '0', lineHeight: '1.2' }
          }
        >
              Tableau de bord
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontSize: isMobile ? '0.85rem' : '0.9rem',
          }}
        >
          Aperçu de la situation médicale.
        </p>
      </header>

      {/* --- CARTES DE STATISTIQUES --- */}
      {/* --- STATS CARDS (Hybrid Grid) --- */}
      <div
        style={
          isMobile
            ? {
                // MOBILE GRID: 3 Columns, Tight Gap
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }
            : {
                // DESKTOP GRID: Your Original Layout (Auto-fit, Wide Gap)
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
                marginBottom: '0.5rem',
              }
        }
      >
        {/* CARD 1: À FAIRE */}
        <div
          className="card"
          style={
            isMobile
              ? {
                  // MOBILE STYLE: Horizontal Row
                  display: 'flex',
                  flexDirection: 'row', // <--- CHANGED TO ROW
                  alignItems: 'center',
                  justifyContent: 'space-around', // Spreads Icon, Number, Name evenly
                  background: 'var(--warning-light)', // (Change color for other cards!)
                  padding: '0.5rem 0.2rem',
                  textAlign: 'center',
                  margin: 0,
                  gap: '2px', // Small gap between items
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  border: '2px solid #000000',
                }
              : {
                  // DESKTOP STYLE: Your Original (Horizontal)
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--warning-light)',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  border: '2px solid #000000',
                  padding: '1.5rem',
                }
          }
        >
          {isMobile ? (
            /* MOBILE CONTENT */
            <>
              <FaClipboardList
                size={20}
                color="var(--warning)"
                style={{ marginBottom: '0.25rem' }}
              />
              <div
                className="stat-card-value"
                style={{ color: 'var(--warning)', fontSize: '1.5rem' }}
              >
                {stats.dueSoon.length}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--warning-text)',
                  lineHeight: 1,
                }}
              >
                À faire
              </p>
            </>
          ) : (
            /* DESKTOP CONTENT (Your Original Code) */
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: 'var(--warning-text)' }}>
                  À faire (15 jours)
                </h3>
                <div className="stat-card-value" style={{ color: 'var(--warning)' }}>
                  {stats.dueSoon.length}
                </div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--warning-text)' }}>
                  Travailleurs
                </p>
              </div>
              <div style={{ opacity: 0.8 }}>
                <FaClipboardList size={60} color="var(--warning)" />
              </div>
            </>
          )}
        </div>

        {/* CARD 2: EN RETARD */}
        <div
          className="card"
          style={
            isMobile
              ? {
                  // MOBILE STYLE: Horizontal Row
                  display: 'flex',
                  flexDirection: 'row', // <--- CHANGED TO ROW
                  alignItems: 'center',
                  justifyContent: 'space-around', // Spreads Icon, Number, Name evenly
                  background: 'var(--danger-light)', // (Change color for other cards!)
                  padding: '0.5rem 0.2rem',
                  textAlign: 'center',
                  margin: 0,
                  border: '2px solid #000000', // [NEW]
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  gap: '2px', // Small gap between items
                  // [NEW]
                }
              : {
                  // DESKTOP STYLE
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--danger-light)',
                  padding: '1.5rem',
                  border: '2px solid #000000', // [NEW]
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)', // [NEW]
                }
          }
        >
          {isMobile ? (
            /* MOBILE CONTENT */
            <>
              <FaExclamationTriangle
                size={20}
                color="var(--danger)"
                style={{ marginBottom: '0.25rem' }}
              />
              <div
                className="stat-card-value"
                style={{ color: 'var(--danger)', fontSize: '1.5rem' }}
              >
                {stats.overdue.length}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--danger-text)',
                  lineHeight: 1,
                }}
              >
                Retard
              </p>
            </>
          ) : (
            /* DESKTOP CONTENT (Your Original Code) */
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: 'var(--danger-text)' }}>
                  En Retard
                </h3>
                <div className="stat-card-value" style={{ color: 'var(--danger)' }}>
                  {stats.overdue.length}
                </div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--danger-text)' }}>
                  Travailleurs
                </p>
              </div>
              <div style={{ opacity: 0.8 }}>
                <FaExclamationTriangle size={60} color="var(--danger)" />
              </div>
            </>
          )}
        </div>

        {/* CARD 3: SUIVI */}
        <div
          className="card"
          style={
            isMobile
              ? {
                  // MOBILE STYLE: Horizontal Row
                  display: 'flex',
                  flexDirection: 'row', // <--- CHANGED TO ROW
                  alignItems: 'center',
                  justifyContent: 'space-around', // Spreads Icon, Number, Name evenly
                  background: 'var(--primary-light)', // (Change color for other cards!)
                  padding: '0.5rem 0.2rem',
                  textAlign: 'center',
                  margin: 0,
                  border: '2px solid #000000', // [NEW]
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  gap: '2px', // Small gap between items
                  // [NEW]
                }
              : {
                  // DESKTOP STYLE
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--primary-light)',
                  padding: '1.5rem',
                  border: '2px solid #000000', // [NEW]
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)', // [NEW]
                }
          }
        >
          {isMobile ? (
            /* MOBILE CONTENT */
            <>
              <FaMicroscope size={20} color="var(--primary)" style={{ marginBottom: '0.25rem' }} />
              <div
                className="stat-card-value"
                style={{ color: 'var(--primary)', fontSize: '1.5rem' }}
              >
                {stats.activePositive.length}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  color: 'var(--primary)',
                  lineHeight: 1,
                }}
              >
                Suivi
              </p>
            </>
          ) : (
            /* DESKTOP CONTENT (Your Original Code) */
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: 'var(--primary)' }}>
                  Suivi Médical
                </h3>
                <div className="stat-card-value" style={{ color: 'var(--primary)' }}>
                  {stats.activePositive.length}
                </div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--primary)' }}>Cas actifs</p>
              </div>
              <div style={{ opacity: 0.8 }}>
                <FaMicroscope size={60} color="var(--primary)" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* --- TABLEAUX --- */}
      <div
        style={{
          display: 'grid',
          /* FIX: Changed '1fr' to this Smart Rule */
          /* It puts tables side-by-side if there is room (300px+), otherwise stacks them */
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}
      >
        {/* TABLEAU 1 : Examens à prévoir */}
        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            border: 'none',
            boxShadow: 'none',
            background: 'transparent',
          }}
        >
          {/* Title */}
          <div style={{ paddingBottom: '0.5rem', background: 'transparent' }}>
            <h3 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaClock /> Examens à prévoir
            </h3>
          </div>

          {stats.dueSoon.length === 0 && stats.overdue.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                background: 'white',
                borderRadius: '12px',
                border: '2px solid #eee',
              }}
            >
              Rien à signaler. Tout est à jour !
            </div>
          ) : (
            <>
              <div
                className="scroll-wrapper"
                style={{
                  maxHeight: compactMode ? '510px' : 'none',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                }}
              >
                <div className="hybrid-container" style={{ minWidth: '100%' }}>
                  {/* HEADER */}
                  <div className="hybrid-header" style={{ gridTemplateColumns: gridDashboard }}>
                    <div>Nom</div>
                    <div style={{ whiteSpace: 'nowrap' }}>Date Prévue</div>
                    <div style={{ textAlign: 'center' }}>Action</div>
                  </div>

                  {/* 1. OVERDUE ROWS (Red) */}
                  {(isMobile ? stats.overdue.slice(0, 5) : stats.overdue).map((w) => (
                    <div
                      key={w.id}
                      className="hybrid-row overdue-worker-row"
                      style={{ gridTemplateColumns: gridDashboard }}
                    >
                      {/* Name + Badge */}
                      <div
                        className="hybrid-cell"
                        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                      >
                        <span style={{ fontWeight: 800, color: 'var(--danger-text)' }}>
                          {w.full_name}
                        </span>
                        <span
                          className="badge badge-red"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                        >
                          RETARD
                        </span>
                      </div>
                      {/* Date */}
                      <div
                        className="hybrid-cell"
                        style={{ color: 'var(--danger)', fontWeight: 'bold' }}
                      >
                        {logic.formatDateDisplay(w.next_exam_due)}
                      </div>
                      {/* Action */}
                      <div className="hybrid-actions">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => onNavigateWorker(w.id)}
                          title="Voir Dossier"
                        >
                          <FaEye />
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* [ACTION B] Limit 'Due Soon' to 5 items on mobile unless expanded */}
                  {(() => {
                    const shouldSlice = isMobile && expandedSection !== 'due';
                    const itemsToShow = shouldSlice ? stats.dueSoon.slice(0, 5) : stats.dueSoon;
                    console.log('[Dashboard DEBUG] Due Soon - shouldSlice:', shouldSlice, 'total:', stats.dueSoon.length, 'showing:', itemsToShow.length);
                    return itemsToShow.map((w) => (
                      <div
                        key={w.id}
                        className="hybrid-row"
                        style={{ gridTemplateColumns: gridDashboard }}
                      >
                        <div className="hybrid-cell" style={{ fontWeight: 600 }}>
                          {w.full_name}
                        </div>
                        <div className="hybrid-cell">{logic.formatDateDisplay(w.next_exam_due)}</div>
                        <div className="hybrid-actions" style={{ justifyContent: 'center' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => onNavigateWorker(w.id)}
                          >
                            <FaEye />
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* [ACTION B] The 'Show More' Button */}
              {isMobile && stats.dueSoon.length > 5 && (
                <>
                  {console.log('[Dashboard DEBUG] Rendering Show More button for dueSoon')}
                  <button
                    onClick={() => toggleExpand('due')}
                    className="btn btn-sm btn-outline"
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      border: '2px solid blue', // [DEBUG] Make very visible
                      color: 'blue', // [DEBUG] Make very visible
                      backgroundColor: 'lightyellow', // [DEBUG] Make very visible
                      padding: '12px', // [DEBUG] Make larger
                    }}
                  >
                    {expandedSection === 'due'
                      ? 'Réduire ▲'
                      : `Voir ${stats.dueSoon.length - 5} autres ▼`}
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {/* TABLEAU 2 : Contre-visites */}
        <div
          className="card"
          style={{
            padding: 0,
            overflow: 'hidden',
            border: 'none',
            boxShadow: 'none',
            background: 'transparent',
          }}
        >
          {/* Title */}
          <div style={{ paddingBottom: '0.5rem', background: 'transparent' }}>
            <h3 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaMicroscope color="var(--primary)" /> Contre-visites
            </h3>
          </div>

          {stats.retests.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                background: 'white',
                borderRadius: '12px',
                border: '2px solid #eee',
              }}
            >
              Aucune contre-visite prévue.
            </div>
          ) : (
            <>
              <div
                className="scroll-wrapper"
                style={{
                  maxHeight: compactMode ? '510px' : 'none',
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  margin: 0,
                }}
              >
                <div className="hybrid-container" style={{ minWidth: '100%' }}>
                  {/* HEADER */}
                  <div className="hybrid-header" style={{ gridTemplateColumns: gridDashboard }}>
                    <div>Patient (Suivi)</div>
                    <div>Date Prévue</div>
                    <div style={{ textAlign: 'center' }}>Action</div>
                  </div>

                  {/* [ACTION C] Limit 'Retests' to 5 items on mobile */}
                  {(() => {
                    const shouldSlice = isMobile && expandedSection !== 'retest';
                    const itemsToShow = shouldSlice ? stats.retests.slice(0, 5) : stats.retests;
                    console.log('[Dashboard DEBUG] Retests - shouldSlice:', shouldSlice, 'total:', stats.retests.length, 'showing:', itemsToShow.length);
                    return itemsToShow.map((item) => (
                      <div
                        key={item.worker.id}
                        className="hybrid-row"
                        style={{ gridTemplateColumns: gridDashboard }}
                      >
                        <div
                          className="hybrid-cell"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <div
                            style={{
                              background: 'var(--primary-light)',
                              padding: '6px',
                              borderRadius: '50%',
                              display: 'flex',
                            }}
                          >
                            <FaMicroscope size={10} color="var(--primary)" />
                          </div>
                          <span style={{ fontWeight: 700 }}>{item.worker.full_name}</span>
                        </div>
                        <div className="hybrid-cell">{logic.formatDateDisplay(item.date)}</div>
                        <div className="hybrid-actions" style={{ justifyContent: 'center' }}>
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => onNavigateWorker(item.worker.id)}
                          >
                            <FaEye />
                          </button>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* [ACTION C] The 'Show More' Button */}
              {isMobile && stats.retests.length > 5 && (
                <>
                  {console.log('[Dashboard DEBUG] Rendering Show More button for retests')}
                  <button
                    onClick={() => toggleExpand('retest')}
                    className="btn btn-sm btn-outline"
                    style={{
                      width: '100%',
                      marginTop: '0.5rem',
                      border: '2px solid red', // [DEBUG] Make very visible
                      color: 'red', // [DEBUG] Make very visible
                      backgroundColor: 'yellow', // [DEBUG] Make very visible
                      padding: '12px', // [DEBUG] Make larger
                    }}
                  >
                    {expandedSection === 'retest'
                      ? 'Réduire ▲'
                      : `Voir ${stats.retests.length - 5} autres ▼`}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
