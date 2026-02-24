import { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import {
  FaUserShield,
  FaExclamationTriangle,
  FaCalendarCheck,
  FaEye,
  FaHistory,
  FaCog,
  FaPlus,
  FaTrash,
  FaBell,
} from 'react-icons/fa';

export default function WeaponDashboard({ onNavigateWeaponHolder, compactMode, forceMobile }) {
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [holders, setHolders] = useState([]);
  const [exams, setExams] = useState([]);
  const [alert, setAlert] = useState(null);

  // [SURGICAL FIX] Robust Alert Logic
  const calculateAlert = (pendingCount, reviewCount, overdueCount, examList) => {
    let daysSinceLast = 0;

    // 1. Filter out invalid exams
    const validExams = (examList || []).filter(
      (e) => e.exam_date && !isNaN(new Date(e.exam_date).getTime())
    );

    if (validExams.length > 0) {
      const sorted = validExams.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
      const lastDate = new Date(sorted[0].exam_date);
      const diffTime = Math.abs(new Date() - lastDate);
      daysSinceLast = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const totalWork = pendingCount + reviewCount;

    // PRIORITY 1: High Volume (Red)
    if (totalWork >= 20) {
      setAlert({
        level: 'danger',
        title: 'Volume Élevé',
        message: `${totalWork} dossiers en attente. Commission requise.`,
      });
    }
    // PRIORITY 2: Overdue Files (Orange/Red) - [NEW FIX]
    // Triggers even if you did a commission yesterday!
    else if (overdueCount > 0) {
      setAlert({
        level: 'warning', // Orange (or use 'danger' if you prefer red for this)
        title: 'Dossiers en Retard',
        message: `${overdueCount} agent(s) ont dépassé la date de révision. Action requise.`,
      });
    }
    // PRIORITY 3: Inactivity Timer (Orange)
    else if ((daysSinceLast >= 60 || validExams.length === 0) && totalWork > 0) {
      setAlert({
        level: 'warning',
        title: 'Rappel Commission',
        message:
          validExams.length === 0
            ? `Aucune commission enregistrée. ${totalWork} dossiers en attente.`
            : `Dernière commission il y a ${daysSinceLast} jours. ${totalWork} dossiers en attente.`,
      });
    } else {
      setAlert(null);
    }
  };

  const checkMobile = () => {
    if (forceMobile) return true;
    if (typeof window === 'undefined') return false;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    return screenWidth < 768 || screenHeight < 600;
  };

  const [isMobile, setIsMobile] = useState(checkMobile());

  useEffect(() => {
    const handleResize = () => setIsMobile(checkMobile());
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [forceMobile]);

  const gridDashboard = '1.5fr 1fr 80px';

  const loadData = async () => {
    try {
      setLoading(true);
      const [h, e] = await Promise.all([db.getWeaponHolders(), db.getWeaponExams()]);
      setHolders(h || []);
      setExams(e || []);

      // [SURGICAL UPDATE] Count both Pending and Due Reviews (including Overdue)
      const activeHolders = h || [];

      const pending = activeHolders.filter((w) => w.status === 'pending').length;

      // [SURGICAL FIX] Only count 'inapte_temporaire' as work.
      // Apte agents with old dates are ignored.
      // 1. Total Reviews needed (Due Soon + Overdue)
      const reviews = activeHolders.filter(
        (w) =>
          w.status === 'inapte_temporaire' &&
          w.next_review_date &&
          (logic.isWeaponDueSoon(w.next_review_date) || logic.isOverdue(w.next_review_date))
      ).length;

      // 2. Strictly Overdue (RETARD) - These are urgent!
      const overdueCount = activeHolders.filter(
        (w) =>
          w.status === 'inapte_temporaire' &&
          w.next_review_date &&
          logic.isOverdue(w.next_review_date)
      ).length;

      // Pass overdueCount to the calculator
      calculateAlert(pending, reviews, overdueCount, e || []);
    } catch (e) {
      console.error('WeaponDashboard error:', e);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    return logic.getWeaponDashboardStats(holders, exams);
  }, [holders, exams]);

  useEffect(() => {
    loadData();
  }, []);

  if (loading) {
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
        <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Chargement...</div>
      </div>
    );
  }

  return (
    <div>
      <header
        style={{
          marginBottom: isMobile ? '0.75rem' : '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h2 style={{ marginBottom: 0, marginTop: 0, lineHeight: 1.2 }}>Gestion des Armes</h2>
          <p
            style={{
              margin: 0,
              color: 'var(--text-muted)',
              fontSize: isMobile ? '0.85rem' : '0.9rem',
            }}
          >
            Aperçu de l'aptitude au port d'arme.
          </p>
        </div>
      </header>

      {/* --- START ALERT BANNER --- */}
      {alert && (
        <div
          className="card"
          style={{
            marginBottom: '1rem',
            border: `2px solid ${alert.level === 'danger' ? '#ef4444' : '#f59e0b'}`,
            background: alert.level === 'danger' ? '#fef2f2' : '#fffbeb',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '1rem',
          }}
        >
          <div
            style={{ fontSize: '1.5rem', color: alert.level === 'danger' ? '#ef4444' : '#f59e0b' }}
          >
            <FaBell />
          </div>
          <div>
            <h4 style={{ margin: 0, color: alert.level === 'danger' ? '#991b1b' : '#92400e' }}>
              {alert.title}
            </h4>
            <div style={{ fontSize: '0.9rem', color: '#374151' }}>{alert.message}</div>
          </div>
        </div>
      )}
      {/* --- END ALERT BANNER --- */}

      <div
        style={
          isMobile
            ? {
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                marginBottom: '0.5rem',
              }
            : {
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '1rem',
                marginBottom: '0.5rem',
              }
        }
      >
        {/* CARD 1: APTE */}
        <div
          className="card"
          style={
            isMobile
              ? {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  background: '#dcfce7',
                  padding: '0.5rem 0.2rem',
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0 rgba(0,0,0,0.1)',
                }
              : {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#dcfce7',
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0 rgba(0,0,0,0.1)',
                  padding: '1.5rem',
                }
          }
        >
          {isMobile ? (
             <>
               <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                 <polyline points="9 12 11 14 15 10"></polyline>
               </svg>
               <div style={{ color: '#166534', fontSize: '1.5rem', fontWeight: 'bold' }}>
                 {stats.active.length}
               </div>
               <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#166534' }}>Apte</p>
             </>
          ) : (
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: '#166534' }}>Apte</h3>
                <div className="stat-card-value" style={{ color: '#166534' }}>{stats.active.length}</div>
                <p style={{ margin: 0, fontWeight: 600, color: '#166534' }}>Agents actifs</p>
              </div>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <circle cx="12" cy="11" r="3"></circle>
              </svg>
            </>
          )}
        </div>

        {/* CARD 2: INAPTE */}
        <div
          className="card"
          style={
            isMobile
              ? {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  background: 'var(--danger-light)',
                  padding: '0.5rem 0.2rem',
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0 rgba(0,0,0,0.1)',
                }
              : {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--danger-light)',
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0 rgba(0,0,0,0.1)',
                  padding: '1.5rem',
                }
          }
        >
          {isMobile ? (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                 <circle cx="12" cy="12" r="10"></circle>
                 <line x1="15" y1="9" x2="9" y2="15"></line>
                 <line x1="9" y1="9" x2="15" y2="15"></line>
              </svg>
              <div style={{ color: 'var(--danger)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                {stats.inapte.length}
              </div>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--danger-text)' }}>Inapte</p>
            </>
          ) : (
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: 'var(--danger-text)' }}>Inapte</h3>
                <div className="stat-card-value" style={{ color: 'var(--danger)' }}>{stats.inapte.length}</div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--danger-text)' }}>Armes retirées</p>
              </div>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                 <circle cx="12" cy="12" r="10"></circle>
                 <path d="M12 8v4"></path>
                 <path d="M12 16h.01"></path>
              </svg>
            </>
          )}
        </div>

        {/* CARD 3: A REVOIR */}
        <div
          className="card"
          style={
            isMobile
              ? {
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-around',
                  background: 'var(--warning-light)',
                  padding: '0.5rem 0.2rem',
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0 rgba(0,0,0,0.1)',
                }
              : {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--warning-light)',
                  border: '2px solid #000',
                  boxShadow: '4px 4px 0 rgba(0,0,0,0.1)',
                  padding: '1.5rem',
                }
          }
        >
          {isMobile ? (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
              <div style={{ color: 'var(--warning)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                {stats.dueSoon.length}
              </div>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--warning-text)' }}>Revoir</p>
            </>
          ) : (
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: 'var(--warning-text)' }}>À Revoir</h3>
                <div className="stat-card-value" style={{ color: 'var(--warning)' }}>{stats.dueSoon.length}</div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--warning-text)' }}>Sous 20 jours</p>
              </div>
              <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.8 }}>
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
                <path d="M12 14v4"></path>
                <path d="M10 16h4"></path>
              </svg>
            </>
          )}
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}
      >
        <div
          className="card"
          style={{ padding: 0, background: 'transparent', boxShadow: 'none', border: 'none' }}
        >
          <h3
            style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FaCalendarCheck /> Prochaines Révisions
          </h3>
          {stats.dueSoon.length === 0 ? (
            <div
              className="card"
              style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}
            >
              Rien à signaler.
            </div>
          ) : (
            // [SURGICAL FIX] Added Scroll Wrapper for Compact Mode
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
              <div className="hybrid-container">
                <div className="hybrid-header" style={{ gridTemplateColumns: gridDashboard }}>
                  <div>Nom</div>
                  <div>Date</div>
                  <div style={{ textAlign: 'center' }}>Action</div>
                </div>
                {stats.dueSoon.map((h) => {
                  // [FIX] Strict Overdue Check for the List Visuals
                  const isLate =
                    h.status === 'inapte_temporaire' &&
                    h.next_review_date &&
                    logic.isOverdue(h.next_review_date);

                  return (
                    <div
                      key={h.id}
                      className="hybrid-row"
                      style={{ gridTemplateColumns: gridDashboard }}
                    >
                      <div className="hybrid-cell" style={{ fontWeight: 600 }}>
                        {h.full_name}
                      </div>

                      {/* [FIX] Color Logic: Red if Late */}
                      <div
                        className="hybrid-cell"
                        style={{
                          color: isLate ? 'var(--danger)' : 'inherit',
                          fontWeight: isLate ? 'bold' : 'normal',
                        }}
                      >
                        {logic.formatDateDisplay(h.next_review_date)}
                      </div>

                      <div className="hybrid-actions">
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => onNavigateWeaponHolder(h.id)}
                        >
                          <FaEye />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div
          className="card"
          style={{ padding: 0, background: 'transparent', boxShadow: 'none', border: 'none' }}
        >
          <h3
            style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <FaHistory /> Activité Récente
          </h3>
          {stats.latestExams.length === 0 ? (
            <div
              className="card"
              style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}
            >
              Aucun historique.
            </div>
          ) : (
            // [SURGICAL FIX] Added Scroll Wrapper for Compact Mode
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
              <div className="hybrid-container">
                <div className="hybrid-header" style={{ gridTemplateColumns: gridDashboard }}>
                  <div>Agent</div>
                  <div>Verdict</div>
                  <div style={{ textAlign: 'center' }}>Action</div>
                </div>
                {stats.latestExams.map((e) => (
                  <div
                    key={e.id}
                    className="hybrid-row"
                    style={{ gridTemplateColumns: gridDashboard }}
                  >
                    <div className="hybrid-cell" style={{ fontWeight: 600 }}>
                      {e.holder?.full_name || 'Agent Supprimé'}
                    </div>
                    <div className="hybrid-cell">
                      <span
                        className={`badge ${
                          e.final_decision === 'apte' ? 'badge-green' : 'badge-red'
                        }`}
                      >
                        {e.final_decision?.toUpperCase()}
                      </span>
                    </div>
                    <div className="hybrid-actions">
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => onNavigateWeaponHolder(e.holder_id)}
                      >
                        <FaEye />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showSettings && <WeaponSettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

function WeaponSettingsModal({ onClose }) {
  const [depts, setDepts] = useState([]);
  const [newName, setNewName] = useState('');

  const load = async () => {
    const d = await db.getWeaponDepartments();
    setDepts(d);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await db.saveWeaponDepartment({ name: newName.trim() });
    setNewName('');
    load();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Supprimer ce service ? (Cela supprimera tous les agents liés)')) {
      await db.deleteWeaponDepartment(id);
      load();
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '400px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <h3 style={{ margin: 0 }}>Gérer les Services RH</h3>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            className="input"
            placeholder="Nouveau service..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <button className="btn btn-primary">
            <FaPlus />
          </button>
        </form>

        <div className="scroll-wrapper" style={{ maxHeight: '300px' }}>
          {depts.map((d) => (
            <div
              key={d.id}
              className="hybrid-row"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.75rem',
              }}
            >
              <span style={{ fontWeight: 'bold' }}>{d.name}</span>
              <button
                className="btn btn-sm btn-outline"
                style={{ color: 'var(--danger)' }}
                onClick={() => handleDelete(d.id)}
              >
                <FaTrash />
              </button>
            </div>
          ))}
          {depts.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Aucun service.</p>
          )}
        </div>
      </div>
    </div>
  );
}
