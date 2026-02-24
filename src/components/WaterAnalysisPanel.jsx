import { useState, useEffect } from 'react';
import { db } from '../services/db';
import {
  FaSave,
  FaCheckCircle,
  FaExclamationTriangle,
  FaNotesMedical,
  FaVial,
  FaCalendarAlt,
  FaClipboardList,
  FaTrash,
} from 'react-icons/fa';

// [FIX] Default empty array for analyses to prevent "undefined" crash
export default function WaterAnalysisPanel({
  department,
  analyses = [],
  onUpdate,
  isEmbedded = false,
}) {
  // 1. DATA FINDER (Current Month Only)
  const currentMonthISO = new Date().toISOString().substring(0, 7);

  // [FIX] Sort by ID desc to get LATEST action (Retest Fix) + Safety Check
  const savedRecord = (analyses || [])
    .filter((a) => (a.request_date || a.sample_date || '').startsWith(currentMonthISO))
    .sort((a, b) => b.id - a.id)[0];

  // 2. FORM STATE
  const [formData, setFormData] = useState({
    request_date: '',
    sample_date: '',
    result_date: '',
    result: 'pending',
    notes: '',
  });

  const [isCreatingRetest, setIsCreatingRetest] = useState(false);

  // 3. SYNC DATA
  useEffect(() => {
    if (isCreatingRetest) return;

    if (savedRecord) {
      setFormData({
        id: savedRecord.id,
        request_date: savedRecord.request_date || '',
        sample_date: savedRecord.sample_date || '',
        result_date: savedRecord.result_date || '',
        result: savedRecord.result || 'pending',
        notes: savedRecord.notes || '',
        department_id: department.id,
      });
    } else {
      resetForm();
    }
  }, [department, savedRecord, isCreatingRetest]);

  const resetForm = () => {
    setFormData({
      department_id: department.id,
      request_date: new Date().toISOString().split('T')[0],
      sample_date: '',
      result_date: '',
      result: 'pending',
      notes: '',
    });
  };

  // 4. HANDLERS
  const handleSave = async (step) => {
    let dataToSave = { ...formData, department_id: department.id };
    const today = new Date().toISOString().split('T')[0];

    // [FIX] Allow blank dates (Deleted auto-fill logic)
    // if (step === 'sample' && !dataToSave.sample_date) dataToSave.sample_date = today;
    // if (step === 'result' && !dataToSave.result_date) dataToSave.result_date = today;

    await db.saveWaterAnalysis(dataToSave);
    setIsCreatingRetest(false);
    onUpdate();
  };

  const handleUndo = async (step) => {
    if (step === 'request' && !window.confirm("⚠️ Cela effacera toute l'analyse. Continuer ?"))
      return;
    if (step === 'result' && !window.confirm('Modifier le résultat ?')) return;

    let dataToSave = { ...formData };

    if (step === 'result') {
      dataToSave.result_date = '';
      dataToSave.result = 'pending';
      await db.saveWaterAnalysis(dataToSave);
      onUpdate(); // <--- [CRITICAL FIX] Refresh the parent so the inputs unlock!
    } else if (step === 'request') {
      if (dataToSave.id) {
        await db.deleteWaterAnalysis(dataToSave.id);
        resetForm();
        onUpdate();
        return;
      }
    }
  };

  const handleStartRetest = () => {
    setIsCreatingRetest(true);
    setFormData({
      department_id: department.id,
      request_date: new Date().toISOString().split('T')[0],
      sample_date: '',
      result_date: '',
      result: 'pending',
      notes: 'Contre-visite : ',
    });
  };

  // 5. STATUS LOGIC
  // [FIX] If retesting, ignore the saved record so the form is unlocked (Fresh Start)
  const activeRecord = isCreatingRetest ? null : savedRecord;

  const isRequestSaved = !!activeRecord?.request_date;
  const isSampleSaved = !!activeRecord?.sample_date;
  const isResultSaved = !!activeRecord?.result_date;

  const getStatusHeader = () => {
    if (isCreatingRetest)
      return {
        bg: 'var(--danger)',
        text: 'CONTRE-VISITE (NOUVELLE)',
        icon: <FaExclamationTriangle />,
      };

    if (activeRecord?.result === 'non_potable')
      return { bg: 'var(--danger)', text: 'EAU NON POTABLE', icon: <FaExclamationTriangle /> };
    if (activeRecord?.result === 'potable')
      return { bg: 'var(--success)', text: 'EAU POTABLE', icon: <FaCheckCircle /> };

    if (isResultSaved)
      return { bg: 'var(--warning)', text: 'EN ATTENTE VALIDATION', icon: <FaClipboardList /> };
    if (isSampleSaved) return { bg: 'var(--warning)', text: 'ANALYSE EN COURS', icon: <FaVial /> };
    if (isRequestSaved)
      return { bg: 'var(--primary)', text: 'DEMANDE CRÉÉE', icon: <FaCalendarAlt /> };
    return { bg: '#94a3b8', text: 'AUCUNE ANALYSE', icon: <FaClipboardList /> };
  };
  const status = getStatusHeader();

  // STYLES
  const containerStyle = isEmbedded
    ? {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }
    : {
        border: '1px solid black',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '4px 4px 0px rgba(2, 1, 1, 0.2)',
        marginBottom: '1rem',
        borderRadius: '16px',
        overflow: 'hidden',
      };

  return (
    <div style={containerStyle}>
      {/* HEADER */}
      <div
        style={{
          backgroundColor: status.bg,
          color: 'white',
          padding: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          border: isEmbedded ? '2px solid rgba(23, 23, 23, 0.1)' : 'none',
          borderBottom: '1px solid black',
          borderRadius: isEmbedded ? '12px' : '0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.5rem' }}>{status.icon}</span>
          <div>
            <div
              style={{
                fontSize: '0.75rem',
                opacity: 0.9,
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              ÉTAT DU MOIS
            </div>
            <div style={{ fontSize: '1.2rem', fontWeight: 900 }}>{status.text}</div>
          </div>
        </div>
      </div>

      {/* BODY */}
      <div
        style={{
          padding: isEmbedded ? '0' : '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          background: '#fff',
        }}
      >
        {/* LOGISTICS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          {/* STEP 1: REQUEST */}
          <div style={{ opacity: isSampleSaved ? 0.6 : 1 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}
            >
              <label className="label" style={{ fontSize: '0.75rem', marginBottom: 0 }}>
                1. Demande
              </label>
              {isRequestSaved && !isSampleSaved && !isCreatingRetest && (
                <span
                  onClick={() => handleUndo('request')}
                  style={{
                    cursor: 'pointer',
                    color: 'var(--danger)',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <FaTrash size={10} /> SUPPRIMER
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="date"
                className="input"
                value={formData.request_date}
                onChange={(e) => setFormData({ ...formData, request_date: e.target.value })}
                // [FIX] Only lock if the Final Result is saved. Allows editing while in progress.
                disabled={isResultSaved}
                style={{ borderRadius: '8px' }}
              />
              {/* [FIX] Show OK only for current month dates - disable for older dates */}
              {(!savedRecord?.id ||
                isCreatingRetest ||
                formData.request_date !== savedRecord.request_date) &&
                formData.request_date.startsWith(currentMonthISO) && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => handleSave('request')}
                    style={{ borderRadius: '8px' }}
                  >
                    OK
                  </button>
                )}
              {/* Show message for old dates */}
              {formData.request_date && !formData.request_date.startsWith(currentMonthISO) && (
                <span style={{ fontSize: '0.65rem', color: 'var(--danger)', fontWeight: 600 }}>
                  Mois en cours uniquement
                </span>
              )}
            </div>
          </div>

          {/* STEP 2: SAMPLE */}
          <div style={{ opacity: !isRequestSaved ? 0.4 : 1 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}
            >
              <label className="label" style={{ fontSize: '0.75rem', marginBottom: 0 }}>
                2. Prélèvement
              </label>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="date"
                className="input"
                value={formData.sample_date}
                onChange={(e) => setFormData({ ...formData, sample_date: e.target.value })}
                // [FIX] Unlock input even if saved, as long as Result is NOT final
                disabled={!isRequestSaved || isResultSaved}
                style={{ borderRadius: '8px' }}
              />
              {/* [FIX] Show OK button if data changed */}
              {isRequestSaved &&
                !isResultSaved &&
                (!isSampleSaved || formData.sample_date !== savedRecord?.sample_date) && (
                  <button
                    className="btn btn-warning btn-sm"
                    onClick={() => handleSave('sample')}
                    style={{ borderRadius: '8px' }}
                  >
                    OK
                  </button>
                )}
            </div>
          </div>
        </div>

        {/* STEP 3: RESULT */}
        <div
          style={{
            borderTop: '2px dashed #cbd5e1',
            paddingTop: '1rem',
            opacity: !isSampleSaved ? 0.5 : 1,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <label className="label" style={{ color: 'var(--primary)', fontWeight: 800 }}>
              3. RÉSULTATS LABO
            </label>
            {isResultSaved && savedRecord?.result !== 'non_potable' && (
              <span
                onClick={() => handleUndo('result')}
                style={{
                  cursor: 'pointer',
                  color: 'var(--danger)',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                }}
              >
                MODIFIER
              </span>
            )}
          </div>

          {/* DYNAMIC SVG MICROBIOLOGY VISUALIZER & INPUTS */}
          <div
            style={{
              display: 'flex',
              gap: '1.5rem',
              alignItems: 'center',
              marginBottom: '1rem',
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* SVG Visualizer */}
            <div style={{ width: '50px', height: '70px', display: 'flex', justifyContent: 'center' }}>
              <svg viewBox="0 0 100 120" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                {/* Tube Body */}
                <path d="M 30 10 L 30 90 A 20 20 0 0 0 70 90 L 70 10" fill="none" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
                {/* Tube Rim */}
                <line x1="20" y1="10" x2="80" y2="10" stroke="#64748b" strokeWidth="6" strokeLinecap="round" />
                
                {/* Liquid Fill - Animates based on status */}
                <g style={{ transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' }}>
                  <path 
                    className="liquid-path"
                    d={
                      formData.result === 'potable' ? "M 33 40 L 33 90 A 17 17 0 0 0 67 90 L 67 40 Q 50 45 33 40 Z" :
                      formData.result === 'non_potable' ? "M 33 30 L 33 90 A 17 17 0 0 0 67 90 L 67 30 Q 50 25 33 30 Z" :
                      "M 33 70 L 33 90 A 17 17 0 0 0 67 90 L 67 70 Q 50 72 33 70 Z"
                    } 
                    fill={
                      formData.result === 'potable' ? '#38bdf8' : 
                      formData.result === 'non_potable' ? '#ef4444' : 
                      '#cbd5e1'
                    } 
                  />
                  
                  {/* Biohazard/Bacteria particles for non_potable */}
                  {formData.result === 'non_potable' && (
                    <g opacity="0.8">
                      <circle cx="45" cy="50" r="4" fill="#7f1d1d" />
                      <circle cx="55" cy="65" r="3" fill="#7f1d1d" />
                      <circle cx="40" cy="75" r="5" fill="#7f1d1d" />
                      <circle cx="60" cy="80" r="3.5" fill="#7f1d1d" />
                    </g>
                  )}
                  {/* Sparkles for potable */}
                  {formData.result === 'potable' && (
                    <g opacity="0.9">
                      <path d="M 45 60 L 45 70 M 40 65 L 50 65" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      <path d="M 55 75 L 55 81 M 52 78 L 58 78" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                    </g>
                  )}
                </g>
              </svg>
            </div>

            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
              <div>
                <label className="label" style={{ fontSize: '0.7rem' }}>
                  Date d'Analyse
                </label>
                <input
                  type="date"
                  className="input"
                  value={formData.result_date}
                  onChange={(e) => setFormData({ ...formData, result_date: e.target.value })}
                  disabled={!isSampleSaved}
                  style={{ borderRadius: '8px' }}
                />
              </div>
              <div>
                <label className="label" style={{ fontSize: '0.7rem' }}>
                  Verdict Bactériologique
                </label>
                <select
                  className="input"
                  value={formData.result}
                  onChange={(e) => setFormData({ ...formData, result: e.target.value })}
                  disabled={!isSampleSaved}
                  style={{
                    fontWeight: 800,
                    borderRadius: '8px',
                    color:
                      formData.result === 'potable'
                        ? 'var(--success)'
                        : formData.result === 'non_potable'
                        ? 'var(--danger)'
                        : 'inherit',
                  }}
                >
                  <option value="pending">⏳ En attente</option>
                  <option value="potable">✅ CONFORME (Potable)</option>
                  <option value="non_potable">⚠️ CONTAMINÉE (Non Potable)</option>
                </select>
              </div>
            </div>
          </div>

          <input
            className="input"
            placeholder="Notes (ex: Taux de coliformes, observations du labo)..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            disabled={!isSampleSaved}
            style={{ borderRadius: '8px' }}
          />

          {isSampleSaved &&
            // [FIX] Show button if ANY field changed
            (!isResultSaved ||
              formData.result !== savedRecord?.result ||
              formData.result_date !== savedRecord?.result_date ||
              formData.notes !== savedRecord?.notes) && (
              <button
                className="btn btn-primary"
                onClick={() => handleSave('result')}
                style={{ width: '100%', marginTop: '1rem', borderRadius: '12px' }}
              >
                <FaSave /> ENREGISTRER RÉSULTAT
              </button>
            )}
        </div>

        {/* EMERGENCY */}
        {savedRecord?.result === 'non_potable' && savedRecord?.result_date && !isCreatingRetest && (
          <button
            className="btn"
            style={{
              background: '#fee2e2',
              color: 'var(--danger)',
              border: '2px solid var(--danger)',
              width: '100%',
              fontWeight: 800,
              borderRadius: '12px',
            }}
            onClick={handleStartRetest}
          >
            <FaNotesMedical /> LANCER CONTRE-VISITE
          </button>
        )}
      </div>
    </div>
  );
}
