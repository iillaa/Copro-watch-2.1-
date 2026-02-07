import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import { format } from 'date-fns';

export default function ExamForm({
  worker,
  existingExam,
  onClose,
  onSave,
  deptName,
  workplaceName,
}) {
  // 1. État pour la date de validation (Consultation de retour)
  const [validationDate, setValidationDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  const [formData, setFormData] = useState({
    exam_date: format(new Date(), 'yyyy-MM-dd'),
    physician_name: '', // Empty by default, we load it below
    notes: '',
    status: 'open',
    // Lab
    lab_result: null,
    // Treatment
    treatment: null,
    // Decision
    decision: null,
  });

  useEffect(() => {
    if (existingExam) {
      setFormData(existingExam);
      // Si on édite un examen existant qui a déjà une décision, on pourrait vouloir mettre à jour validationDate
      if (existingExam.decision?.date) {
        setValidationDate(existingExam.decision.date);
      }
    }
  }, [existingExam]);

  // [NEW] Effect to load the default name from Settings
  useEffect(() => {
    const loadDefaultPhysician = async () => {
      // Only load if we are NOT editing an existing exam (which already has a name)
      if (!existingExam) {
        const s = await db.getSettings();
        if (s.doctor_name) {
          setFormData((prev) => ({ ...prev, physician_name: s.doctor_name }));
        } else {
          // Fallback if nothing saved yet
          setFormData((prev) => ({ ...prev, physician_name: 'Dr. Kibeche Ali Dia Eddine' }));
        }
      }
    };
    loadDefaultPhysician();
  }, [existingExam]);

  const updateField = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleLabResult = (result) => {
    const labData = {
      result,
      date: formData.exam_date,
      parasite: result === 'positive' ? 'Parasite X' : '',
    };
    updateField('lab_result', labData);
  };

  const handleDecision = async (status) => {
    // 1. Sauvegarde de la Décision
    // On utilise la date de validation (retour labo) si disponible
    const finalDecisionDate = validationDate || formData.exam_date;

    const decision = {
      status,
      date: finalDecisionDate,
    };

    // On garde formData.exam_date comme date de prescription historique
    const newExamData = { ...formData, decision, status: 'closed' };

    await db.saveExam({ ...newExamData, worker_id: worker.id });

    // 2. Recalcul du statut avec la nouvelle logique (date de décision)
    const allExams = await db.getExams();
    const workerExams = allExams.filter((e) => e.worker_id === worker.id);
    const statusUpdate = logic.recalculateWorkerStatus(workerExams);

    await db.saveWorker({ ...worker, ...statusUpdate });

    onSave();
  };

  const saveWithoutDecision = async () => {
    await db.saveExam({ ...formData, worker_id: worker.id });

    // Recalcul simple
    const allExams = await db.getExams();
    const workerExams = allExams.filter((e) => e.worker_id === worker.id);
    const statusUpdate = logic.recalculateWorkerStatus(workerExams);

    await db.saveWorker({ ...worker, ...statusUpdate });

    onSave();
  };

  // Helpers d'affichage
  const isPositive = formData.lab_result?.result === 'positive';
  const isNegative = formData.lab_result?.result === 'negative';

  return (
    <div className="modal-overlay">
      <div className="modal">
        {/* [FIX] Header with Title + Red X Button */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
          }}
        >
          <h3 style={{ margin: 0 }}>Examen Médical - {worker.full_name}</h3>
          <button
            onClick={onClose}
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
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Fermer"
          >
            ×
          </button>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          <strong>Service:</strong> {deptName || '-'} • <strong>Lieu:</strong>{' '}
          {workplaceName || '-'} • <strong>Poste:</strong> {worker.job_role || '-'}
        </p>

        {/* Info de base (Prescription) */}
        <div className="card" style={{ background: '#f9fafb' }}>
          <div className="form-group">
            <label className="label">Date de l'examen (Prescription)</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <input
                type="date"
                className="input"
                value={formData.exam_date}
                onChange={(e) => updateField('exam_date', e.target.value)}
              />
              {new Date(formData.exam_date) < new Date(new Date().setHours(0, 0, 0, 0)) && (
                <span className="badge badge-yellow">⚠️ Mode Historique</span>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="label">Médecin</label>
            <input
              className="input"
              value={formData.physician_name}
              onChange={(e) => updateField('physician_name', e.target.value)}
            />
          </div>
          <div className="form-group">
            <label className="label">Examen clinique / Notes</label>
            <textarea
              className="input"
              rows="2"
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
            />
          </div>
        </div>

        {/* Section Labo */}
        <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
          <h4>Laboratoire (Copro-parasitologie)</h4>
          {!formData.lab_result ? (
            <div style={{ display: 'flex', gap: '1rem' }}>
              <button className="btn btn-success" onClick={() => handleLabResult('negative')}>
                Résultat Négatif (-)
              </button>
              <button className="btn btn-danger" onClick={() => handleLabResult('positive')}>
                Résultat Positif (+)
              </button>
            </div>
          ) : (
            <div>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}
              >
                <span
                  className={`badge ${
                    formData.lab_result.result === 'positive' ? 'badge-red' : 'badge-green'
                  }`}
                >
                  Résultat: {formData.lab_result.result.toUpperCase()}
                </span>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => updateField('lab_result', null)}
                >
                  Modifier
                </button>
              </div>
              {isPositive && (
                <div className="form-group">
                  <label className="label">Type de Parasite</label>
                  <input
                    className="input"
                    value={formData.lab_result.parasite}
                    onChange={(e) =>
                      updateField('lab_result', {
                        ...formData.lab_result,
                        parasite: e.target.value,
                      })
                    }
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Traitement (Si Positif) */}
        {isPositive && (
          <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
            <h4>Traitement & Suivi</h4>
            <div className="form-group">
              <label className="label">Médicament & Dose</label>
              <input
                className="input"
                placeholder="Ex: Flagyl 500mg"
                value={formData.treatment?.drug || ''}
                onChange={(e) =>
                  updateField('treatment', { ...(formData.treatment || {}), drug: e.target.value })
                }
              />
            </div>
            <div className="form-group">
              <label className="label">Date Début Traitement</label>
              <input
                type="date"
                className="input"
                value={formData.treatment?.start_date || format(new Date(), 'yyyy-MM-dd')}
                onChange={(e) =>
                  updateField('treatment', {
                    ...(formData.treatment || {}),
                    start_date: e.target.value,
                  })
                }
              />
            </div>
            <div className="form-group">
              <label className="label">Contre-visite prévue le:</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => {
                    const start =
                      formData.treatment?.start_date || format(new Date(), 'yyyy-MM-dd');
                    const date = logic.calculateRetestDate(start, 7);
                    updateField('treatment', {
                      ...(formData.treatment || {}),
                      start_date: start,
                      retest_date: date,
                    });
                  }}
                >
                  +7 Jours
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => {
                    const start =
                      formData.treatment?.start_date || format(new Date(), 'yyyy-MM-dd');
                    const date = logic.calculateRetestDate(start, 10);
                    updateField('treatment', {
                      ...(formData.treatment || {}),
                      start_date: start,
                      retest_date: date,
                    });
                  }}
                >
                  +10 Jours
                </button>
                <input
                  type="date"
                  className="input"
                  style={{ width: 'auto' }}
                  value={formData.treatment?.retest_date || ''}
                  onChange={(e) =>
                    updateField('treatment', {
                      ...(formData.treatment || {}),
                      retest_date: e.target.value,
                    })
                  }
                />
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
              <button className="btn btn-danger" onClick={() => handleDecision('inapte')}>
                Marquer Inapte Temporaire
              </button>
              <button className="btn btn-warning" onClick={() => handleDecision('apte_partielle')}>
                Apte Partiel (Sous réserve)
              </button>
            </div>
          </div>
        )}

        {/* Décision Finale (Si Négatif) - AVEC CHAMP DATE */}
        {isNegative && (
          <div className="card" style={{ borderLeft: '4px solid #22c55e' }}>
            <h4>Décision Finale (Retour Labo)</h4>
            <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
              Le résultat est négatif. Le travailleur peut être déclaré apte.
            </p>

            {/* Champ date de validation ajouté */}
            <div className="form-group">
              <label className="label">Date de validation (Consultation de retour)</label>
              <input
                type="date"
                className="input"
                value={validationDate}
                onChange={(e) => setValidationDate(e.target.value)}
              />
              <small style={{ display: 'block', marginTop: '5px', color: '#666' }}>
                Cette date servira de point de départ pour les 6 mois. (Prochain examen le :{' '}
                {logic.formatDateDisplay(logic.calculateNextExamDue(validationDate))})
              </small>
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button className="btn btn-success" onClick={() => handleDecision('apte')}>
                Valider APTE & Sauvegarder
              </button>
            </div>
          </div>
        )}

        {/* Boutons de fermeture */}
        <div
          style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '1rem' }}
        >
          <button className="btn btn-outline" onClick={onClose}>
            Fermer
          </button>
          <button className="btn btn-primary" onClick={saveWithoutDecision}>
            Sauvegarder (Sans clôturer)
          </button>
        </div>
      </div>
    </div>
  );
}
