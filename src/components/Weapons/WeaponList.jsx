import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import backupService from '../../services/backup';
import AddWeaponHolderForm from './AddWeaponHolderForm';
import MoveWeaponHoldersModal from './MoveWeaponHoldersModal'; // [NEW]
import { useToast } from '../Toast';
import BulkActionsToolbar from '../BulkActionsToolbar';
import BatchScheduleModal from '../BatchScheduleModal';
import BatchPrintModal from '../BatchPrintModal';
import BatchResultModal from '../BatchResultModal';
import { exportWeaponsToExcel } from '../../services/excelExport';
import { pdfService } from '../../services/pdfGenerator';
import UniversalOCRModal from '../UniversalOCRModal'; // [NEW]

import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaUserPlus,
  FaCheckSquare,
  FaFileExcel,
  FaHistory,
  FaStethoscope,
  FaBalanceScale,
  FaPrint,
  FaArchive,
  FaExchangeAlt,
  FaCamera,
} from 'react-icons/fa';

export default function WeaponList({ onNavigateWeaponHolder, compactMode }) {
  const { showToast, ToastContainer } = useToast();
  const [holders, setHolders] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);

  // [SURGICAL FIX] Sticky Filters
  const [filterDept, setFilterDept] = useState(localStorage.getItem('weapon_filter_dept') || '');
  const [filterStatus, setFilterStatus] = useState(
    localStorage.getItem('weapon_filter_status') || ''
  );

  const [sortConfig, setSortConfig] = useState({ key: 'full_name', direction: 'asc' });
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingHolder, setEditingHolder] = useState(null);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false); // [NEW]
  const [showOCRModal, setShowOCRModal] = useState(false); // [NEW]

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [h, d] = await Promise.all([db.getWeaponHolders(), db.getWeaponDepartments()]);
      setHolders(h || []);
      setDepartments(d || []);
    } catch (error) {
      console.error('Failed to load weapon data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredHolders = useMemo(() => {
    let result = holders;
    if (!showArchived) result = result.filter((h) => !h.archived);

    if (filterDept) {
      if (filterDept === 'none') {
        result = result.filter((h) => !h.department_id || h.department_id === 0);
      } else {
        result = result.filter((h) => h.department_id === Number(filterDept));
      }
    }

    if (filterStatus) {
      // [SURGICAL ADDITION] Overdue Filter
      if (filterStatus === 'late') {
        result = result.filter((h) => h.next_review_date && logic.isOverdue(h.next_review_date));
      } else if (filterStatus === 'due_soon') {
        // [FIX] Show "Pending" (New) OR "Due Soon" (expired/review needed)
        result = result.filter(
          (h) =>
            h.status === 'pending' ||
            (h.next_review_date && logic.isWeaponDueSoon(h.next_review_date))
        );
      } else {
        result = result.filter((h) => h.status === filterStatus);
      }
    }

    if (deferredSearch) {
      const lower = deferredSearch.toLowerCase();
      result = result.filter(
        (h) =>
          (h.full_name && h.full_name.toLowerCase().includes(lower)) ||
          (h.national_id && String(h.national_id).toLowerCase().includes(lower)) ||
          (h.job_function && h.job_function.toLowerCase().includes(lower)) ||
          (h.medical_history && h.medical_history.toLowerCase().includes(lower))
      );
    }

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let aVal = a[sortConfig.key] || '';
        let bVal = b[sortConfig.key] || '';

        if (sortConfig.key === 'department_id') {
          aVal = departments.find((d) => d.id === a.department_id)?.name || '';
          bVal = departments.find((d) => d.id === b.department_id)?.name || '';
        }

        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [holders, deferredSearch, showArchived, sortConfig, filterStatus, filterDept, departments]);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) {
      return <FaSort style={{ opacity: 0.3, marginLeft: '5px' }} />;
    }
    return sortConfig.direction === 'asc' ? (
      <FaSortUp style={{ marginLeft: '5px' }} />
    ) : (
      <FaSortDown style={{ marginLeft: '5px' }} />
    );
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds(new Set());
  };

  const toggleSelectOne = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredHolders.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredHolders.map((h) => h.id)));
  };

  const handleDelete = async (e, holder) => {
    e.stopPropagation();
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer ${holder.full_name} ?`)) {
      try {
        setDeletingId(holder.id);
        await db.deleteWeaponHolder(holder.id); // Wait for DB to finish
        await loadData(); // Reload safely
        showToast('Agent supprimé.', 'success');
      } catch (error) {
        console.error('Delete failed', error);
        showToast('Erreur lors de la suppression', 'error');
      } finally {
        setDeletingId(null);
      }
    }
  };

  // [RESTORED PARITY] Search Highlighting Function
  const highlightMatch = (text) => {
    if (!searchTerm || !text) return text;
    const parts = String(text).split(new RegExp(`(${searchTerm})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === searchTerm.toLowerCase() ? (
        <span key={i} style={{ backgroundColor: '#fef08a', padding: '0 2px', borderRadius: '2px' }}>
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const handleBatchDelete = async () => {
    if (window.confirm(`Supprimer définitivement ${selectedIds.size} agents ?`)) {
      await Promise.all(Array.from(selectedIds).map((id) => db.deleteWeaponHolder(id)));
      showToast('Suppression terminée', 'success');
      setSelectedIds(new Set());
      loadData();
    }
  };

  // [NEW] Batch Archive Handler
  const handleBatchArchive = async () => {
    // 1. Identify the selected holders
    const targets = holders.filter((h) => selectedIds.has(h.id));

    // 2. Detect State: Are they ALL currently archived?
    // If every selected holder is already archived, we assume you want to RESTORE them.
    const areAllArchived = targets.length > 0 && targets.every((h) => h.archived);

    // 3. Determine Action & New Status
    const actionLabel = areAllArchived ? 'Restaurer' : 'Archiver';
    const newStatus = !areAllArchived; // If all archived (true), set to false (active).

    // 4. Confirm & Execute
    if (window.confirm(`${actionLabel} ${selectedIds.size} agents ?`)) {
      await Promise.all(targets.map((h) => db.saveWeaponHolder({ ...h, archived: newStatus })));

      setSelectedIds(new Set());
      // Keep Selection Mode ON (User Preference)
      loadData();
      showToast(`${selectedIds.size} agents ${actionLabel.toLowerCase()}s`, 'success');
    }
  };

  // [NEW] Batch Move Confirm Handler
  const handleBatchMoveConfirm = async (newDeptId) => {
    await db.moveWeaponHolders(selectedIds, newDeptId);
    showToast('Agents déplacés avec succès', 'success');
    setShowMoveModal(false);
    setSelectedIds(new Set());
    loadData();
  };

  const handleBatchScheduleConfirm = async (dateStr) => {
    await Promise.all(
      Array.from(selectedIds).map(async (id) => {
        await db.saveWeaponExam({
          holder_id: id,
          exam_date: dateStr,
          visit_reason: 'Périodique',
          final_decision: 'pending', // Special status for batch scheduled
        });
      })
    );
    setShowScheduleModal(false);
    setSelectedIds(new Set());
    loadData();
    showToast('Visites planifiées', 'success');
  };

  const handleBatchResultConfirm = async (payload) => {
    const today = new Date().toISOString().split('T')[0];
    await Promise.all(
      Array.from(selectedIds).map(async (id) => {
        const exams = await db.getWeaponExamsByHolder(id);
        if (!exams || exams.length === 0) return; // [FIX] Skip if no exam present

        // Sort by date descending
        const sorted = [...exams].sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));

        // [FIX] Find the most recent 'pending' exam, or fallback to the latest one
        const targetExam = sorted.find((e) => e.final_decision === 'pending') || sorted[0];

        const decision = payload.decision; // 'apte', 'inapte_temporaire', 'inapte_definitif'
        const isApte = decision === 'apte';
        const commissionDate = payload.date || today;
        let nextDate = '';

        if (decision === 'inapte_temporaire') {
          const d = new Date(commissionDate);
          // In weapon mode, retestDays from modal is actually months
          d.setMonth(d.getMonth() + (parseInt(payload.retestDays) || 3));
          nextDate = d.toISOString().split('T')[0];
        }

        await db.saveWeaponExam({
          // [FIX] Derive expert opinions from the final commission decision
          medical_aptitude: isApte ? 'apte' : 'inapte',
          psych_advice: isApte ? 'favorable' : 'reserve',
          chief_advice: isApte ? 'favorable' : 'defavorable',
          visit_reason: 'Périodique',
          ...targetExam,
          commission_date: commissionDate,
          final_decision: decision,
          next_review_date: nextDate,
          inaptitude_duration: decision === 'inapte_temporaire' ? String(payload.retestDays) : '0',
          // [FIX] Do NOT overwrite exam_date. Keep the one from targetExam (Consultation date).
        });
      })
    );
    setShowResultModal(false);
    setSelectedIds(new Set());
    loadData();
    showToast('Décisions enregistrées', 'success');
  };

  const handleBatchPrintConfirm = (docType, creationDate, options) => {
    // For Registre de Suivi: print ALL holders (not just selected)
    let targets;
    if (docType === 'weapon_registre') {
      targets = holders
        .filter((h) => !h.archived) // Only active holders
        .map((h) => ({
          ...h,
          deptName: departments.find((d) => d.id === h.department_id)?.name || '-',
        }));
    } else {
      targets = holders
        .filter((h) => selectedIds.has(h.id))
        .map((h) => ({
          ...h,
          deptName: departments.find((d) => d.id === h.department_id)?.name || '-',
        }));
    }
    pdfService.generateBatchDoc(targets, docType, { ...options, date: creationDate });
    setShowPrintModal(false);
  };

  const handleExport = async () => {
    try {
      const json = await db.exportData();
      await backupService.saveBackupJSON(
        json,
        `weapon_backup_${new Date().toISOString().split('T')[0]}.json`
      );
      showToast('Export JSON réussi', 'success');
    } catch (e) {
      showToast('Erreur export JSON', 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const success = await db.importData(evt.target.result);
      if (success) {
        showToast('Import réussi', 'success');
        loadData();
      } else {
        showToast('Erreur import', 'error');
      }
    };
    reader.readAsText(file);
  };

  const handleExcelExport = async () => {
    try {
      await exportWeaponsToExcel(filteredHolders, departments);
    } catch (e) {
      showToast('Erreur export Excel', 'error');
    }
  };

  const gridTemplate = isSelectionMode
    ? '50px 1.8fr 0.7fr 1fr 1fr 2fr 100px'
    : '0px 1.8fr 0.7fr 1fr 1fr 2fr 100px';

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h2 style={{ marginBottom: 0 }}>{"Détenteurs d'Armes"}</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {filteredHolders.length} agent(s) trouvé(s)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-outline'}`}
            onClick={toggleSelectionMode}
            title="Sélection Multiple"
            style={{ padding: '0.8rem 1rem' }}
          >
            <FaCheckSquare />
          </button>

          {/* [NEW] SCAN BUTTON - PASTE HERE */}
          <button
            className="btn btn-outline"
            onClick={() => setShowOCRModal(true)}
            title="Scanner une liste (OCR)"
            style={{ padding: '0.8rem 1rem' }}
          >
            <FaCamera /> <span className="hide-mobile">Scan</span>
          </button>

          <button
            className="btn btn-outline"
            style={{ color: '#107C41', borderColor: '#107C41', padding: '0.8rem 1rem' }}
            onClick={handleExcelExport}
          >
            <FaFileExcel /> <span className="hide-mobile">Excel</span>
          </button>

          <button
            className="btn btn-primary"
            style={{ padding: '0.8rem 1rem' }}
            onClick={() => {
              setEditingHolder(null);
              setShowForm(true);
            }}
          >
            <FaPlus /> <span className="hide-mobile">Nouveau</span>
          </button>
        </div>
      </div>

      <div
        className="card"
        style={{
          padding: '0.75rem',
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '1rem',
          overflowX: 'auto',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <FaSearch
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--text-muted)',
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: '2.5rem', borderRadius: '50px' }}
            placeholder="Rechercher (Nom, Matricule, Poste, Antécédents)..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* [FIX] Sticky Dept */}
        <select
          className="input"
          style={{ width: 'auto', borderRadius: '50px' }}
          value={filterDept}
          onChange={(e) => {
            setFilterDept(e.target.value);
            localStorage.setItem('weapon_filter_dept', e.target.value);
          }}
        >
          <option value="">Tous les services</option>
          <option value="none">⚠️ Sans service</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        {/* [FIX] Sticky Status */}
        <select
          className="input"
          style={{ width: 'auto', borderRadius: '50px' }}
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            localStorage.setItem('weapon_filter_status', e.target.value);
          }}
        >
          <option value="">Tous les statuts</option>
          <option value="late">⚠️ En Retard</option>
          <option value="apte">🟢 Apte</option>
          <option value="inapte_temporaire">🔴 Inapte Temporaire</option>
          <option value="inapte_definitif">⚫ Inapte Définitif</option>
          <option value="due_soon">🟠 À Revoir</option>
        </select>

        {/* [NEW] Effacer Button */}
        {(searchTerm || filterDept || filterStatus) && (
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setSearchTerm('');
              setFilterDept('');
              setFilterStatus('');
              // Clear sticky storage too
              localStorage.removeItem('weapon_filter_dept');
              localStorage.removeItem('weapon_filter_status');
            }}
          >
            Effacer
          </button>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />{' '}
          Archives
        </label>
      </div>

      {/* [SURGICAL FIX] Disable internal scroll when not in compact mode */}
      <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '75vh' : 'none' }}>
        {/* [RESTORED PARITY] Empty State UI */}
        {filteredHolders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
            <FaUserPlus style={{ fontSize: '3rem', color: '#cbd5e1', marginBottom: '1rem' }} />
            <h3>Aucun agent trouvé</h3>
            <p>Commencez par ajouter un détenteur d'arme ou modifiez vos filtres de recherche.</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: '1rem' }}
              onClick={() => setShowForm(true)}
            >
              <FaPlus /> Ajouter un agent
            </button>
          </div>
        ) : (
          <div className="hybrid-container">
            <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate }}>
              <div style={{ textAlign: 'center' }}>
                {isSelectionMode && (
                  <input
                    type="checkbox"
                    onChange={toggleSelectAll}
                    checked={
                      filteredHolders.length > 0 && selectedIds.size === filteredHolders.length
                    }
                  />
                )}
              </div>
              <div onClick={() => handleSort('full_name')} style={{ cursor: 'pointer' }}>
                Nom et prénom {getSortIcon('full_name')}
              </div>
              <div onClick={() => handleSort('national_id')} style={{ cursor: 'pointer' }}>
                Matricule {getSortIcon('national_id')}
              </div>
              <div onClick={() => handleSort('department_id')} style={{ cursor: 'pointer' }}>
                Service {getSortIcon('department_id')}
              </div>
              <div onClick={() => handleSort('job_function')} style={{ cursor: 'pointer' }}>
                Poste / Grade {getSortIcon('job_function')}
              </div>
              <div onClick={() => handleSort('next_review_date')} style={{ cursor: 'pointer' }}>
                Prochain Dû {getSortIcon('next_review_date')}
              </div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>

            {filteredHolders.map((h) => {
              const isSelected = selectedIds.has(h.id);
              const deptName = departments.find((d) => d.id === h.department_id)?.name || '-';
              const isDue = logic.isWeaponDueSoon(h.next_review_date);

              // [SURGICAL FIX] Strict Status Check
              // Only 'inapte_temporaire' can be overdue. Apte/Definitif are ignored.
              const isOverdue =
                h.status === 'inapte_temporaire' &&
                h.next_review_date &&
                logic.isOverdue(h.next_review_date);

              return (
                <div
                  key={h.id}
                  // [NEW] Add 'overdue-worker-row' class for red border effect
                  className={`hybrid-row ${isSelected ? 'selected' : ''} ${
                    !h.archived && isOverdue ? 'overdue-worker-row' : ''
                  }`}
                  style={{ gridTemplateColumns: gridTemplate }}
                  onClick={() =>
                    isSelectionMode ? toggleSelectOne(h.id) : onNavigateWeaponHolder(h.id)
                  }
                >
                  <div style={{ textAlign: 'center' }}>
                    {isSelectionMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelectOne(h.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                  <div className="hybrid-cell" style={{ fontWeight: 600 }}>
                    {highlightMatch(h.full_name)} {/* <--- HIGHLIGHT APPLIED */}
                  </div>
                  <div className="hybrid-cell">
                    <span className="badge-id">{highlightMatch(h.national_id)}</span>{' '}
                    {/* <--- HIGHLIGHT APPLIED */}
                  </div>
                  <div className="hybrid-cell">{deptName}</div>
                  <div className="hybrid-cell">{highlightMatch(h.job_function)}</div>{' '}
                  {/* <--- HIGHLIGHT APPLIED */}
                  <div className="hybrid-cell" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
                    <span
                      style={{
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                        color: isOverdue ? 'var(--danger)' : isDue ? '#d97706' : 'inherit',
                      }}
                    >
                      {h.status === 'apte'
                        ? 'PERMANENT'
                        : h.status === 'inapte_definitif'
                        ? 'DÉFINITIF'
                        : logic.formatDateDisplay(h.next_review_date)}
                    </span>

                    {/* [NEW] RETARD BADGE */}
                    {!h.archived && isOverdue && (
                      <span
                        className="badge badge-red"
                        style={{ fontSize: '0.65rem', whiteSpace: 'nowrap' }}
                      >
                        RETARD
                      </span>
                    )}

                    {/* [FIX] Status Badge: Better handling of pending and definitif statuses */}
                    {h.status && (
                      <span
                        className={`badge ${
                          h.status === 'apte'
                            ? 'badge-green'
                            : h.status === 'inapte_definitif'
                            ? 'badge-black'
                            : h.status === 'pending'
                            ? 'badge-yellow'
                            : 'badge-red'
                        }`}
                        style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}
                      >
                        {h.status === 'apte' ? 'Apte' : h.status === 'pending' ? 'Attente' : 'Inapte'}
                      </span>
                    )}
                  </div>
                  <div className="hybrid-actions">
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingHolder(h);
                        setShowForm(true);
                      }}
                    >
                      <FaEdit />
                    </button>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={(e) => handleDelete(e, h)}
                      disabled={deletingId === h.id}
                      style={{
                        color: 'var(--danger)',
                        borderColor: 'var(--danger)',
                        backgroundColor: '#fff1f2',
                      }}
                      title="Supprimer"
                    >
                      {deletingId === h.id ? (
                        <div
                          className="loading-spinner"
                          style={{
                            width: '12px',
                            height: '12px',
                            borderWidth: '2px',
                            borderTopColor: 'var(--danger)',
                          }}
                        ></div>
                      ) : (
                        <FaTrash />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onDelete={handleBatchDelete}
          onArchive={handleBatchArchive} // [NEW]
          onMove={() => setShowMoveModal(true)} // [NEW]
          onSchedule={() => setShowScheduleModal(true)}
          onResult={() => setShowResultModal(true)}
          onPrint={() => setShowPrintModal(true)}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {showScheduleModal && (
        <BatchScheduleModal
          count={selectedIds.size}
          onConfirm={handleBatchScheduleConfirm}
          onCancel={() => setShowScheduleModal(false)}
          weaponMode={true}
        />
      )}

      {/* [NEW] Move Modal */}
      {showMoveModal && (
        <MoveWeaponHoldersModal
          departments={departments}
          onConfirm={handleBatchMoveConfirm}
          onCancel={() => setShowMoveModal(false)}
        />
      )}

      {showResultModal && (
        <BatchResultModal
          count={selectedIds.size}
          onConfirm={handleBatchResultConfirm}
          onCancel={() => setShowResultModal(false)}
          weaponMode={true}
        />
      )}

      {showPrintModal && (
        <BatchPrintModal
          count={selectedIds.size}
          onConfirm={handleBatchPrintConfirm}
          onCancel={() => setShowPrintModal(false)}
          weaponMode={true}
        />
      )}

      {showForm && (
        <AddWeaponHolderForm
          holderToEdit={editingHolder}
          onClose={() => setShowForm(false)}
          onSave={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}
      {/* [NEW] OCR Modal for Weapons */}
      {showOCRModal && (
        <UniversalOCRModal
          mode="weapon" // <--- Crucial: Sets the target database
          departments={departments}
          onClose={() => setShowOCRModal(false)}
          onImportSuccess={(count, skipped) => {
            loadData();
            let msg = `${count} agents importés !`;
            if (skipped > 0) msg += ` (${skipped} doublons ignorés)`;
            showToast(msg, 'success');
          }}
        />
      )}
      <ToastContainer />
    </div>
  );
}
