import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { useToast } from '../Toast';

export default function AddWeaponHolderForm({ holderToEdit, onClose, onSave }) {
  const { showToast, ToastContainer } = useToast();
  const [departments, setDepartments] = useState([]);
  
  const [formData, setFormData] = useState({
    full_name: '',
    national_id: '',
    phone: '',
    medical_history: '',
    department_id: '',
    job_function: '',
    status: 'pending',
    archived: false,
    next_review_date: '',
  });

  useEffect(() => {
    const loadDepts = async () => {
      const depts = await db.getWeaponDepartments();
      setDepartments(depts);
    };
    loadDepts();

    if (holderToEdit) {
      setFormData(holderToEdit);
    }
  }, [holderToEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Duplicate check
    try {
      const allHolders = await db.getWeaponHolders();
      const normalize = (str) => (str ? str.toString().trim().toLowerCase() : '');
      const currentName = normalize(formData.full_name);
      const currentId = normalize(formData.national_id);
      
      const duplicate = allHolders.find(h => {
        if (holderToEdit && h.id === holderToEdit.id) return false;
        return normalize(h.full_name) === currentName || (currentId && normalize(h.national_id) === currentId);
      });
      
      if (duplicate) {
        showToast(`Doublon détecté : ${duplicate.full_name}`, 'error');
        return;
      }
    } catch (err) {
      console.error(err);
    }

    await db.saveWeaponHolder({
      ...formData,
      department_id: formData.department_id ? Number(formData.department_id) : '',
      id: holderToEdit ? holderToEdit.id : undefined,
    });

    onSave();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)' }}>
            {holderToEdit ? 'Modifier l\'Agent' : 'Ajouter un Agent'}
          </h3>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="label">Nom complet</label>
            <input className="input" name="full_name" value={formData.full_name} onChange={handleChange} required />
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Matricule / CIN</label>
              <input className="input" name="national_id" value={formData.national_id} onChange={handleChange} required />
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Téléphone</label>
              <input className="input" name="phone" value={formData.phone} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Antécédents Médicaux</label>
            <textarea className="input" name="medical_history" value={formData.medical_history} onChange={handleChange} rows="3" />
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Service RH
                <button type="button" onClick={() => window.alert("Veuillez vous rendre dans Paramètres > Organisation pour gérer les services.")} style={{ border: 'none', background: 'none', color: 'var(--primary)', fontSize: '0.75rem', cursor: 'pointer', textDecoration: 'underline' }}>
                  Gérer
                </button>
              </label>
              <select className="input" name="department_id" value={formData.department_id} onChange={handleChange} required>
                <option value="">Sélectionner...</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Poste / Grade</label>
              <input className="input" name="job_function" value={formData.job_function} onChange={handleChange} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '2rem' }}>
            <button type="button" className="btn btn-outline" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary">Enregistrer</button>
          </div>
        </form>
        <ToastContainer />
      </div>
    </div>
  );
}