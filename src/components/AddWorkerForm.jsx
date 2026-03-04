import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import { useToast } from './Toast';
import { FaGlobe } from 'react-icons/fa';

export default function WorkerForm({ workerToEdit, onClose, onSave, appLanguage = 'fr' }) {
  const { showToast, ToastContainer } = useToast();
  const [departments, setDepartments] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);

  // [NEW] Local language toggle for quick checking
  const [localLang, setLocalLang] = useState(appLanguage);
  const isArMode = localLang === 'ar';

  const [formData, setFormData] = useState({
    full_name: '',
    full_name_ar: '',
    national_id: '',
    phone: '',
    department_id: '',
    workplace_id: '',
    job_role: '',
    job_role_ar: '',
    start_date: new Date().toISOString().split('T')[0],
    notes: '',
    next_exam_due: '',
    archived: false,
  });

  useEffect(() => {
    setLocalLang(appLanguage);
  }, [appLanguage]);

  useEffect(() => {
    const loadRefData = async () => {
      try {
        const depts = await db.getDepartments();
        const works = await db.getWorkplaces();
        setDepartments(depts);
        setWorkplaces(works);

        if (!workerToEdit) {
          const lastDept = localStorage.getItem('last_worker_dept');
          const validDept =
            lastDept && depts.find((d) => d.id === Number(lastDept))
              ? Number(lastDept)
              : depts.length > 0
              ? depts[0].id
              : '';

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
      setFormData(workerToEdit);
    }
  }, [workerToEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // [SMART DETECT] If typing in Arabic name field while in AR mode, or vice versa
    if (name === 'full_name') {
      const isArabic = /[\u0600-\u06FF]/.test(value);
      if (isArabic) {
        setFormData(prev => ({ ...prev, full_name_ar: value }));
        return;
      }
    }
    
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.workplace_id) {
      showToast('Veuillez sélectionner un lieu de travail.', 'error');
      return;
    }
    
    try {
      const allWorkers = await db.getWorkers();
      const normalize = (str) => (str ? str.toString().trim().toLowerCase() : '');
      const currentName = normalize(formData.full_name);
      const currentMatricule = normalize(formData.national_id);
      
      const duplicate = allWorkers.find((w) => {
        if (workerToEdit && w.id === workerToEdit.id) return false;
        const nameMatch = normalize(w.full_name) === currentName;
        const matriculeMatch = currentMatricule && normalize(w.national_id) === currentMatricule;
        return nameMatch || matriculeMatch;
      });
      if (duplicate) {
        showToast(`Doublon détecté : ${duplicate.full_name}`, 'error');
        return;
      }
    } catch (error) {}

    if (formData.department_id) localStorage.setItem('last_worker_dept', formData.department_id);
    if (formData.workplace_id) localStorage.setItem('last_worker_place', formData.workplace_id);

    let nextDue = formData.next_exam_due;
    if (!nextDue) {
      nextDue = new Date().toISOString().split('T')[0];
    }

    await db.saveWorker({
      ...formData,
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
          <button onClick={onClose} className="btn-icon" style={{ color: 'var(--danger)' }}>×</button>
        </div>

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
            <strong>📦 Attention :</strong> Ce travailleur est actuellement <strong>archivé</strong>.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* NOM COMPLET (SMART TOGGLE) */}
          <div className="form-group">
            <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{isArMode ? 'الاسم الكامل' : 'Nom Complet'}</span>
              <button 
                type="button"
                onClick={() => setLocalLang(p => p === 'fr' ? 'ar' : 'fr')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: 0.7
                }}
                title="Vérifier l'autre langue"
              >
                <FaGlobe size={14} />
              </button>
            </label>
            <input
              className="input"
              name={isArMode ? 'full_name_ar' : 'full_name'}
              value={(isArMode ? formData.full_name_ar : formData.full_name) || ''}
              onChange={handleChange}
              placeholder={isArMode ? 'أدخل الاسم بالعربية' : 'Saisir le nom en français'}
              dir={isArMode ? 'rtl' : 'ltr'}
              style={{ 
                fontFamily: isArMode ? 'Amiri, serif' : 'inherit',
                fontSize: isArMode ? '1.2rem' : '1rem',
                fontWeight: 'bold'
              }}
              required={!isArMode}
            />
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Matricule</label>
              <input
                className="input"
                name="national_id"
                value={formData.national_id || ''}
                onChange={handleChange}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Téléphone</label>
              <input
                className="input"
                name="phone"
                value={formData.phone || ''}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Service RH</label>
              <select
                className="input"
                name="department_id"
                value={formData.department_id || ''}
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
              <label className="label">Lieu de Travail</label>
              <select
                className="input"
                name="workplace_id"
                value={formData.workplace_id || ''}
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

          {/* POSTE / FONCTION (SMART TOGGLE) */}
          <div className="form-group">
            <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>{isArMode ? 'الوظيفة' : 'Poste / Fonction'}</span>
              <button 
                type="button"
                onClick={() => setLocalLang(p => p === 'fr' ? 'ar' : 'fr')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: 0.7
                }}
              >
                <FaGlobe size={14} />
              </button>
            </label>
            <input
              className="input"
              name={isArMode ? 'job_role_ar' : 'job_role'}
              value={(isArMode ? formData.job_role_ar : formData.job_role) || ''}
              onChange={handleChange}
              placeholder={isArMode ? 'أدخل الوظيفة' : 'Saisir le poste'}
              dir={isArMode ? 'rtl' : 'ltr'}
              style={{ 
                fontFamily: isArMode ? 'Amiri, serif' : 'inherit',
                fontSize: isArMode ? '1.1rem' : '1rem'
              }}
            />
          </div>

          <div className="form-group">
            <label className="label">Notes / Antécédents</label>
            <textarea
              className="input"
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
              rows={2}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </div>
        </form>
        <ToastContainer />
      </div>
    </div>
  );
}
