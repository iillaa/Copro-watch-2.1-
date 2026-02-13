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
              {((!savedRecord?.id ||
                isCreatingRetest ||
                formData.request_date !== savedRecord.request_date) &&
                formData.request_date.startsWith(currentMonthISO)) && (
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
              3. RÉSULTATS
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

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1.5fr',
              gap: '1rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <label className="label" style={{ fontSize: '0.7rem' }}>
                Date
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
                Verdict
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
                <option value="potable">✅ EAU POTABLE</option>
                <option value="non_potable">⚠️ EAU NON POTABLE</option>
              </select>
            </div>
          </div>

          <input
            className="input"
            placeholder="Notes..."
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
