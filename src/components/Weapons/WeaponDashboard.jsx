import { useState, useEffect, useMemo } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import {
  FaUserShield,
  FaExclamationTriangle,
  FaCalendarCheck,
  FaEye,
  FaHistory,
} from 'react-icons/fa';

export default function WeaponDashboard({ onNavigateWeaponHolder, compactMode, forceMobile }) {
  const [loading, setLoading] = useState(true);
  const [expandedSection, setExpandedSection] = useState(null);

  const toggleExpand = (section) =>
    setExpandedSection(expandedSection === section ? null : section);

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

  const [holders, setHolders] = useState([]);
  const [exams, setExams] = useState([]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [h, e] = await Promise.all([db.getWeaponHolders(), db.getWeaponExams()]);
      setHolders(h || []);
      setExams(e || []);
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
        <div style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Chargement des données...</div>
      </div>
    );
  }

  return (
    <div>
      <header style={{ marginBottom: isMobile ? '0.75rem' : '1.5rem' }}>
        <h2 style={{ marginBottom: 0, marginTop: 0, lineHeight: 1.2 }}>
          Gestion des Armes
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--text-muted)',
            fontSize: isMobile ? '0.85rem' : '0.9rem',
          }}
        >
          Aperçu de l'aptitude au port d'arme.
        </p>
      </header>

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
                  textAlign: 'center',
                  margin: 0,
                  gap: '2px',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  border: '2px solid #000000',
                }
              : {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: '#dcfce7',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  border: '2px solid #000000',
                  padding: '1.5rem',
                }
          }
        >
          {isMobile ? (
            <>
              <FaUserShield size={20} color="#166534" />
              <div className="stat-card-value" style={{ color: '#166534', fontSize: '1.5rem' }}>
                {stats.active.length}
              </div>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#166534' }}>
                Apte
              </p>
            </>
          ) : (
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: '#166534' }}>Apte</h3>
                <div className="stat-card-value" style={{ color: '#166534' }}>
                  {stats.active.length}
                </div>
                <p style={{ margin: 0, fontWeight: 600, color: '#166534' }}>Détenteurs</p>
              </div>
              <div style={{ opacity: 0.8 }}>
                <FaUserShield size={60} color="#166534" />
              </div>
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
                  textAlign: 'center',
                  margin: 0,
                  border: '2px solid #000000',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  gap: '2px',
                }
              : {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--danger-light)',
                  padding: '1.5rem',
                  border: '2px solid #000000',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                }
          }
        >
          {isMobile ? (
            <>
              <FaExclamationTriangle size={20} color="var(--danger)" />
              <div className="stat-card-value" style={{ color: 'var(--danger)', fontSize: '1.5rem' }}>
                {stats.inapte.length}
              </div>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--danger-text)' }}>
                Inapte
              </p>
            </>
          ) : (
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: 'var(--danger-text)' }}>Inapte</h3>
                <div className="stat-card-value" style={{ color: 'var(--danger)' }}>
                  {stats.inapte.length}
                </div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--danger-text)' }}>Armes retirées</p>
              </div>
              <div style={{ opacity: 0.8 }}>
                <FaExclamationTriangle size={60} color="var(--danger)" />
              </div>
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
                  textAlign: 'center',
                  margin: 0,
                  border: '2px solid #000000',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                  gap: '2px',
                }
              : {
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--warning-light)',
                  padding: '1.5rem',
                  border: '2px solid #000000',
                  boxShadow: '4px 4px 0px rgba(0,0,0,0.1)',
                }
          }
        >
          {isMobile ? (
            <>
              <FaCalendarCheck size={20} color="var(--warning)" />
              <div className="stat-card-value" style={{ color: 'var(--warning)', fontSize: '1.5rem' }}>
                {stats.dueSoon.length}
              </div>
              <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--warning-text)' }}>
                Revoir
              </p>
            </>
          ) : (
            <>
              <div>
                <h3 className="stat-card-title" style={{ color: 'var(--warning-text)' }}>À Revoir</h3>
                <div className="stat-card-value" style={{ color: 'var(--warning)' }}>
                  {stats.dueSoon.length}
                </div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--warning-text)' }}>Sous 30 jours</p>
              </div>
              <div style={{ opacity: 0.8 }}>
                <FaCalendarCheck size={60} color="var(--warning)" />
              </div>
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
        {/* TABLEAU 1 : Aptitudes à revoir */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'none', background: 'transparent' }}>
          <div style={{ paddingBottom: '0.5rem', background: 'transparent' }}>
            <h3 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaCalendarCheck /> Prochaines Révisions
            </h3>
          </div>

          {stats.dueSoon.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'white', borderRadius: '12px', border: '2px solid #eee' }}>
              Aucune révision prévue prochainement.
            </div>
          ) : (
            <>
              <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '510px' : 'none', background: 'transparent', border: 'none', padding: 0, margin: 0 }}>
                <div className="hybrid-container" style={{ minWidth: '100%' }}>
                  <div className="hybrid-header" style={{ gridTemplateColumns: gridDashboard }}>
                    <div>Nom</div>
                    <div>Date Prévue</div>
                    <div style={{ textAlign: 'center' }}>Action</div>
                  </div>
                  {stats.dueSoon.map((h) => (
                    <div key={h.id} className="hybrid-row" style={{ gridTemplateColumns: gridDashboard }}>
                      <div className="hybrid-cell" style={{ fontWeight: 600 }}>{h.full_name}</div>
                      <div className="hybrid-cell">{logic.formatDateDisplay(h.next_review_date)}</div>
                      <div className="hybrid-actions" style={{ justifyContent: 'center' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => onNavigateWeaponHolder(h.id)}>
                          <FaEye />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* TABLEAU 2 : Activité Récente */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'none', background: 'transparent' }}>
          <div style={{ paddingBottom: '0.5rem', background: 'transparent' }}>
            <h3 style={{ marginBottom: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaHistory /> Activité Récente
            </h3>
          </div>

          {stats.latestExams.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'white', borderRadius: '12px', border: '2px solid #eee' }}>
              Aucun examen enregistré.
            </div>
          ) : (
            <>
              <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '510px' : 'none', background: 'transparent', border: 'none', padding: 0, margin: 0 }}>
                <div className="hybrid-container" style={{ minWidth: '100%' }}>
                  <div className="hybrid-header" style={{ gridTemplateColumns: gridDashboard }}>
                    <div>Détenteur</div>
                    <div>Décision</div>
                    <div style={{ textAlign: 'center' }}>Action</div>
                  </div>
                  {stats.latestExams.map((e) => (
                    <div key={e.id} className="hybrid-row" style={{ gridTemplateColumns: gridDashboard }}>
                      <div className="hybrid-cell" style={{ fontWeight: 600 }}>{e.holder?.full_name || 'Inconnu'}</div>
                      <div className="hybrid-cell">
                        <span className={`badge ${e.final_decision === 'apte' ? 'badge-green' : 'badge-red'}`}>
                          {e.final_decision?.toUpperCase()}
                        </span>
                      </div>
                      <div className="hybrid-actions" style={{ justifyContent: 'center' }}>
                        <button className="btn btn-sm btn-outline" onClick={() => onNavigateWeaponHolder(e.holder_id)}>
                          <FaEye />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
