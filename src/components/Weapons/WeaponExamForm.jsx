import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import { format, addMonths } from 'date-fns';

export default function WeaponExamForm({ holder, existingExam, onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    exam_date: format(new Date(), 'yyyy-MM-dd'), // Consultation medicale
    commission_date: format(new Date(), 'yyyy-MM-dd'), // Date de décision
    visit_reason: 'Affection Somatique', // Updated Options
    medical_aptitude: 'apte', // Medical Opinion
    medical_obs: '',
    psych_advice: 'favorable',
    chief_advice: 'favorable', // Chief Opinion
    final_decision: 'apte',
    inaptitude_duration: '0',
    next_review_date: '', // Default null for apte
  });

  useEffect(() => {
    if (existingExam) {
      setFormData(existingExam);
    }
  }, [existingExam]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => {
      const newData = { ...prev, [name]: value };

      // Auto-calculate next review date based on decision and COMMISSION date
      if (
        name === 'final_decision' ||
        name === 'inaptitude_duration' ||
        name === 'commission_date'
      ) {
        const baseDate = new Date(newData.commission_date || newData.exam_date);
        if (newData.final_decision === 'apte') {
          newData.next_review_date = ''; // Permanent
        } else if (newData.final_decision === 'inapte_temporaire') {
          const months = parseInt(newData.inaptitude_duration) || 1;
          newData.next_review_date = format(addMonths(baseDate, months), 'yyyy-MM-dd');
        } else {
          newData.next_review_date = ''; // Definitive
        }
      }
      return newData;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    try {
      setLoading(true);
      await db.saveWeaponExam({
        ...formData,
        id: existingExam ? existingExam.id : undefined,
        holder_id: holder.id,
      });
      onSave();
    } catch (err) {
      console.error('Failed to save exam:', err);
      alert('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveConsultation = async () => {
    if (loading) return;
    try {
      setLoading(true);
      // [FIX] Preserve everything in formData, but ensure it's marked as 'pending'
      // ONLY if it's a new exam or if it's already pending.
      // This allows editing the consultation date without reverting a final decision.
      const dataToSave = {
        ...formData,
        id: existingExam ? existingExam.id : undefined,
        holder_id: holder.id,
      };

      // If no existing exam, we force pending. If existing, we keep what's in the form.
      if (!existingExam && formData.final_decision === 'apte') {
        dataToSave.final_decision = 'pending';
      }

      await db.saveWeaponExam(dataToSave);
      onSave();
    } catch (err) {
      console.error('Failed to save consultation:', err);
      alert('Erreur lors de la sauvegarde: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // [SURGICAL UPDATE] Darker Colors & Neobrutal constants
  const getDecisionColor = () => {
    switch (formData.final_decision) {
      case 'apte':
        return '#15803d'; // Darker Green (Tailwind green-700)
      case 'inapte_temporaire':
        return '#b91c1c'; // Darker Red (Tailwind red-700)
      case 'inapte_definitif':
        return '#1f2937'; // Dark Gray/Black
      case 'pending':
        return '#d97706'; // Amber/Yellow
      default:
        return '#333333';
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '600px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            paddingBottom: '1rem',
            borderBottom: '2px solid var(--border-color)',
          }}
        >
          <h3 style={{ margin: 0, color: 'var(--primary)' }}>
            Commission Médicale - {holder.full_name}
          </h3>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="card" style={{ background: '#fffbeb', marginBottom: '1.5rem', border: '2px solid #f59e0b', boxShadow: '4px 4px 0px 0px #f59e0b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
               <h4 style={{ margin: 0, color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                 <span style={{ fontSize: '1.2rem' }}>🩺</span> 1. Consultation Médicale
               </h4>
               <button 
                type="button" 
                className="btn" 
                style={{ 
                  backgroundColor: '#ffffff', 
                  color: '#92400e', 
                  border: '2px solid #92400e', 
                  boxShadow: '2px 2px 0px 0px #92400e',
                  fontSize: '0.8rem',
                  padding: '5px 12px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                onClick={handleSaveConsultation}
               >
                 <span>💾</span> Enregistrer Consultation
               </button>
            </div>
            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label className="label">Date Consultation (Cabinet)</label>
                <input
                  type="date"
                  className="input"
                  name="exam_date"
                  value={formData.exam_date}
                  onChange={handleChange}
                  required
                />
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Type / Motif</label>
                <select
                  className="input"
                  name="visit_reason"
                  value={formData.visit_reason}
                  onChange={handleChange}
                >
                  <option value="Affection Somatique">Affection Somatique</option>
                  <option value="Affection Psychiatrique">Affection Psychiatrique</option>
                  <option value="Affection Psychologique">Affection Psychologique</option>
                  <option value="Par Précaution">Par Précaution</option>
                </select>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '1rem', textAlign: 'center', opacity: 0.5 }}>
             <div style={{ borderBottom: '2px dashed #ccc', height: '10px', marginBottom: '-10px' }}></div>
             <span style={{ background: '#fff', padding: '0 10px', fontSize: '0.8rem', fontWeight: 'bold' }}>PUIS</span>
          </div>

          <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid #3b82f6' }}>
            <h4>2. Avis des Experts</h4>
            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <label className="label">Mon Avis (Médecin)</label>
                <select
                  className="input"
                  name="medical_aptitude"
                  value={formData.medical_aptitude}
                  onChange={handleChange}
                >
                  <option value="apte">Apte</option>
                  <option value="inapte">Inapte</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label className="label">Avis Psychologue</label>
                <select
                  className="input"
                  name="psych_advice"
                  value={formData.psych_advice}
                  onChange={handleChange}
                >
                  <option value="favorable">Favorable</option>
                  <option value="reserve">Réservé</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Avis Chef de Service (Resp. Direct)</label>
              <select
                className="input"
                name="chief_advice"
                value={formData.chief_advice}
                onChange={handleChange}
              >
                <option value="favorable">Favorable</option>
                <option value="defavorable">Défavorable</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">Observations Générales</label>
              <textarea
                className="input"
                name="medical_obs"
                rows="2"
                value={formData.medical_obs}
                onChange={handleChange}
              ></textarea>
            </div>
          </div>

          <div
            className="card"
            style={{ marginBottom: '1rem', borderLeft: '4px solid #a855f7', display: 'none' }}
          >
            {/* HIDDEN SECTION - PRESERVED TO AVOID ERROR IF REFERENCED ELSEWHERE */}
          </div>

          {/* [SURGICAL REPLACEMENT] Dynamic Color Decision Card */}
          <div
            className="card"
            style={{
              marginBottom: '1rem',
              borderLeft: `8px solid ${getDecisionColor()}`,
              transition: 'border-color 0.3s ease',
            }}
          >
            <h4 style={{ color: getDecisionColor(), transition: 'color 0.3s ease' }}>
              Décision de la Commission
            </h4>

            <div className="form-group">
              <label className="label">Date de la Commission (Verdict)</label>
              <input
                type="date"
                className="input"
                name="commission_date"
                value={formData.commission_date}
                onChange={handleChange}
                required
              />
            </div>

            <div className="form-group">
              <label className="label">Verdict Final</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {/* APTE BUTTON (Neobrutal) */}
                <button
                  type="button"
                  className="btn"
                  style={{
                    flex: 1,
                    backgroundColor: formData.final_decision === 'apte' ? '#15803d' : '#ffffff',
                    color: formData.final_decision === 'apte' ? '#ffffff' : '#15803d',
                    border: '2px solid #000',
                    boxShadow: formData.final_decision === 'apte' ? '4px 4px 0px 0px #000' : 'none',
                    transform:
                      formData.final_decision === 'apte' ? 'translate(-2px, -2px)' : 'none',
                    fontWeight: '800',
                    transition: 'all 0.1s ease',
                  }}
                  onClick={() =>
                    handleChange({ target: { name: 'final_decision', value: 'apte' } })
                  }
                >
                  ✅ APTE
                </button>

                {/* INAPTE TEMP BUTTON (Neobrutal) */}
                <button
                  type="button"
                  className="btn"
                  style={{
                    flex: 1,
                    backgroundColor:
                      formData.final_decision === 'inapte_temporaire' ? '#b91c1c' : '#ffffff',
                    color: formData.final_decision === 'inapte_temporaire' ? '#ffffff' : '#b91c1c',
                    border: '2px solid #000',
                    boxShadow:
                      formData.final_decision === 'inapte_temporaire'
                        ? '4px 4px 0px 0px #000'
                        : 'none',
                    transform:
                      formData.final_decision === 'inapte_temporaire'
                        ? 'translate(-2px, -2px)'
                        : 'none',
                    fontWeight: '800',
                    transition: 'all 0.1s ease',
                  }}
                  onClick={() =>
                    handleChange({ target: { name: 'final_decision', value: 'inapte_temporaire' } })
                  }
                >
                  ⚠️ INAPTE TEMP.
                </button>

                {/* INAPTE DEF BUTTON (Neobrutal) */}
                <button
                  type="button"
                  className="btn"
                  style={{
                    flex: 1,
                    backgroundColor:
                      formData.final_decision === 'inapte_definitif' ? '#1f2937' : '#ffffff',
                    color: formData.final_decision === 'inapte_definitif' ? '#ffffff' : '#1f2937',
                    border: '2px solid #000',
                    boxShadow:
                      formData.final_decision === 'inapte_definitif'
                        ? '4px 4px 0px 0px #000'
                        : 'none',
                    transform:
                      formData.final_decision === 'inapte_definitif'
                        ? 'translate(-2px, -2px)'
                        : 'none',
                    fontWeight: '800',
                    transition: 'all 0.1s ease',
                  }}
                  onClick={() =>
                    handleChange({ target: { name: 'final_decision', value: 'inapte_definitif' } })
                  }
                >
                  ⛔ INAPTE DÉF.
                </button>
              </div>
            </div>

            {formData.final_decision === 'inapte_temporaire' && (
              <div className="form-group" style={{ animation: 'fadeIn 0.3s' }}>
                <label className="label">Durée de l'inaptitude</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {[1, 3, 6, 12].map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="btn"
                      style={{
                        flex: 1,
                        backgroundColor:
                          parseInt(formData.inaptitude_duration) === m ? '#ef4444' : '#fee2e2',
                        color: parseInt(formData.inaptitude_duration) === m ? 'white' : '#b91c1c',
                        border: 'none',
                      }}
                      onClick={() =>
                        handleChange({
                          target: { name: 'inaptitude_duration', value: m.toString() },
                        })
                      }
                    >
                      {m} Mois
                    </button>
                  ))}
                </div>
                <p style={{ marginTop: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                  Révision automatique le : <strong>{formData.next_review_date}</strong>
                </p>
              </div>
            )}

            {formData.final_decision === 'apte' && (
              <div
                style={{
                  padding: '0.5rem',
                  background: '#d1fae5',
                  color: '#065f46',
                  borderRadius: '4px',
                  textAlign: 'center',
                }}
              >
                Aptitude Permanente (Sauf incident)
              </div>
            )}
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}
          >
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Annuler
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ backgroundColor: getDecisionColor(), borderColor: getDecisionColor() }}
            >
              Enregistrer la Décision
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
