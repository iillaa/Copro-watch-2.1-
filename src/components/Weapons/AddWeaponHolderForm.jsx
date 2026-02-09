import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { useToast } from '../Toast';
import { FaCamera } from 'react-icons/fa';

export default function AddWeaponHolderForm({ holderToEdit, onClose, onSave }) {
  const { showToast, ToastContainer } = useToast();
  const [formData, setFormData] = useState({
    full_name: '',
    national_id: '',
    birth_date: '',
    permit_type: "Port d'Arme",
    job_function: 'Agent de Sécurité',
    photo: null,
    status: 'apte',
    archived: false,
    next_review_date: '',
  });

  useEffect(() => {
    if (holderToEdit) {
      setFormData(holderToEdit);
    }
  }, [holderToEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, photo: reader.result }));
      };
      reader.readAsDataURL(file);
    }
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
      id: holderToEdit ? holderToEdit.id : undefined,
    });

    onSave();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '500px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', paddingBottom: '1rem', borderBottom: '2px solid var(--border-color)' }}>
          <h3 style={{ margin: 0, color: 'var(--primary)' }}>
            {holderToEdit ? 'Modifier' : 'Ajouter'} un Détenteur
          </h3>
          <button onClick={onClose} className="btn-close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
             <div style={{ position: 'relative', width: '100px', height: '100px', margin: '0 auto', background: '#f1f5f9', borderRadius: '50%', overflow: 'hidden', border: '2px solid var(--primary-light)' }}>
                {formData.photo ? <img src={formData.photo} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <FaCamera size={30} color="#cbd5e1" style={{ marginTop: '35px' }} />}
                <input type="file" accept="image/*" onChange={handlePhotoChange} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
             </div>
             <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Photo d'identité</p>
          </div>

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
              <label className="label">Date de Naissance</label>
              <input className="input" type="date" name="birth_date" value={formData.birth_date} onChange={handleChange} />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <label className="label">Type de Permis</label>
              <select className="input" name="permit_type" value={formData.permit_type} onChange={handleChange}>
                <option value="Port d'Arme">Port d'Arme</option>
                <option value="Détention">Détention</option>
                <option value="Chasse">Chasse</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label className="label">Fonction</label>
              <select className="input" name="job_function" value={formData.job_function} onChange={handleChange}>
                <option value="Agent de Sécurité">Agent de Sécurité</option>
                <option value="Convoyeur">Convoyeur</option>
                <option value="Particulier">Particulier</option>
              </select>
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
