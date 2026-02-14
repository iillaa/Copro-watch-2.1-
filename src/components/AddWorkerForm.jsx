import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import { useToast } from './Toast';

export default function WorkerForm({ workerToEdit, onClose, onSave }) {
  const { showToast, ToastContainer } = useToast();
  const [departments, setDepartments] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);

  const [formData, setFormData] = useState({
    full_name: '',
    national_id: '',
    phone: '',
    department_id: '',
    workplace_id: '',
    job_role: '',
    start_date: new Date().toISOString().split('T')[0],
    notes: '',
    next_exam_due: '',
    archived: false, // On initialise à false par défaut
  });

  useEffect(() => {
    const loadRefData = async () => {
      try {
        const depts = await db.getDepartments();
        const works = await db.getWorkplaces();
        setDepartments(depts);
        setWorkplaces(works);

        // [FIX] Sticky Defaults: Load last used values from LocalStorage
        if (!workerToEdit) {
          // 1. Service
          const lastDept = localStorage.getItem('last_worker_dept');
          const validDept =
            lastDept && depts.find((d) => d.id === Number(lastDept))
              ? Number(lastDept)
              : depts.length > 0
              ? depts[0].id
              : '';

          // 2. Lieu de Travail
          const lastPlace = localStorage.getItem('last_worker_place');
          const validPlace =
            lastPlace && works.find((p) => p.id === Number(lastPlace))
              ? Number(lastPlace)
              : works.length > 0
              ? works[0].id
              : '';

          setFormData((prev) => ({
            ...prev,
            department_id: validDept,
            workplace_id: validPlace,
          }));
        }
      } catch (error) {
        console.error('Failed to load options', error);
      }
    };
    loadRefData();

    if (workerToEdit) {
      // On charge les données existantes (y compris le statut 'archived')
      setFormData(workerToEdit);
    }
  }, [workerToEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.workplace_id) {
      showToast('Veuillez sélectionner un lieu de travail.', 'error');
      return;
    }
    // --- LOGIQUE ANTI-DOUBLON ---
    try {
      const allWorkers = await db.getWorkers();
      // On normalise pour comparer proprement (minuscule, sans espaces inutiles)
      const normalize = (str) => (str ? str.toString().trim().toLowerCase() : '');
      const currentName = normalize(formData.full_name);
      const currentMatricule = normalize(formData.national_id);
      const currentPhone = normalize(formData.phone);
      const duplicate = allWorkers.find((w) => {
        // Ignorer le travailleur qu'on modifie actuellement
        if (workerToEdit && w.id === workerToEdit.id) return false;
        // Vérifier les doublons
        const nameMatch = normalize(w.full_name) === currentName;
        // On ne vérifie matricule/téléphone que s'ils ne sont pas vides
        const matriculeMatch = currentMatricule && normalize(w.national_id) === currentMatricule;
        const phoneMatch = currentPhone && normalize(w.phone) === currentPhone;
        return nameMatch || matriculeMatch || phoneMatch;
      });
      if (duplicate) {
        showToast(`Doublon détecté : ${duplicate.full_name}`, 'error');
        return; // Arrêter l'enregistrement
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des doublons', error);
    }
    // --- FIN LOGIQUE ---

    // Date par défaut si nouvelle saisie
    let nextDue = formData.next_exam_due;
    if (!nextDue) {
      nextDue = new Date().toISOString().split('T')[0];
    }

    // [FIX] Save sticky values for next time
    if (formData.department_id) localStorage.setItem('last_worker_dept', formData.department_id);
    if (formData.workplace_id) localStorage.setItem('last_worker_place', formData.workplace_id);

    await db.saveWorker({
      ...formData, // Cela préserve le champ 'archived' si on modifie un ancien dossier
      id: workerToEdit ? workerToEdit.id : undefined,
      department_id: parseInt(formData.department_id),
      workplace_id: parseInt(formData.workplace_id),
      next_exam_due: nextDue,
    });

    onSave();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        style={{
          animation: 'modalSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: 'scale(0.9)',
          animationFillMode: 'forwards',
        }}
      >
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
            {workerToEdit ? 'Modifier' : 'Ajouter'} un travailleur
          </h3>
          <button
            onClick={onClose}
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
            }}
          >
            ×
          </button>
        </div>

        {/* AJOUT : Alerte si le dossier est archivé */}
        {formData.archived && (
          <div
            style={{
              background: '#eee',
              color: '#555',
              padding: '0.75rem',
              borderRadius: '6px',
              marginBottom: '1rem',
              fontSize: '0.9rem',
              border: '1px solid #ccc',
            }}
          >
            <strong>📦 Attention :</strong> Ce travailleur est actuellement <strong>archivé</strong>
            .
            <br />
            Ses données ne sont pas visibles dans le tableau de bord principal.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">Nom complet</label>
            <input
              className="input"
              name="full_name"
              value={formData.full_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="label">N° Matricule / CIN</label>
              <input
                className="input"
                name="national_id"
                value={formData.national_id}
                onChange={handleChange}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Téléphone</label>
              <input
                className="input"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Service</label>
              <select
                className="input"
                name="department_id"
                value={formData.department_id}
                onChange={handleChange}
                required
              >
                <option value="">Sélectionner...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Lieu de travail</label>
              <select
                className="input"
                name="workplace_id"
                value={formData.workplace_id}
                onChange={handleChange}
                required
              >
                <option value="">Sélectionner...</option>
                {workplaces.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Poste / Fonction</label>
            <input
              className="input"
              name="job_role"
              value={formData.job_role}
              onChange={handleChange}
            />
          </div>

          <div className="form-group">
            <label className="label">Antécédents médicaux</label>
            <textarea
              className="input"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}
          >
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              Enregistrer
            </button>
          </div>
        </form>
        <ToastContainer />
      </div>
    </div>
  );
}
