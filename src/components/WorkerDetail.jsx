import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import { FaPrint } from 'react-icons/fa';
import { pdfService } from '../services/pdfGenerator'; // [NEW]
import BatchPrintModal from './BatchPrintModal'; // [NEW]
import ExamForm from './ExamForm';
import { useToast } from './Toast'; // [NEW]
// AJOUT : Import des icônes d'archive et FaCheckSquare
import {
  FaArrowLeft,
  FaFileMedical,
  FaTrash,
  FaArchive,
  FaBoxOpen,
  FaCheckSquare, // [NEW] Icon
  FaEye,
} from 'react-icons/fa';
import BulkActionsToolbar from './BulkActionsToolbar'; // [NEW] Import Toolbar

// [NEW] SVG Visual Indicator for Copro Validity
const CoproValidityIndicator = ({ dueDate, size = 60 }) => {
  if (!dueDate) return null;

  const today = new Date();
  const due = new Date(dueDate);
  const diffTime = due - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  let status = 'valid'; // > 20 days
  // Total cycle is 6 months (approx 180 days)
  const totalCycle = 180;
  // Calculate percentage remaining (100% = full 6 months, 0% = due today)
  let p = Math.max(0, Math.min(100, (diffDays / totalCycle) * 100));

  if (diffDays < 0) {
    status = 'expired';
    p = 100; // Full circle but red
  } else if (diffDays < 20) {
    status = 'warning';
  }

  const colors = {
    valid: '#16a34a',
    warning: '#eab308',
    expired: '#dc2626',
  };

  const color = colors[status];

  // Circle geometry
  const r = 20;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        marginRight: '1rem',
      }}
      title={`Validité : ${diffDays} jours restants`}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 50 50"
        style={{ transform: 'rotate(-90deg)', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.1))' }}
      >
        {/* Background Track */}
        <circle cx="25" cy="25" r={r} stroke="#f1f5f9" strokeWidth="5" fill="white" />
        {/* Progress Arc */}
        <circle
          cx="25"
          cy="25"
          r={r}
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={status === 'expired' ? 0 : offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* Exclamation mark for expired */}
        {status === 'expired' && (
           <text x="25" y="30" textAnchor="middle" transform="rotate(90 25 25)" fill="white" fontSize="20" fontWeight="bold">!</text>
        )}
      </svg>
      {/* Center Text (Days) - Hidden if expired to show exclamation */}
      {status !== 'expired' && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: color, lineHeight: 1 }}>
            {diffDays}
          </span>
          <span style={{ fontSize: '0.5rem', color: '#64748b', fontWeight: 600 }}>Jours</span>
        </div>
      )}
    </div>
  );
};

export default function WorkerDetail({ workerId, onBack, compactMode }) {
  const [worker, setWorker] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exams, setExams] = useState([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [workerNotFound, setWorkerNotFound] = useState(false); // [NEW] Track not found state

  const [showPrintModal, setShowPrintModal] = useState(false); // [NEW] Pour le PDF Smart
  const [deptName, setDeptName] = useState('');
  const [workplaceName, setWorkplaceName] = useState('');

  // [NEW] Toast
  const { showToast, ToastContainer } = useToast();

  // [NEW] Persistent Selection Mode State
  const [isSelectionMode, setIsSelectionMode] = useState(
    () => localStorage.getItem('copro_selection_mode_medical') === 'true'
  );

  // [SMART GRID] Config for Medical History (Based on your columns)
  // Cols: Check(50) | Date(0.9) | Médecin(1.2) | Labo(1.1) | Statut(1) | Actions(100)
  const gridTemplate = isSelectionMode
    ? '50px 0.9fr 1.2fr 1.1fr 1fr 100px'
    : '0px 0.9fr 1.2fr 1.1fr 1fr 100px';

  const loadData = async () => {
    try {
      // [OPTIMIZATION] Use specific queries instead of loading everything
      // Convert workerId to Number to ensure match
      const id = Number(workerId);
      const w = await db.getWorker(id);

      if (!w) {
        console.warn('[WorkerDetail] Worker not found for ID:', id);
        setWorkerNotFound(true);
        return;
      }

      setWorkerNotFound(false);
      setWorker(w);

      if (w) {
        // We still load lists for mapping names, but these are usually smaller.
        // For maximum speed, you could stick to IDs or fetch single dept/workplace too.
        const depts = await db.getDepartments();
        const works = await db.getWorkplaces();
        const d = depts.find((x) => x.id == w.department_id);
        const wp = works.find((x) => x.id == w.workplace_id);
        setDeptName(d ? d.name : '-');
        setWorkplaceName(wp ? wp.name : '-');
      }

      // [OPTIMIZATION] Load only this worker's exams
      const wExams = await db.getExamsByWorker(id);
      // Sort desc
      wExams.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
      setExams(wExams);
      console.log('[WorkerDetail] Data loaded - Worker:', w?.full_name, 'Exams:', wExams.length);
    } catch (e) {
      console.error('[WorkerDetail] Error loading data:', e);
      setWorkerNotFound(true);
    }
  };

  useEffect(() => {
    loadData();
  }, [workerId]);

  // --- NEW: Batch Handlers ---

  // [NEW] Toggle Function
  const toggleSelectionMode = () => {
    const newState = !isSelectionMode;
    setIsSelectionMode(newState);
    localStorage.setItem('copro_selection_mode_medical', newState);
    // Clear selection if turning off
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

  // [CORRECTED FOR WORKER DETAIL]
  const handleBatchDelete = async () => {
    if (window.confirm(`Supprimer définitivement ${selectedIds.size} examens ?`)) {
      try {
        const idsToDelete = Array.from(selectedIds);

        // 1. Delete Exams
        await Promise.all(idsToDelete.map((id) => db.deleteExam(id)));

        // 2. SYNC: Recalculate based on what's left
        const remainingExams = await db.getExamsByWorker(worker.id);
        const newStatus = logic.recalculateWorkerStatus(remainingExams);

        // 3. Save Update
        await db.saveWorker({ ...worker, ...newStatus });

        // 4. Reload
        setSelectedIds(new Set());
        loadData();

        showToast('Historique nettoyé et statut mis à jour', 'success');
      } catch (e) {
        console.error(e);
        showToast('Erreur de synchronisation', 'error');
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
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cet examen ?')) return;

    try {
      // 1. Delete the exam
      await db.deleteExam(examId);

      // 2. Fetch remaining exams to recalculate
      const remainingExams = await db.getExamsByWorker(worker.id);

      // 3. Recalculate status using the Logic Brain
      const newStatus = logic.recalculateWorkerStatus(remainingExams);

      // 4. Update the worker in DB
      const updatedWorker = {
        ...worker,
        ...newStatus,
      };
      await db.saveWorker(updatedWorker);

      // 5. Reload UI
      loadData();
    } catch (e) {
      console.error('Erreur sync:', e);
      showToast('Erreur lors de la mise à jour des dates', 'error');
    }
  };

  // [NEW] Handler pour le bouton PDF

  const handlePrintConfirm = (docType, dateSelected, extraOptions = {}) => {
    const enrichedWorker = {
      ...worker,
      deptName: deptName || 'Service Inconnu',
      workplaceName: workplaceName || '',
    };

    pdfService.generateBatchDoc([enrichedWorker], docType, {
      date: dateSelected,
      ...extraOptions,
    });

    setShowPrintModal(false);
  };

  // NOUVELLE FONCTION : Gère l'archivage
  const handleToggleArchive = async () => {
    const newStatus = !worker.archived;
    const actionName = newStatus ? 'archiver' : 'réactiver';

    if (window.confirm(`Voulez-vous vraiment ${actionName} ce travailleur ?`)) {
      // On utilise saveWorker qui gère la sauvegarde
      const updatedWorker = { ...worker, archived: newStatus };
      await db.saveWorker(updatedWorker);

      showToast(`Travailleur ${newStatus ? 'archivé' : 'réactivé'} avec succès`, 'success');
      loadData();
    }
  };

  const handleDeleteWorker = async () => {
    if (
      window.confirm(
        `ATTENTION : La suppression est définitive !\n\nVoulez-vous vraiment supprimer ${worker.full_name} et tout son historique ?\n\n(Conseil : Utilisez plutôt "Archiver" pour le masquer temporairement)`
      )
    ) {
      await db.deleteWorker(worker.id);
      onBack();
    }
  };

  const renderStatusBadge = (status) => {
    if (!status) return '-';
    let badgeClass = '';
    let label = status;

    switch (status) {
      case 'apte':
        badgeClass = 'badge badge-green';
        label = 'Apte';
        break;
      case 'inapte':
        badgeClass = 'badge badge-red';
        label = 'Inapte Temporaire';
        break;
      case 'apte_partielle':
        badgeClass = 'badge badge-yellow';
        label = 'Apte Partiel';
        break;
      default:
        return status;
    }
    return <span className={badgeClass}>{label}</span>;
  };

  if (workerNotFound) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🔍</div>
        <h2>Travailleur non trouvé</h2>
        <p style={{ color: 'var(--text-muted)' }}>
          Ce travailleur a peut-être été supprimé ou l'ID est invalide.
        </p>
        <button className="btn btn-primary" onClick={onBack} style={{ marginTop: '1rem' }}>
          <FaArrowLeft /> Retour à la liste
        </button>
      </div>
    );
  }

  if (!worker) return <div>Chargement...</div>;
  // [ACTIVATED] Logic to check if the worker is late
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
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {/* [NEW] Visual Indicator */}
            <CoproValidityIndicator dueDate={worker.next_exam_due} size={70} />

            <div>
              <h2 style={{ margin: 0 }}>
                {worker.full_name}
                {/* Indicateur visuel si archivé */}
                {worker.archived && (
                  <span
                    style={{
                      fontSize: '0.5em',
                      marginLeft: '10px',
                      background: '#eee',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      color: '#666',
                      verticalAlign: 'middle',
                    }}
                  >
                    ARCHIVÉ
                  </span>
                )}
              </h2>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                <strong>Service:</strong> {deptName} • <strong>Lieu:</strong> {workplaceName} •{' '}
                <strong>Poste:</strong> {worker.job_role}
              </p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Matricule: {worker.national_id}
              </p>
              <div
                style={{ marginTop: '0.5rem', display: 'flex', gap: '10px', alignItems: 'center' }}
              >
                {/* [FIX] Badge changes color if overdue */}
                <span
                  className={`badge ${isOverdue && !worker.archived ? 'badge-red' : 'badge-yellow'}`}
                >
                  Prochain Examen: {logic.formatDateDisplay(worker.next_exam_due)}
                </span>

                {/* [FIX] Explicit Text Warning */}
                {isOverdue && !worker.archived && (
                  <span style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                    ⚠️ En Retard
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Increased header button gap to 9px */}
          <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
            {/* [NEW] TOGGLE SELECTION MODE (Icon Only) */}
            <button
              className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-outline'}`}
              onClick={toggleSelectionMode}
              title={isSelectionMode ? 'Masquer la sélection' : 'Sélection multiple'}
            >
              <FaCheckSquare />
            </button>

            {/* Bouton Nouvel Examen */}
            <button className="btn btn-primary" onClick={handleNewExam} disabled={worker.archived}>
              <FaFileMedical /> <span className="hide-mobile">Nouvel Examen</span>
            </button>

            {/* NOUVEAU BOUTON ARCHIVER / REACTIVER */}
            <button
              className="btn btn-outline"
              onClick={handleToggleArchive}
              title={
                worker.archived
                  ? 'Réactiver ce travailleur'
                  : 'Archiver (Désactiver temporairement)'
              }
              style={{
                color: worker.archived ? 'var(--success)' : 'var(--warning)',
                borderColor: worker.archived ? 'var(--success)' : 'var(--warning)',
              }}
            >
              {worker.archived ? (
                <>
                  <FaBoxOpen /> <span className="hide-mobile">Réactiver</span>
                </>
              ) : (
                <>
                  <FaArchive /> <span className="hide-mobile">Archiver</span>
                </>
              )}
            </button>
            {/* [NEW] BOUTON SMART PDF */}
            <button
              className="btn btn-outline"
              onClick={() => setShowPrintModal(true)}
              title="Imprimer documents (Convocation, Aptitude...)"
            >
              <FaPrint /> <span className="hide-mobile">Docs</span>
            </button>
            {/* Bouton Supprimer (Rouge) */}
            <button
              className="btn btn-outline"
              onClick={handleDeleteWorker}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              title="Supprimer définitivement"
            >
              <FaTrash />
            </button>
          </div>
        </div>

        {worker.archived && (
          <div
            style={{
              marginTop: '1rem',
              padding: '0.75rem',
              background: '#f8f9fa',
              border: '1px dashed #ccc',
              borderRadius: '4px',
              fontSize: '0.9rem',
              color: '#666',
            }}
          >
            ℹ️ Ce dossier est archivé. Il n'apparaîtra plus dans le tableau de bord des retards.
            Cliquez sur "Réactiver" pour le modifier.
          </div>
        )}

        <div
          style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}
        >
          <strong>Antécédents médicaux:</strong> {worker.notes || 'Aucun antécédent.'}
        </div>
      </div>

      {/* --- TITLE --- */}
      <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Historique Médical</h3>

      {/* --- HYBRID HISTORY LIST --- */}
      <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '400px' : 'none' }}>
        <div className="hybrid-container" style={{ minWidth: '700px' }}>
          {/* 1. HEADER CARD */}
          <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate }}>
            <div style={{ textAlign: 'center' }}>
              {isSelectionMode && (
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={exams.length > 0 && selectedIds.size === exams.length}
                />
              )}
            </div>
            <div>Date</div>
            <div>Médecin</div>
            <div>Résultat Labo</div>
            <div>Statut Final</div>
            <div style={{ textAlign: 'right', paddingRight: '0.5rem' }}>Actions</div>
          </div>

          {/* 2. ROW CARDS */}
          {exams.map((e) => {
            const isSelected = selectedIds.has(e.id);
            return (
              <div
                key={e.id}
                className={`hybrid-row ${isSelected ? 'selected' : ''}`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {/* Col 1: Checkbox */}
                <div style={{ textAlign: 'center', overflow: 'hidden' }}>
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(e.id)}
                    />
                  )}
                </div>

                {/* Col 2: Date */}
                <div className="hybrid-cell" style={{ fontWeight: 800 }}>
                  {e.exam_date}
                </div>

                {/* Col 3: Médecin */}
                <div className="hybrid-cell">{e.physician_name || '-'}</div>

                {/* Col 4: Labo */}
                <div className="hybrid-cell">
                  {e.lab_result ? (
                    <span
                      className={`badge ${
                        e.lab_result.result === 'positive' ? 'badge-red' : 'badge-green'
                      }`}
                    >
                      {e.lab_result.result === 'positive' ? 'Positif' : 'Négatif'}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                      En attente
                    </span>
                  )}
                </div>

                {/* Col 5: Statut */}
                <div className="hybrid-cell">{renderStatusBadge(e.decision?.status)}</div>

                {/* Col 6: Actions - Forced 9px gap */}
                <div
                  className="hybrid-actions"
                  style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end' }}
                >
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleOpenExam(e)}
                    title="Voir Détails"
                  >
                    <FaEye />
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleDeleteExam(e.id)}
                    style={{
                      color: 'var(--danger)',
                      borderColor: 'var(--danger)',
                      backgroundColor: '#fff1f2',
                    }}
                    title="Supprimer"
                  >
                    <FaTrash />
                  </button>
                </div>
              </div>
            );
          })}

          {exams.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>📂</div>
              <p>Aucun historique médical.</p>
            </div>
          )}
        </div>
      </div>

      {/* [NEW] Batch Toolbar (Delete Only) */}
      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onDelete={handleBatchDelete}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {/* [NEW] Modale d'Impression */}
      {showPrintModal && (
        <BatchPrintModal
          count={1}
          onConfirm={handlePrintConfirm}
          onCancel={() => setShowPrintModal(false)}
        />
      )}

      {showExamForm && (
        <ExamForm
          worker={worker}
          existingExam={selectedExam}
          deptName={deptName}
          workplaceName={workplaceName}
          onClose={() => setShowExamForm(false)}
          onSave={() => {
            setShowExamForm(false);
            loadData();
          }}
        />
      )}

      <ToastContainer />
    </div>
  );
}
