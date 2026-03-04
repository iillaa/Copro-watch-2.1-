import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import { FaPrint } from 'react-icons/fa';
import { pdfService } from '../services/pdfGenerator';
import BatchPrintModal from './BatchPrintModal';
import ExamForm from './ExamForm';
import { useToast } from './Toast';
import {
  FaArrowLeft,
  FaFileMedical,
  FaTrash,
  FaArchive,
  FaBoxOpen,
  FaCheckSquare,
  FaEye,
  FaGlobe,
} from 'react-icons/fa';
import BulkActionsToolbar from './BulkActionsToolbar';

export default function WorkerDetail({ workerId, onBack, compactMode, appLanguage }) {
  const [worker, setWorker] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exams, setExams] = useState([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [workerNotFound, setWorkerNotFound] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [workplaceName, setWorkplaceName] = useState('');

  // [NEW] Local language toggle
  const [localLang, setLocalLang] = useState(appLanguage);
  useEffect(() => setLocalLang(appLanguage), [appLanguage]);

  const { showToast, ToastContainer } = useToast();

  const [isSelectionMode, setIsSelectionMode] = useState(
    () => localStorage.getItem('copro_selection_mode_medical') === 'true'
  );

  const gridTemplate = isSelectionMode
    ? '50px 0.9fr 1.2fr 1.1fr 1fr 100px'
    : '0px 0.9fr 1.2fr 1.1fr 1fr 100px';

  const loadData = async () => {
    try {
      const id = Number(workerId);
      const w = await db.getWorker(id);

      if (!w) {
        setWorkerNotFound(true);
        return;
      }

      setWorkerNotFound(false);
      setWorker(w);

      if (w) {
        const depts = await db.getDepartments();
        const works = await db.getWorkplaces();
        const d = depts.find((x) => x.id == w.department_id);
        const wp = works.find((x) => x.id == w.workplace_id);
        setDeptName(d ? d.name : '-');
        setWorkplaceName(wp ? wp.name : '-');
      }

      const wExams = await db.getExamsByWorker(id);
      wExams.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
      setExams(wExams);
    } catch (e) {
      console.error(e);
      setWorkerNotFound(true);
    }
  };

  useEffect(() => {
    loadData();
  }, [workerId]);

  const toggleSelectionMode = () => {
    const newState = !isSelectionMode;
    setIsSelectionMode(newState);
    localStorage.setItem('copro_selection_mode_medical', newState);
    if (!newState) setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === exams.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(exams.map((e) => e.id)));
    }
  };

  const toggleSelectOne = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBatchDelete = async () => {
    if (window.confirm(`Supprimer définitivement ${selectedIds.size} examens ?`)) {
      try {
        const idsToDelete = Array.from(selectedIds);
        await Promise.all(idsToDelete.map((id) => db.deleteExam(id)));
        setSelectedIds(new Set());
        loadData();
        showToast('Historique nettoyé', 'success');
      } catch (e) {
        console.error(e);
        showToast('Erreur de suppression', 'error');
      }
    }
  };

  const handleNewExam = () => {
    setSelectedExam(null);
    setShowExamForm(true);
  };

  const handleOpenExam = (exam) => {
    setSelectedExam(exam);
    setShowExamForm(true);
  };

  const handleDeleteExam = async (examId) => {
    if (!window.confirm('Supprimer cet examen ?')) return;
    await db.deleteExam(examId);
    loadData();
  };

  const handlePrintConfirm = (docType, dateSelected, extraOptions = {}) => {
    pdfService.generateBatchDoc([{ ...worker, deptName, workplaceName }], docType, {
      date: dateSelected,
      language: localLang,
      ...extraOptions,
    });
    setShowPrintModal(false);
  };

  const handleToggleArchive = async () => {
    const newStatus = !worker.archived;
    await db.saveWorker({ ...worker, archived: newStatus });
    showToast(`Dossier ${newStatus ? 'archivé' : 'réactivé'}`, 'success');
    loadData();
  };

  const handleDeleteWorker = async () => {
    if (window.confirm(`Supprimer définitivement ${worker.full_name} ?`)) {
      await db.deleteWorker(worker.id);
      onBack();
    }
  };

  const renderStatusBadge = (status) => {
    if (!status) return '-';
    const configs = {
      apte: { class: 'badge-green', label: 'Apte' },
      inapte: { class: 'badge-red', label: 'Inapte Temp.' },
      apte_partielle: { class: 'badge-yellow', label: 'Apte Partiel' },
    };
    const conf = configs[status] || { class: '', label: status };
    return <span className={`badge ${conf.class}`}>{conf.label}</span>;
  };

  if (workerNotFound) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Travailleur non trouvé</h2>
        <button className="btn btn-primary" onClick={onBack}>Retour</button>
      </div>
    );
  }

  if (!worker) return <div>Chargement...</div>;
  const isOverdue = logic.isOverdue(worker.next_exam_due);

  return (
    <div>
      <div style={{ marginBottom: '1rem' }}>
        <button className="btn btn-outline" onClick={onBack}>
          <FaArrowLeft /> Retour
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0 }}>
                <span style={{
                  fontFamily: localLang === 'ar' ? 'Amiri, serif' : 'inherit',
                  fontSize: localLang === 'ar' ? '2.2rem' : '1.5rem',
                  direction: localLang === 'ar' ? 'rtl' : 'ltr',
                  display: 'inline-block'
                }}>
                  {localLang === 'ar' && worker.full_name_ar ? worker.full_name_ar : worker.full_name}
                </span>
              </h2>
              <button 
                onClick={() => setLocalLang(p => p === 'fr' ? 'ar' : 'fr')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: 0.6
                }}
                title="Switcher la langue de ce dossier"
              >
                <FaGlobe size={16} />
              </button>
              {worker.archived && <span className="badge">ARCHIVÉ</span>}
            </div>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              <strong>Service:</strong> {deptName} • <strong>Lieu:</strong> {workplaceName} •{' '}
              <strong>Poste:</strong> <span style={{
                fontFamily: localLang === 'ar' ? 'Amiri, serif' : 'inherit',
                fontSize: localLang === 'ar' ? '1.1rem' : 'inherit',
                direction: localLang === 'ar' ? 'rtl' : 'ltr',
                display: 'inline-block'
              }}>
                {localLang === 'ar' && worker.job_role_ar ? worker.job_role_ar : worker.job_role}
              </span>
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Matricule: {worker.national_id}
            </p>
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span className={`badge ${isOverdue && !worker.archived ? 'badge-red' : 'badge-yellow'}`}>
                Prochain Examen: {logic.formatDateDisplay(worker.next_exam_due)}
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
            <button className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-outline'}`} onClick={toggleSelectionMode}>
              <FaCheckSquare />
            </button>
            <button className="btn btn-primary" onClick={handleNewExam} disabled={worker.archived}>
              <FaFileMedical /> <span className="hide-mobile">Nouvel Examen</span>
            </button>
            <button className="btn btn-outline" onClick={handleToggleArchive}>
              {worker.archived ? <FaBoxOpen /> : <FaArchive />}
            </button>
            <button className="btn btn-outline" onClick={() => setShowPrintModal(true)}>
              <FaPrint /> <span className="hide-mobile">Docs</span>
            </button>
            <button className="btn btn-outline" onClick={handleDeleteWorker} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
              <FaTrash />
            </button>
          </div>
        </div>
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
          <strong>Antécédents médicaux:</strong> {worker.notes || 'Aucun antécédent.'}
        </div>
      </div>

      <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Historique Médical</h3>
      <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '400px' : 'none' }}>
        <div className="hybrid-container" style={{ minWidth: '700px' }}>
          <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate }}>
            <div style={{ textAlign: 'center' }}>
              {isSelectionMode && <input type="checkbox" onChange={toggleSelectAll} checked={exams.length > 0 && selectedIds.size === exams.length} />}
            </div>
            <div>Date</div>
            <div>Médecin</div>
            <div>Résultat Labo</div>
            <div>Statut Final</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>
          {exams.map((e) => (
            <div key={e.id} className={`hybrid-row ${selectedIds.has(e.id) ? 'selected' : ''}`} style={{ gridTemplateColumns: gridTemplate }}>
              <div style={{ textAlign: 'center' }}>
                {isSelectionMode && <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleSelectOne(e.id)} />}
              </div>
              <div className="hybrid-cell" style={{ fontWeight: 800 }}>{e.exam_date}</div>
              <div className="hybrid-cell">{e.physician_name || '-'}</div>
              <div className="hybrid-cell">
                {e.lab_result ? (
                  <span className={`badge ${e.lab_result.result === 'positive' ? 'badge-red' : 'badge-green'}`}>
                    {e.lab_result.result === 'positive' ? 'Positif' : 'Négatif'}
                  </span>
                ) : 'En attente'}
              </div>
              <div className="hybrid-cell">{renderStatusBadge(e.decision?.status)}</div>
              <div className="hybrid-actions" style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline btn-sm" onClick={() => handleOpenExam(e)}><FaEye /></button>
                <button className="btn btn-outline btn-sm" onClick={() => handleDeleteExam(e.id)} style={{ color: 'var(--danger)' }}><FaTrash /></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {selectedIds.size > 0 && <BulkActionsToolbar selectedCount={selectedIds.size} onDelete={handleBatchDelete} onCancel={() => setSelectedIds(new Set())} />}
      {showPrintModal && <BatchPrintModal count={1} onConfirm={handlePrintConfirm} onCancel={() => setShowPrintModal(false)} />}
      {showExamForm && <ExamForm worker={worker} existingExam={selectedExam} deptName={deptName} workplaceName={workplaceName} onClose={() => setShowExamForm(false)} onSave={() => { setShowExamForm(false); loadData(); }} />}
      <ToastContainer />
    </div>
  );
}
