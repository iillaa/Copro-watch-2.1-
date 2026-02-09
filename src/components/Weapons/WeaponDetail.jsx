import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import WeaponExamForm from './WeaponExamForm';
import { useToast } from '../Toast';
import { pdfService } from '../../services/pdfGenerator';
import {
  FaArrowLeft,
  FaFileMedical,
  FaTrash,
  FaArchive,
  FaBoxOpen,
  FaEye,
  FaUserShield,
  FaPrint,
  FaHistory,
  FaFileAlt,
} from 'react-icons/fa';

export default function WeaponDetail({ holderId, onBack, compactMode }) {
  const [holder, setHolder] = useState(null);
  const [exams, setExams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [holderNotFound, setHolderNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState('history'); // 'history' or 'docs'
  const { showToast, ToastContainer } = useToast();

  const loadData = async () => {
    try {
      const id = Number(holderId);
      const [h, d] = await Promise.all([
        db.getWeaponHolder(id),
        db.getWeaponDepartments(),
      ]);
      
      if (!h) {
        setHolderNotFound(true);
        return;
      }
      setHolder(h);
      setDepartments(d);
      
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
    showToast(`Agent ${newStatus ? 'archivé' : 'réactivé'}`, 'success');
    loadData();
  };

  const handleDelete = async () => {
    if (window.confirm('Supprimer définitivement cet agent et son historique ?')) {
      await db.deleteWeaponHolder(holder.id);
      onBack();
    }
  };

  const handlePrintCert = (exam) => {
    const deptName = departments.find(d => d.id === holder.department_id)?.name || '-';
    pdfService.generateBatchDoc([{ ...holder, deptName }], 'weapon_aptitude', { date: exam.exam_date });
  };

  if (holderNotFound) return <div style={{ textAlign: 'center', padding: '3rem' }}><h2>Agent non trouvé</h2><button className="btn btn-primary" onClick={onBack}>Retour</button></div>;
  if (!holder) return <div>Chargement...</div>;

  const isDue = logic.isWeaponDueSoon(holder.next_review_date);
  const deptName = departments.find(d => d.id === holder.department_id)?.name || '-';

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}><button className="btn btn-outline" onClick={onBack}><FaArrowLeft /> Retour</button></div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2 style={{ margin: 0 }}>{holder.full_name} {holder.archived && <span className="badge">ARCHIVÉ</span>}</h2>
            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0' }}><strong>Matricule:</strong> {holder.national_id} • <strong>Né le:</strong> {logic.formatDateDisplay(holder.birth_date)}</p>
            <p style={{ color: 'var(--text-muted)', margin: '0.5rem 0' }}><strong>Service:</strong> {deptName} • <strong>Poste:</strong> {holder.job_function}</p>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className={`badge ${holder.status === 'apte' ? 'badge-green' : holder.status === 'inapte_definitif' ? 'badge-black' : 'badge-red'}`} style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
                {holder.status?.toUpperCase() || 'INCONNU'}
              </span>
              {holder.next_review_date && (
                 <span className={`badge ${isDue ? 'badge-red' : 'badge-yellow'}`} style={{ fontSize: '1rem', padding: '0.5rem 1rem' }}>
                   Prochaine Révision : {logic.formatDateDisplay(holder.next_review_date)}
                 </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" style={{ padding: '1rem' }} onClick={() => setShowExamForm(true)} disabled={holder.archived} title="Nouvelle Visite">
              <FaFileMedical size={20} /> <span className="hide-mobile" style={{ marginLeft: '0.5rem' }}>Visite</span>
            </button>
            <button className="btn btn-outline" style={{ padding: '1rem', color: holder.archived ? 'var(--success)' : 'var(--danger)', borderColor: holder.archived ? 'var(--success)' : 'var(--danger)' }} onClick={handleToggleArchive} title={holder.archived ? 'Réactiver' : 'Archiver'}>
              {holder.archived ? <FaBoxOpen size={20} /> : <FaArchive size={20} />}
            </button>
            <button className="btn btn-outline" style={{ padding: '1rem', color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={handleDelete} title="Supprimer">
              <FaTrash size={20} />
            </button>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem', borderBottom: '2px solid var(--border-color)' }}>
        <button 
          className={`btn ${activeTab === 'history' ? 'btn-primary' : 'btn-outline'}`} 
          onClick={() => setActiveTab('history')}
          style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab === 'history' ? 'none' : '' }}
        >
          <FaHistory /> Historique
        </button>
        <button 
          className={`btn ${activeTab === 'docs' ? 'btn-primary' : 'btn-outline'}`} 
          onClick={() => setActiveTab('docs')}
          style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, borderBottom: activeTab === 'docs' ? 'none' : '' }}
        >
          <FaFileAlt /> Documents
        </button>
      </div>

      <div className="card" style={{ borderTopLeftRadius: 0, borderTop: 'none' }}>
        {activeTab === 'history' ? (
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
        ) : (
          <div>
            <h4 style={{ marginBottom: '1rem' }}>Certificats d'Aptitude</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {exams.map(e => (
                <div key={e.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#f8fafc' }}>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>Visite du {logic.formatDateDisplay(e.exam_date)}</div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Verdict: {e.final_decision?.toUpperCase()}</div>
                  </div>
                  <button className="btn btn-sm btn-outline" onClick={() => handlePrintCert(e)} title="Télécharger PDF">
                    <FaPrint />
                  </button>
                </div>
              ))}
              {exams.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Aucun document disponible.</p>}
            </div>
          </div>
        )}
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