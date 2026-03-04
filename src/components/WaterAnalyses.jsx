import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import {
  FaSearch,
  FaTint,
  FaHistory,
  FaChartBar,
  FaTimes,
  FaFlask,
  FaChevronDown,
  FaChevronUp,
  FaEnvelopeOpenText,
} from 'react-icons/fa';
import WaterAnalysisPanel from './WaterAnalysisPanel';
import WaterServiceDetail from './WaterServiceDetail';

export default function WaterAnalyses({ compactMode }) {
  const [departments, setDepartments] = useState([]);
  const [waterAnalyses, setWaterAnalyses] = useState([]);

  // --- [NEW] MONTHLY REMINDER LOGIC ---
  const [showMonthlyReminder, setShowMonthlyReminder] = useState(false);

  useEffect(() => {
    const checkReminder = () => {
      const now = new Date();
      const day = now.getDate();
      const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
      
      // 1. Is it the first 5 days of the month?
      const isReminderPeriod = day >= 1 && day <= 5;
      
      // 2. Has it already been dismissed this month?
      const isDismissed = localStorage.getItem('water_lab_reminder_dismissed') === monthKey;

      if (isReminderPeriod && !isDismissed) {
        setShowMonthlyReminder(true);
      }
    };
    checkReminder();
  }, []);

  const dismissReminder = () => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    localStorage.setItem('water_lab_reminder_dismissed', monthKey);
    setShowMonthlyReminder(false);
  };
  // ------------------------------------

  // Search
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);

  // UI State
  const [expandedId, setExpandedId] = useState(null);
  const [modalDept, setModalDept] = useState(null);
  const [historyDept, setHistoryDept] = useState(null);

  // [NEW] Mobile Detection for UI Parity
  const checkMobile = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 768 || window.innerHeight < 600;
  };
  const [isMobile, setIsMobile] = useState(checkMobile());

  useEffect(() => {
    const handleResize = () => setIsMobile(checkMobile());
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // [FIX] CRITICAL: Safety check for null/undefined to prevent crash
  const loadData = async () => {
    try {
      const [depts, analyses] = await Promise.all([
        db.getWaterDepartments(),
        db.getWaterAnalyses(),
      ]);
      setDepartments(depts || []);
      setWaterAnalyses(analyses || []);
    } catch (error) {
      console.error('Error loading water data:', error);
      setDepartments([]);
      setWaterAnalyses([]);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter & Stats
  const filteredDepartments = useMemo(() => {
    const safeDepts = departments || [];
    const safeAnalyses = waterAnalyses || [];

    const withStatus = logic.getDepartmentsWaterStatus(safeDepts, safeAnalyses);
    const withStats = withStatus.map((dept) => {
      const analysesForDept = safeAnalyses.filter(
        (a) => a.department_id === dept.id || a.structure_id === dept.id
      );

      const potable = analysesForDept.filter((a) => a.result === 'potable').length;
      const nonPotable = analysesForDept.filter((a) => a.result === 'non_potable').length;
      const pending = analysesForDept.filter((a) => a.result === 'pending' || !a.result).length;
      const total = analysesForDept.length;

      const latestAnalysis = analysesForDept.sort(
        (a, b) =>
          new Date(b.request_date || b.sample_date) - new Date(a.request_date || a.sample_date)
      )[0];
      const displayDate = latestAnalysis
        ? latestAnalysis.request_date || latestAnalysis.sample_date
        : null;

      return { ...dept, stats: { potable, nonPotable, pending, total }, displayDate };
    });

    if (!deferredSearch) return withStats;
    return withStats.filter((d) => d.name.toLowerCase().includes(deferredSearch.toLowerCase()));
  }, [departments, waterAnalyses, deferredSearch]);

  // [FIX] LOGIC: Count SERVICES status based on their LAST analysis of the CURRENT MONTH
  const currentMonthISO = new Date().toISOString().substring(0, 7); // e.g., "2026-02"

  const globalStats = useMemo(() => {
    let potableCount = 0;
    let nonPotableCount = 0;

    // We iterate through SERVICES (Departments), not analyses
    const totalServices = departments ? departments.length : 0;

    (departments || []).forEach((dept) => {
      // 1. Get analyses for this specific service
      const deptAnalyses = (waterAnalyses || []).filter(
        (a) => a.department_id === dept.id || a.structure_id === dept.id
      );

      // 2. Filter: Keep only THIS MONTH's analyses
      const thisMonthAnalyses = deptAnalyses.filter((a) =>
        (a.request_date || a.sample_date || '').startsWith(currentMonthISO)
      );

      // 3. Find the LATEST analysis for this month
      // Sort descending (Newest date first)
      thisMonthAnalyses.sort((a, b) => {
        const parseDate = (d) => {
          const date = new Date(d.request_date || d.sample_date || 0);
          return isNaN(date.getTime()) ? 0 : date.getTime();
        };
        const dateA = parseDate(a);
        const dateB = parseDate(b);
        return dateB - dateA;
      });

      const lastAnalysis = thisMonthAnalyses[0]; // The one that defines the status

      // 4. Assign Status
      if (lastAnalysis?.result === 'potable') {
        potableCount++;
      } else if (lastAnalysis?.result === 'non_potable') {
        nonPotableCount++;
      }
      // If no analysis exists for this month, or it is pending, it counts towards "En Attente"
    });

    // "En Attente" = Total Services - (Potable + NonPotable)
    // This ensures the 3 cards ALWAYS add up to the total number of services.
    const pendingCount = totalServices - potableCount - nonPotableCount;

    return {
      potable: potableCount,
      nonPotable: nonPotableCount,
      pending: pendingCount,
    };
  }, [departments, waterAnalyses, currentMonthISO]);

  const currentMonthName = new Date().toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // --- VIEW: HISTORY ---
  if (historyDept) {
    return (
      <WaterServiceDetail
        department={historyDept}
        onBack={() => {
          setHistoryDept(null);
          loadData();
        }}
        onSave={loadData}
        compactMode={compactMode}
      />
    );
  }

  // --- VIEW: DASHBOARD ---
  return (
    <div style={{ height: compactMode ? '100%' : 'auto', paddingBottom: '2rem' }}>
      
      {/* MONTHLY REMINDER BANNER */}
      {showMonthlyReminder && (
        <div
          style={{
            background: '#eff6ff', // Soft Blue
            color: '#1e3a8a', // Dark Blue text
            padding: '1rem 1.5rem',
            borderRadius: '16px',
            marginBottom: '2.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '3px solid black', // Hard Neobrutalist border
            boxShadow: '6px 6px 0px rgba(0,0,0,1)', // Hard shadow
            animation: 'slideFadeIn 0.5s ease-out',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ 
              background: '#dbeafe', 
              padding: '10px', 
              borderRadius: '12px',
              border: '2px solid black',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <FaEnvelopeOpenText size={24} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Rappel Mensuel</h4>
              <p style={{ margin: '2px 0 0 0', opacity: 0.8, fontSize: '0.9rem', fontWeight: 600 }}>
                N'oubliez pas de rédiger la lettre pour le responsable du laboratoire d'analyses.
              </p>
            </div>
          </div>
          <button 
            onClick={dismissReminder}
            style={{ 
              color: 'black', 
              background: 'white',
              border: '2px solid black',
              borderRadius: '8px',
              padding: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              boxShadow: '2px 2px 0px black'
            }}
            title="Masquer pour ce mois"
          >
            <FaTimes size={16} />
          </button>
        </div>
      )}

      {/* --- NEW CLEAN HEADER --- */}
      <div style={{ marginBottom: '2rem' }}>
        {/* TITLE */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'end',
            marginBottom: '1.5rem',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                fontSize: '1.8rem',
              }}
            >
              <FaTint style={{ color: 'var(--primary)' }} /> Qualité de l'Eau
            </h2>
            <p
              style={{ margin: '0.25rem 0 0 0.5rem', color: 'var(--text-muted)', fontWeight: 500 }}
            >
              Suivi mensuel :{' '}
              <span style={{ textTransform: 'capitalize', color: 'black', fontWeight: 700 }}>
                {currentMonthName}
              </span>
            </p>
          </div>
        </div>

        {/* KPI CARDS (Standardized Parity) */}
        <div
          style={
            isMobile
              ? {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.5rem',
                  marginBottom: '1.5rem',
                }
              : {
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                }
          }
        >
          {/* Card 1: POTABLE */}
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
                {/* Clean Water Drop SVG */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem' }}>
                  <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>
                  <path d="M9 15.5l2 2 4-4"></path>
                </svg>
                <div style={{ color: '#166534', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {globalStats.potable}
                </div>
                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: '#166534', lineHeight: 1 }}>
                  Potable
                </p>
              </>
            ) : (
              <>
                <div>
                  <h3 className="stat-card-title" style={{ color: '#166534' }}>
                    Eau Potable
                  </h3>
                  <div className="stat-card-value" style={{ color: '#166534' }}>
                    {globalStats.potable}
                  </div>
                  <p style={{ margin: 0, fontWeight: 600, color: '#166534' }}>
                    Conforme ce mois
                  </p>
                </div>
                <div style={{ opacity: 0.8 }}>
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#166534" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>
                    <path d="M9 15.5l2 2 4-4"></path>
                  </svg>
                </div>
              </>
            )}
          </div>

          {/* Card 2: NON POTABLE */}
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
                {/* [NEW] Custom Bacterial Contamination Drop (Mobile) */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem' }}>
                  {/* Outer Water Drop */}
                  <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>
                  {/* Central Microbe Core */}
                  <circle cx="12" cy="15" r="1.5"></circle>
                  {/* Microbe Spikes */}
                  <path d="M12 11.5v2"></path>
                  <path d="M12 16.5v2"></path>
                  <path d="M9.5 12.5l1.5 1.5"></path>
                  <path d="M14.5 17.5l-1.5-1.5"></path>
                  <path d="M9.5 17.5l1.5-1.5"></path>
                  <path d="M14.5 12.5l-1.5 1.5"></path>
                </svg>
                <div style={{ color: 'var(--danger)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {globalStats.nonPotable}
                </div>
                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--danger-text)', lineHeight: 1 }}>
                  Polluée
                </p>
              </>
            ) : (
              <>
                <div>
                  <h3 className="stat-card-title" style={{ color: 'var(--danger-text)' }}>
                    Non Potable
                  </h3>
                  <div className="stat-card-value" style={{ color: 'var(--danger)' }}>
                    {globalStats.nonPotable}
                  </div>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--danger-text)' }}>
                    Action requise
                  </p>
                </div>
                <div style={{ opacity: 0.8 }}>
                  {/* [NEW] Custom Bacterial Contamination Drop (Desktop) */}
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"></path>
                    <circle cx="12" cy="15" r="1.5"></circle>
                    <path d="M12 11.5v2"></path>
                    <path d="M12 16.5v2"></path>
                    <path d="M9.5 12.5l1.5 1.5"></path>
                    <path d="M14.5 17.5l-1.5-1.5"></path>
                    <path d="M9.5 17.5l1.5-1.5"></path>
                    <path d="M14.5 12.5l-1.5 1.5"></path>
                  </svg>
                </div>
              </>
            )}
          </div>

          {/* Card 3: EN ATTENTE */}
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
                {/* Lab Hourglass SVG */}
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem' }}>
                  <path d="M5 22h14"></path>
                  <path d="M5 2h14"></path>
                  <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"></path>
                  <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"></path>
                </svg>
                <div style={{ color: 'var(--warning)', fontSize: '1.5rem', fontWeight: 'bold' }}>
                  {globalStats.pending}
                </div>
                <p style={{ margin: 0, fontSize: '0.7rem', fontWeight: 700, color: 'var(--warning-text)', lineHeight: 1 }}>
                  En Cours
                </p>
              </>
            ) : (
              <>
                <div>
                  <h3 className="stat-card-title" style={{ color: 'var(--warning-text)' }}>
                    En Attente
                  </h3>
                  <div className="stat-card-value" style={{ color: 'var(--warning)' }}>
                    {globalStats.pending}
                  </div>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--warning-text)' }}>
                    Résultats labo
                  </p>
                </div>
                <div style={{ opacity: 0.8 }}>
                  <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 22h14"></path>
                    <path d="M5 2h14"></path>
                    <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"></path>
                    <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"></path>
                  </svg>
                </div>
              </>
            )}
          </div>
        </div>
        {/* STYLED SEARCH BAR */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0.75rem 1rem',
            background: 'white',
            borderRadius: '12px',
            border: '2px solid black', // Neo-brutalist Border
            boxShadow: '4px 4px 0px #cbd5e1', // Soft Grey Shadow
          }}
        >
          <FaSearch style={{ color: 'var(--text-muted)', marginRight: '0.75rem' }} />
          <input
            style={{
              border: 'none',
              outline: 'none',
              width: '100%',
              fontSize: '1rem',
              background: 'transparent',
              fontWeight: 500,
            }}
            placeholder="Rechercher un service..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* LIST */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {filteredDepartments.map((dept) => {
          const isExpanded = expandedId === dept.id;
          const statusColor = logic.getServiceWaterStatusColor(dept.waterStatus);

          return (
            <div
              key={dept.id}
              className="card"
              style={{
                border: '1px solid black',
                borderLeft: `8px solid ${statusColor}`,
                // [FIX] Grey shadow (#94a3b8) when closed, Colored when open
                boxShadow: isExpanded ? `6px 6px 0px ${statusColor}` : '4px 4px 0px #94a3b8',

                borderRadius: '16px',
                padding: 0,
                marginBottom: 0,
                transform: isExpanded ? 'translate(-2px, -2px)' : 'none',
                transition: 'all 0.2s ease',
                overflow: 'hidden',
              }}
            >
              {/* HEADER */}
              <div
                onClick={() => toggleExpand(dept.id)}
                style={{
                  padding: '1.25rem',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'white',
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{dept.name}</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    {dept.displayDate
                      ? `Dernier: ${logic.formatDateDisplay(dept.displayDate)}`
                      : 'Aucune donnée'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span
                    className="badge"
                    style={{
                      backgroundColor: statusColor,
                      color: 'white',
                      minWidth: '100px',
                      textAlign: 'center',
                      borderRadius: '8px',
                    }}
                  >
                    {logic.getServiceWaterStatusLabel(dept.waterStatus)}
                  </span>
                  {isExpanded ? <FaChevronUp color="#94a3b8" /> : <FaChevronDown color="#94a3b8" />}
                </div>
              </div>

              {/* EXPANDED CONTENT */}
              {isExpanded && (
                <div
                  style={{
                    padding: '1.5rem',
                    borderTop: '2px dashed #e2e8f0',
                    background: '#f8fafc',
                    animation: 'fadeIn 0.2s ease',
                  }}
                >
                  {/* STATS */}
                  <div style={{ marginBottom: '1.5rem' }}>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '0.5rem',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: 'var(--text-muted)',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <FaChartBar /> BILAN ANNUEL
                      </span>
                      <span>{dept.stats.total} analyses</span>
                    </div>
                    <div
                      style={{
                        height: '10px',
                        background: '#e2e8f0',
                        borderRadius: '5px',
                        overflow: 'hidden',
                        display: 'flex',
                      }}
                    >
                      <div
                        style={{
                          width: `${(dept.stats.potable / Math.max(dept.stats.total, 1)) * 100}%`,
                          background: 'var(--success)',
                        }}
                      />
                      <div
                        style={{
                          width: `${
                            (dept.stats.nonPotable / Math.max(dept.stats.total, 1)) * 100
                          }%`,
                          background: 'var(--danger)',
                        }}
                      />
                      <div
                        style={{
                          width: `${(dept.stats.pending / Math.max(dept.stats.total, 1)) * 100}%`,
                          background: '#94a3b8',
                        }}
                      />
                    </div>
                  </div>

                  {/* ACTIONS */}
                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      className="btn btn-outline"
                      onClick={() => setHistoryDept(dept)}
                      style={{ flex: 1, borderRadius: '12px' }}
                    >
                      <FaHistory /> Historique
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => setModalDept(dept)}
                      style={{ flex: 1, borderRadius: '12px' }}
                    >
                      <FaFlask /> Saisir Analyse
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* --- MODAL --- */}
      {modalDept && (
        <div className="modal-overlay" onClick={() => setModalDept(null)}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '95%',
              maxWidth: '600px',
              padding: 0,
              border: '3px solid black',
              boxShadow: '8px 8px 0px rgba(0,0,0,0.3)',
              borderRadius: '20px',
              overflow: 'hidden',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderBottom: '2px solid black',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FaFlask color="var(--primary)" /> {modalDept.name}
              </h3>

              {/* [FIX] Red X Close Button (Square) */}
              <button
                onClick={() => setModalDept(null)}
                style={{
                  background: 'var(--danger-light)', // Light Red Background
                  border: '2px solid var(--danger)', // Dark Red Border
                  color: 'var(--danger)', // Dark Red Icon
                  borderRadius: '8px', // Rounded Square
                  padding: '0.5rem',
                  cursor: 'pointer',
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '36px',
                  height: '36px',
                }}
              >
                ×
              </button>
            </div>

            <div style={{ maxHeight: '70vh', overflowY: 'auto', padding: '1rem' }}>
              <WaterAnalysisPanel
                department={modalDept}
                // [FIX] Safety check for filter
                analyses={(waterAnalyses || []).filter(
                  (a) => a.department_id === modalDept.id || a.structure_id === modalDept.id
                )}
                onUpdate={() => loadData()}
                isEmbedded={true}
              />
            </div>

            <div
              style={{
                padding: '1rem',
                background: '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                textAlign: 'right',
              }}
            >
              <button
                className="btn btn-outline"
                onClick={() => setModalDept(null)}
                style={{ borderRadius: '12px' }}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
