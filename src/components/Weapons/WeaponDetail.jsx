import { useState, useEffect } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import { FaPrint } from 'react-icons/fa';
import { pdfService } from '../../services/pdfGenerator';
import BatchPrintModal from '../BatchPrintModal';
import WeaponExamForm from './WeaponExamForm';
import { useToast } from '../Toast';
import {
  FaArrowLeft,
  FaFileMedical,
  FaTrash,
  FaArchive,
  FaBoxOpen,
  FaCheckSquare,
  FaEye,
} from 'react-icons/fa';
import BulkActionsToolbar from '../BulkActionsToolbar';

export default function WeaponDetail({ holderId, onBack, compactMode }) {
  const [holder, setHolder] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [weapon_exams, setWeaponExams] = useState([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [holderNotFound, setHolderNotFound] = useState(false);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [deptName, setDeptName] = useState('');

  const { showToast, ToastContainer } = useToast();

  const [isSelectionMode, setIsSelectionMode] = useState(
    () => localStorage.getItem('weapon_selection_mode_medical') === 'true'
  );

  const gridTemplate = isSelectionMode
    ? '50px 0.9fr 1.2fr 1.1fr 1fr 100px'
    : '0px 0.9fr 1.2fr 1.1fr 1fr 100px';

  const loadData = async () => {
    try {
      const id = Number(holderId);
      const h = await db.getWeaponHolder(id);

      if (!h) {
        setHolderNotFound(true);
        return;
      }

      setHolderNotFound(false);
      setHolder(h);

      if (h) {
        const depts = await db.getWeaponDepartments();
        const d = depts.find((x) => x.id == h.department_id);
        setDeptName(d ? d.name : '-');
      }

      const wExams = await db.getWeaponExamsByHolder(id);
      wExams.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
      setWeaponExams(wExams);
    } catch (e) {
      console.error(e);
      setHolderNotFound(true);
    }
  };

  useEffect(() => {
    loadData();
  }, [holderId]);

  const toggleSelectionMode = () => {
    const newState = !isSelectionMode;
    setIsSelectionMode(newState);
    localStorage.setItem('weapon_selection_mode_medical', newState);
    if (!newState) setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === weapon_exams.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(weapon_exams.map((e) => e.id)));
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
        await Promise.all(idsToDelete.map((id) => db.deleteWeaponExam(id)));

        const remaining = await db.getWeaponExamsByHolder(holder.id);
        if (remaining.length > 0) {
          remaining.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
          const last = remaining[0];
          await db.saveWeaponHolder({
            ...holder,
            status: last.final_decision,
            next_review_date: last.next_review_date,
          });
        } else {
          await db.saveWeaponHolder({
            ...holder,
            status: 'pending',
            next_review_date: '',
          });
        }

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
    await db.deleteWeaponExam(examId);

    const remaining = await db.getWeaponExamsByHolder(holder.id);
    if (remaining.length > 0) {
      remaining.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));
      const last = remaining[0];
      await db.saveWeaponHolder({
        ...holder,
        status: last.final_decision,
        next_review_date: last.next_review_date,
      });
    } else {
      await db.saveWeaponHolder({
        ...holder,
        status: 'pending',
        next_review_date: '',
      });
    }
    loadData();
  };

  const handlePrintConfirm = (docType, dateSelected, extraOptions = {}) => {
    pdfService.generateBatchDoc([{ ...holder, deptName }], docType, {
      date: dateSelected,
      ...extraOptions,
    });
    setShowPrintModal(false);
  };

  const handleToggleArchive = async () => {
    const newStatus = !holder.archived;
    await db.saveWeaponHolder({ ...holder, archived: newStatus });
    showToast(`Agent ${newStatus ? 'archivé' : 'réactivé'}`, 'success');
    loadData();
  };

  const handleDeleteHolder = async () => {
    if (window.confirm(`Supprimer définitivement ${holder.full_name} ?`)) {
      await db.deleteWeaponHolder(holder.id);
      onBack();
    }
  };

  const renderStatusBadge = (status) => {
    if (!status || status === 'pending') return <span className="badge">Neutre</span>;
    const configs = {
      apte: { class: 'badge-green', label: 'Apte' },
      inapte_temporaire: { class: 'badge-red', label: 'Inapte Temp.' },
      inapte_definitif: { class: 'badge-black', label: 'Inapte Déf.' },
    };
    const conf = configs[status] || { class: '', label: status };
    return <span className={`badge ${conf.class}`}>{conf.label}</span>;
  };

  if (holderNotFound) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem' }}>
        <h2>Agent non trouvé</h2>
        <button className="btn btn-primary" onClick={onBack} style={{ marginTop: '1rem' }}>
          <FaArrowLeft /> Retour à la liste
        </button>
      </div>
    );
  }

  if (!holder) return <div>Chargement...</div>;
  const isOverdue = logic.isWeaponDueSoon(holder.next_review_date);

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
            <h2 style={{ margin: 0 }}>
              {holder.full_name}
              {holder.archived && (
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
              <strong>Service RH:</strong> {deptName} • <strong>Poste:</strong>{' '}
              {holder.job_function}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Matricule: {holder.national_id}
            </p>
            <div
              style={{ marginTop: '0.5rem', display: 'flex', gap: '10px', alignItems: 'center' }}
            >
              <span
                className={`badge ${
                  isOverdue
                    ? 'badge-red'
                    : holder.status === 'apte'
                    ? 'badge-green'
                    : 'badge-yellow'
                }`}
              >
                {holder.status === 'apte'
                  ? 'Aptitude Permanente'
                  : `Prochaine Visite: ${logic.formatDateDisplay(holder.next_review_date)}`}
              </span>
              {isOverdue && (
                <span style={{ color: 'var(--danger)', fontWeight: 'bold', fontSize: '0.9rem' }}>
                  ⚠️ À Revoir
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '9px', flexWrap: 'wrap' }}>
            <button
              className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-outline'}`}
              onClick={toggleSelectionMode}
              title="Sélection multiple"
            >
              <FaCheckSquare />
            </button>
            <button className="btn btn-primary" onClick={handleNewExam} disabled={holder.archived}>
              <FaFileMedical /> <span className="hide-mobile">Nouvel Examen</span>
            </button>
            <button
              className="btn btn-outline"
              onClick={handleToggleArchive}
              style={{
                color: holder.archived ? 'var(--success)' : 'var(--warning)',
                borderColor: holder.archived ? 'var(--success)' : 'var(--warning)',
              }}
            >
              {holder.archived ? <FaBoxOpen /> : <FaArchive />}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => setShowPrintModal(true)}
              title="Imprimer documents"
            >
              <FaPrint /> <span className="hide-mobile">Docs</span>
            </button>
            <button
              className="btn btn-outline"
              onClick={handleDeleteHolder}
              style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            >
              <FaTrash />
            </button>
          </div>
        </div>

        {holder.archived && (
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
            ℹ️ Ce dossier est archivé. Cliquez sur "Réactiver" pour le modifier.
          </div>
        )}

        <div
          style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}
        >
          <strong>Antécédents médicaux:</strong> {holder.medical_history || 'Aucun antécédent.'}
        </div>
      </div>

      <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Historique Médical</h3>

      <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '400px' : 'none' }}>
        <div className="hybrid-container" style={{ minWidth: '700px' }}>
          <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate }}>
            <div style={{ textAlign: 'center' }}>
              {isSelectionMode && (
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={weapon_exams.length > 0 && selectedIds.size === weapon_exams.length}
                />
              )}
            </div>
            <div>Date</div>
            <div>Type</div>
            <div>Décision</div>
            <div>Révision</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {weapon_exams.map((e) => {
            const isSelected = selectedIds.has(e.id);
            return (
              <div
                key={e.id}
                className={`hybrid-row ${isSelected ? 'selected' : ''}`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                <div style={{ textAlign: 'center' }}>
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(e.id)}
                    />
                  )}
                </div>
                <div className="hybrid-cell" style={{ fontWeight: 800 }}>
                  {logic.formatDateDisplay(e.exam_date)}
                </div>
                <div className="hybrid-cell">{e.visit_reason}</div>
                <div className="hybrid-cell">{renderStatusBadge(e.final_decision)}</div>
                <div className="hybrid-cell">{logic.formatDateDisplay(e.next_review_date)}</div>
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

          {weapon_exams.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>📂</div>
              <p>Aucun historique médical.</p>
            </div>
          )}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onDelete={handleBatchDelete}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}
      {showPrintModal && (
        <BatchPrintModal
          count={1}
          onConfirm={handlePrintConfirm}
          onCancel={() => setShowPrintModal(false)}
          weaponMode={true}
        />
      )}
      {showExamForm && (
        <WeaponExamForm
          holder={holder}
          existingExam={selectedExam}
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
