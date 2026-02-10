import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import { format, addMonths } from 'date-fns';

export default function WeaponExamForm({ holder, existingExam, onClose, onSave }) {
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
        if (name === 'final_decision' || name === 'inaptitude_duration' || name === 'commission_date') {
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
    await db.saveWeaponExam({
      ...formData,
      id: existingExam ? existingExam.id : undefined,
      holder_id: holder.id,
    });
    onSave();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '600px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)' }}>Commission Médicale - {holder.full_name}</h3>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="card" style={{ background: '#f8fafc', marginBottom: '1rem' }}>
            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
               <div style={{ flex: 1 }}>
                  <label className="label">Date Consultation (Cabinet)</label>
                  <input type="date" className="input" name="exam_date" value={formData.exam_date} onChange={handleChange} required />
               </div>
               <div style={{ flex: 1 }}>
                  <label className="label">Type / Motif</label>
                  <select className="input" name="visit_reason" value={formData.visit_reason} onChange={handleChange}>
                    <option value="Affection Somatique">Affection Somatique</option>
                    <option value="Affection Psychiatrique">Affection Psychiatrique</option>
                    <option value="Affection Psychologique">Affection Psychologique</option>
                    <option value="Par Précaution">Par Précaution</option>
                  </select>
               </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid #3b82f6' }}>
            <h4>Avis des Experts</h4>
            <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
               <div style={{ flex: 1 }}>
                  <label className="label">Mon Avis (Médecin)</label>
                  <select className="input" name="medical_aptitude" value={formData.medical_aptitude} onChange={handleChange}>
                    <option value="apte">Apte</option>
                    <option value="inapte">Inapte</option>
                  </select>
               </div>
               <div style={{ flex: 1 }}>
                  <label className="label">Avis Psychologue</label>
                  <select className="input" name="psych_advice" value={formData.psych_advice} onChange={handleChange}>
                    <option value="favorable">Favorable</option>
                    <option value="reserve">Réservé</option>
                  </select>
               </div>
            </div>
            <div className="form-group">
               <label className="label">Avis Chef de Service (Resp. Direct)</label>
               <select className="input" name="chief_advice" value={formData.chief_advice} onChange={handleChange}>
                  <option value="favorable">Favorable</option>
                  <option value="defavorable">Défavorable</option>
               </select>
            </div>
            <div className="form-group">
               <label className="label">Observations Générales</label>
               <textarea className="input" name="medical_obs" rows="2" value={formData.medical_obs} onChange={handleChange}></textarea>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid #a855f7', display: 'none' }}>
            {/* HIDDEN SECTION - PRESERVED TO AVOID ERROR IF REFERENCED ELSEWHERE */}
          </div>

          <div className="card" style={{ marginBottom: '1rem', borderLeft: '4px solid var(--primary)' }}>
            <h4>Décision de la Commission</h4>
            <div className="form-group">
               <label className="label">Date de la Commission (Verdict)</label>
               <input type="date" className="input" name="commission_date" value={formData.commission_date} onChange={handleChange} required />
            </div>
            <div className="form-group">
               <label className="label">Verdict Final</label>
               <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className={`btn ${formData.final_decision === 'apte' ? 'btn-success' : 'btn-outline'}`} onClick={() => handleChange({target: {name: 'final_decision', value: 'apte'}})}>Apte</button>
                  <button type="button" className={`btn ${formData.final_decision === 'inapte_temporaire' ? 'btn-danger' : 'btn-outline'}`} onClick={() => handleChange({target: {name: 'final_decision', value: 'inapte_temporaire'}})}>Inapte Temp.</button>
                  <button type="button" className={`btn ${formData.final_decision === 'inapte_definitif' ? 'btn-black' : 'btn-outline'}`} onClick={() => handleChange({target: {name: 'final_decision', value: 'inapte_definitif'}})}>Inapte Déf.</button>
               </div>
            </div>

            {formData.final_decision === 'inapte_temporaire' && (
               <div className="form-group">
                  <label className="label">Durée de l'inaptitude</label>
                  <select className="input" name="inaptitude_duration" value={formData.inaptitude_duration} onChange={handleChange}>
                    <option value="1">1 mois</option>
                    <option value="3">3 mois</option>
                    <option value="6">6 mois</option>
                    <option value="12">12 mois</option>
                  </select>
               </div>
            )}

            <div className="form-group">
               <label className="label">Prochaine révision prévue</label>
               <input type="date" className="input" name="next_review_date" value={formData.next_review_date} onChange={handleChange} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">Enregistrer la Décision</button>
          </div>
        </form>
      </div>
    </div>
  );
}
