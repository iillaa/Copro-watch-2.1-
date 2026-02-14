import { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import { FaTimes, FaSave, FaFlask } from 'react-icons/fa';
import { useToast } from './Toast';

export default function WaterAnalysisForm({
  type,
  analysis,
  department,
  workplace,
  analysisToEdit,
  onSuccess,
  onCancel,
}) {
  const { showToast, ToastContainer } = useToast();
  const isInitialized = useRef(false);
  const [formData, setFormData] = useState({
    department_id: department?.id || analysis?.department_id || analysis?.structure_id,
    request_date: new Date().toISOString().split('T')[0], // Default Request to Today
    sample_date: '',
    result_date: '',
    result: '',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill form when editing an existing analysis
  useEffect(() => {
    if (analysisToEdit) {
      setFormData({
        id: analysisToEdit.id,
        department_id: analysisToEdit.department_id || analysisToEdit.structure_id,
        request_date: analysisToEdit.request_date || '',
        sample_date: analysisToEdit.sample_date || '',
        result_date: analysisToEdit.result_date || '',
        result: analysisToEdit.result || '',
        notes: analysisToEdit.notes || '',
      });
    }
  }, [analysisToEdit]);

  useEffect(() => {
    // Only run this ONCE when the modal opens
    if (!isInitialized.current) {
      // Logic for new entries (not editing)
      if (type === 'edit') {
        // Handled above in analysisToEdit effect
      } else if (type === 'launch') {
        setFormData((prev) => ({
          ...prev,
          department_id: department?.id || workplace?.id,
          request_date: new Date().toISOString().split('T')[0],
          sample_date: new Date().toISOString().split('T')[0],
        }));
      } else if (type === 'result') {
        setFormData((prev) => ({
          ...prev,
          department_id: analysis?.department_id || analysis?.structure_id,
          request_date: analysis?.request_date || '',
          sample_date: analysis?.sample_date,
          result_date: new Date().toISOString().split('T')[0],
        }));
      } else if (type === 'retest') {
        setFormData((prev) => ({
          ...prev,
          department_id: department?.id || workplace?.id,
          request_date: new Date().toISOString().split('T')[0],
          sample_date: '',
        }));
      }
      isInitialized.current = true; // LOCK IT
    }
  }, [type, analysis, department, workplace]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    if (!formData.department_id) {
      showToast('Veuillez sélectionner un service.', 'error');
      return false;
    }

    // 1. Validate Request Date
    if (!formData.request_date) {
      showToast('Veuillez saisir la date de demande.', 'error');
      return false;
    }

    // 2. Validate Sample Date (if result is present)
    if (formData.result && formData.result !== 'pending' && !formData.sample_date) {
      showToast('Une date de prélèvement est requise pour enregistrer un résultat.', 'error');
      return false;
    }

    if ((type === 'result' || type === 'retest') && !formData.result) {
      showToast("Veuillez saisir le résultat de l'analyse.", 'error');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);

    try {
      let analysisData = { ...formData };

      // Ensure 'pending' status if launching without a result
      if (type === 'launch') {
        if (!analysisData.result) analysisData.result = 'pending';
      }

      await db.saveWaterAnalysis(analysisData);
      onSuccess(analysisData);
    } catch (error) {
      console.error('Error saving water analysis:', error);
      showToast('Erreur lors de la sauvegarde. Veuillez réessayer.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getFormTitle = () => {
    switch (type) {
      case 'launch':
        return 'Nouvelle analyse (Historique)';
      case 'result':
        return 'Saisir le résultat';
      case 'retest':
        return 'Nouvelle analyse (Contre-visite)';
      case 'edit':
        return "Détails / Modifier l'analyse";
      default:
        return "Analyse d'eau";
    }
  };

  return (
    // FIX: Using global 'modal-overlay' class for Blur + Z-Index (Covers Sidebar)
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="modal"
        style={{
          // Animation matches WorkerForm
          animation: 'modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: 'scale(0.9)',
          animationFillMode: 'forwards',
          maxWidth: '500px', // Matches original width
        }}
      >
        {/* Header - Styled like WorkerForm */}
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
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', color: 'var(--primary)' }}>
            <FaFlask style={{ marginRight: '0.5rem' }} /> {getFormTitle()}
          </h3>
          <button
            onClick={onCancel}
            style={{
              background: 'var(--danger-light)',
              border: '2px solid var(--danger)',
              color: 'var(--danger)',
              borderRadius: '8px',
              padding: '0.5rem',
              cursor: 'pointer',
              fontSize: '1.2rem',
              fontWeight: 'bold',
              transition: 'all 0.2s ease',
              lineHeight: 1,
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* 1. DATE DE DEMANDE */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Date de demande <span style={{ color: 'var(--danger)' }}>*</span>
            </label>
            <input
              type="date"
              name="request_date"
              value={formData.request_date}
              onChange={handleInputChange}
              required
              className="input"
            />
          </div>

          {/* 2. DATE DE PRÉLÈVEMENT */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Date de prélèvement
            </label>
            <input
              type="date"
              name="sample_date"
              value={formData.sample_date}
              onChange={handleInputChange}
              className="input"
            />
          </div>

          {/* 3. RESULTAT + DATE RESULTAT */}
          <div
            style={{
              marginBottom: '1rem',
              padding: '1rem',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Résultat Laboratoire
            </label>
            <select
              name="result"
              value={formData.result}
              onChange={handleInputChange}
              className="input"
              style={{ marginBottom: '1rem' }}
            >
              <option value="pending">En attente</option>
              <option value="potable">✅ Eau Potable</option>
              <option value="non_potable">⚠️ Non Potable</option>
            </select>

            <label
              style={{
                display: 'block',
                marginBottom: '0.5rem',
                fontWeight: '500',
                fontSize: '0.9rem',
              }}
            >
              Date du résultat
            </label>
            <input
              type="date"
              name="result_date"
              value={formData.result_date}
              onChange={handleInputChange}
              className="input"
              disabled={!formData.result || formData.result === 'pending'}
            />
          </div>

          {/* Notes */}
          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
              Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              rows={3}
              className="input"
              placeholder="Ex: Taux de chlore..."
            />
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onCancel} className="btn btn-outline" disabled={loading}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <FaSave style={{ marginRight: '0.5rem' }} />{' '}
              {loading ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </form>
        <ToastContainer />
      </div>
    </div>
  );
}
