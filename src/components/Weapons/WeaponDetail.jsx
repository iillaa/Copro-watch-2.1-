import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import WeaponExamForm from './WeaponExamForm';
import { useToast } from '../Toast';
import {
  FaArrowLeft,
  FaFileMedical,
  FaTrash,
  FaArchive,
  FaBoxOpen,
  FaEye,
  FaUserShield,
} from 'react-icons/fa';

export default function WeaponDetail({ holderId, onBack, compactMode }) {
  const [holder, setHolder] = useState(null);
  const [exams, setExams] = useState([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [holderNotFound, setHolderNotFound] = useState(false);
  const { showToast, ToastContainer } = useToast();

  const loadData = async () => {
    try {
      const id = Number(holderId);
      const h = await db.getWeaponHolder(id);
      if (!h) {
        setHolderNotFound(true);
        return;
      }
      setHolder(h);
      const hExams = await db.getWeaponExamsByHolder(id);
      hExams.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
      setExams(hExams);
    } catch (e) {
      console.error(e);
      setHolderNotFound(true);
    }
  };

  useEffect(() => {
    loadData();
  }, [holderId]);

  const handleToggleArchive = async () => {
    const newStatus = !holder.archived;
    await db.saveWeaponHolder({ ...holder, archived: newStatus });
    showToast(`Détenteur ${newStatus ? 'archivé' : 'réactivé'}`, 'success');
    loadData();
  };

  const handleDelete = async () => {
    if (window.confirm('Supprimer définitivement ce détenteur et son historique ?')) {
      await db.deleteWeaponHolder(holder.id);
      onBack();
    }
  };

  if (holderNotFound) return <div style={{ textAlign: 'center', padding: '3rem' }}><h2>Détenteur non trouvé</h2><button className="btn btn-primary" onClick={onBack}>Retour</button></div>;
  if (!holder) return <div>Chargement...</div>;

  const isDue = logic.isWeaponDueSoon(holder.next_review_date);

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}><button className="btn btn-outline" onClick={onBack}><FaArrowLeft /> Retour</button></div>

      <div className="card">
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'start' }}>
          <div style={{ width: '120px', height: '120px', borderRadius: '12px', overflow: 'hidden', border: '3px solid var(--primary-light)', background: '#f1f5f9' }}>
            {holder.photo ? <img src={holder.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaUserShield size={50} color="#cbd5e1" /></div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{holder.full_name} {holder.archived && <span className="badge">ARCHIVÉ</span>}</h2>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="btn btn-primary" onClick={() => setShowExamForm(true)} disabled={holder.archived}><FaFileMedical /> Nouvelle Visite</button>
                <button className="btn btn-outline" onClick={handleToggleArchive} style={{ color: holder.archived ? 'var(--success)' : 'var(--warning)', borderColor: holder.archived ? 'var(--success)' : 'var(--warning)' }}>{holder.archived ? <FaBoxOpen /> : <FaArchive />}</button>
                <button className="btn btn-outline" onClick={handleDelete} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}><FaTrash /></button>
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0' }}><strong>Matricule:</strong> {holder.national_id} • <strong>Né le:</strong> {logic.formatDateDisplay(holder.birth_date)}</p>
            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0' }}><strong>Type:</strong> {holder.permit_type} • <strong>Fonction:</strong> {holder.job_function}</p>
            <div style={{ marginTop: '0.5rem' }}>
              <span className={`badge ${holder.status === 'apte' ? 'badge-green' : holder.status === 'inapte_definitif' ? 'badge-black' : 'badge-red'}`}>
                STATUT : {holder.status?.toUpperCase() || 'INCONNU'}
              </span>
              {holder.next_review_date && (
                 <span className={`badge ${isDue ? 'badge-red' : 'badge-yellow'}`} style={{ marginLeft: '0.5rem' }}>
                   Prochaine Révision : {logic.formatDateDisplay(holder.next_review_date)}
                 </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Historique de la Commission</h3>
      <div className="scroll-wrapper">
        <div className="hybrid-container">
          <div className="hybrid-header" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr' }}>
            <div>Date</div>
            <div>Motif</div>
            <div>Avis Psych.</div>
            <div>Décision</div>
            <div>Révision</div>
          </div>
          {exams.map((e) => (
            <div key={e.id} className="hybrid-row" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr' }}>
              <div className="hybrid-cell" style={{ fontWeight: 700 }}>{logic.formatDateDisplay(e.exam_date)}</div>
              <div className="hybrid-cell">{e.visit_reason}</div>
              <div className="hybrid-cell"><span className={`badge ${e.psych_advice === 'favorable' ? 'badge-green' : 'badge-yellow'}`}>{e.psych_advice}</span></div>
              <div className="hybrid-cell"><span className={`badge ${e.final_decision === 'apte' ? 'badge-green' : 'badge-red'}`}>{e.final_decision}</span></div>
              <div className="hybrid-cell">{logic.formatDateDisplay(e.next_review_date)}</div>
            </div>
          ))}
          {exams.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>Aucun historique.</div>}
        </div>
      </div>

      {showExamForm && (
        <WeaponExamForm
          holder={holder}
          onClose={() => setShowExamForm(false)}
          onSave={() => { setShowExamForm(false); loadData(); }}
        />
      )}
      <ToastContainer />
    </div>
  );
}
