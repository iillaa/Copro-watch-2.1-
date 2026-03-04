import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { useToast } from '../Toast';
import { FaGlobe } from 'react-icons/fa';

export default function AddWeaponHolderForm({ holderToEdit, onClose, onSave, appLanguage = 'fr' }) {
  const { showToast, ToastContainer } = useToast();
  const [departments, setDepartments] = useState([]);

  // [NEW] Local language toggle for quick checking
  const [localLang, setLocalLang] = useState(appLanguage);
  const isArMode = localLang === 'ar';

  useEffect(() => {
    setLocalLang(appLanguage);
  }, [appLanguage]);

  const [formData, setFormData] = useState({
    full_name: '',
    full_name_ar: '',
    national_id: '',
    phone: '',
    medical_history: '',
    department_id: '',
    job_function: '',
    job_function_ar: '',
    status: 'pending',
    archived: false,
    next_review_date: '',
  });

  useEffect(() => {
    const loadDepts = async () => {
      const depts = await db.getWeaponDepartments();
      setDepartments(depts || []);

      if (!holderToEdit && depts.length > 0) {
        const lastDept = localStorage.getItem('last_weapon_dept');
        const targetId = lastDept ? Number(lastDept) : depts[0].id;
        const validId = depts.find((d) => d.id === targetId) ? targetId : depts[0].id;
        setFormData((prev) => ({ ...prev, department_id: validId }));
      }
    };
    loadDepts();

    if (holderToEdit) {
      setFormData(holderToEdit);
    } else {
      const lastJob = localStorage.getItem('last_weapon_job');
      if (lastJob) {
        setFormData((prev) => ({ ...prev, job_function: lastJob }));
      }
    }
  }, [holderToEdit]);

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

    try {
      const allHolders = await db.getWeaponHolders();
      const normalize = (str) => (str ? str.toString().trim().toLowerCase() : '');
      const currentName = normalize(formData.full_name);
      const currentId = normalize(formData.national_id);

      const duplicate = allHolders.find((h) => {
        if (holderToEdit && h.id === holderToEdit.id) return false;
        return (
          normalize(h.full_name) === currentName ||
          (currentId && normalize(h.national_id) === currentId)
        );
      });

      if (duplicate) {
        showToast(`Doublon détecté : ${duplicate.full_name}`, 'error');
        return;
      }
    } catch (err) {}

    const finalData = {
      ...formData,
      department_id: formData.department_id ? Number(formData.department_id) : '',
    };

    localStorage.setItem('last_weapon_dept', finalData.department_id);
    localStorage.setItem('last_weapon_job', finalData.job_function);

    await db.saveWeaponHolder({
      ...finalData,
      id: holderToEdit ? holderToEdit.id : undefined,
    });

    onSave();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '500px' }}>
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
            {holderToEdit ? "Modifier l'Agent" : 'Ajouter un Agent'}
          </h3>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

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
                required
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

          <div className="form-group">
            <label className="label">Antécédents Médicaux</label>
            <textarea
              className="input"
              name="medical_history"
              value={formData.medical_history || ''}
              onChange={handleChange}
              rows="2"
            />
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
              <label className="label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>{isArMode ? 'الوظيفة' : 'Poste / Grade'}</span>
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
                name={isArMode ? 'job_function_ar' : 'job_function'}
                value={(isArMode ? formData.job_function_ar : formData.job_function) || ''}
                onChange={handleChange}
                placeholder={isArMode ? 'أدخل الوظيفة' : 'Saisir le poste'}
                dir={isArMode ? 'rtl' : 'ltr'}
                style={{ 
                  fontFamily: isArMode ? 'Amiri, serif' : 'inherit',
                  fontSize: isArMode ? '1.1rem' : '1rem'
                }}
              />
            </div>
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
