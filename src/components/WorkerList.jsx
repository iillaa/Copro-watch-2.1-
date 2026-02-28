import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import useDebounce from '../hooks/useDebounce';
import { db } from '../services/db';
import { logic } from '../services/logic';
import backupService from '../services/backup';
import AddWorkerForm from './AddWorkerForm';
import BulkActionsToolbar from './BulkActionsToolbar'; // [NEW] Batch Toolbar
import MoveWorkersModal from './MoveWorkersModal'; // [NEW] Move Modal
import { pdfService } from '../services/pdfGenerator'; // [NEW]
import BatchScheduleModal from './BatchScheduleModal'; // [NEW]
import BatchPrintModal from './BatchPrintModal'; // [NEW]
import BatchResultModal from './BatchResultModal'; // [NEW]
import { exportWorkersToExcel } from '../services/excelExport';
import { useToast } from './Toast'; // [NEW] Import Toast Hook
import UniversalOCRModal from './UniversalOCRModal'; // [NEW] Import
import {
  FaPlus,
  FaSearch,
  FaFileExcel,
  FaEdit,
  FaTrash,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaUserPlus,
  FaCheckSquare,
  FaCamera,
} from 'react-icons/fa';

// [SURGICAL ADDITION] Fix #5: Loading Skeleton
// Place this BEFORE "export default function WorkerList"
const LoadingSkeleton = ({ mode }) => {
  // Match the grid template of the main table
  const gridTemplate = mode
    ? '50px 1.9fr 0.8fr 1fr 0.9fr 2.2fr 100px'
    : '0px 1.5fr 0.8fr 1fr 0.9fr 2.2fr 100px';

  return (
    <div className="scroll-wrapper" style={{ paddingBottom: '120px' }}>
      <div className="hybrid-container">
        {/* Fake Header */}
        <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate, opacity: 0.7 }}>
          <div></div>
          {/* Check */}
          <div>Nom</div>
          <div>Matricule</div>
          <div>Service</div>
          <div>Dernier</div>
          <div>Prochain</div>
          <div></div>
        </div>
        {/* Fake Rows */}
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="hybrid-row loading-shimmer"
            style={{
              gridTemplateColumns: gridTemplate,
              height: '60px',
              marginBottom: '0.6rem',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Just empty divs to shimmer */}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function WorkerList({ onNavigateWorker, compactMode }) {
  // [NEW] Toast Hook
  const { showToast, ToastContainer } = useToast();

  // ==================================================================================
  // 1. STATE MANAGEMENT
  // ==================================================================================

  const [showScheduleModal, setShowScheduleModal] = useState(false); // [NEW]
  const [showPrintModal, setShowPrintModal] = useState(false); // [NEW]
  const [showResultModal, setShowResultModal] = useState(false); // [NEW]

  // Data State
  const [workers, setWorkers] = useState([]);
  const [isLoading, setIsLoading] = useState(true); // [NEW] Loading state
  const [departments, setDepartments] = useState([]);
  const [workplaces, setWorkplaces] = useState([]);

  // UI State
  const [searchTerm, setSearchTerm] = useState('');

  // [NEW] 250ms Debounce Shield
  const debouncedSearch = useDebounce(searchTerm, 250);

  // [NEW] Progressive Chunking Limit
  const [displayLimit, setDisplayLimit] = useState(30);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [w, d, wp] = await Promise.all([
        db.getWorkers(), // <-- Reverted to pull all data once (Enables deep search)
        db.getDepartments(),
        db.getWorkplaces(),
      ]);
      setWorkers(w);
      setDepartments(d);
      setWorkplaces(wp);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Run strictly once on mount (No DB spam on every keystroke)
  useEffect(() => {
    loadData();
  }, []);

  const [filterDept, setFilterDept] = useState(
    () => localStorage.getItem('worker_filter_dept') || ''
  );
  // [SURGICAL FIX] Initialize from LocalStorage
  const [filterStatus, setFilterStatus] = useState(
    localStorage.getItem('worker_filter_status') || ''
  );

  const [sortConfig, setSortConfig] = useState({
    key: 'full_name',
    direction: 'asc',
  });

  const [showArchived, setShowArchived] = useState(false);

  // [NEW] Progressive Chunking Limit - Reset when filters change
  useEffect(() => {
    setDisplayLimit(30);
  }, [debouncedSearch, filterDept, filterStatus, showArchived, sortConfig]);

  const [showForm, setShowForm] = useState(false);
  const [editingWorker, setEditingWorker] = useState(null);
  const [deletingId, setDeletingId] = useState(null); // [NEW] Track which worker is being deleted

  // [NEW] BATCH SELECTION STATE
  // We use localStorage to remember if the user likes the checkboxes visible or hidden
  const [isSelectionMode, setIsSelectionMode] = useState(
    () => localStorage.getItem('copro_selection_mode_workers') === 'true'
  );
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showOCRModal, setShowOCRModal] = useState(false); // [NEW]

  // ==================================================================================
  // 2. DATA LOADING & EFFECTS
  // ==================================================================================

  useEffect(() => {
    localStorage.setItem('worker_filter_dept', filterDept);
  }, [filterDept]);
  // ==================================================================================
  // 3. FILTERING & SORTING ENGINE (useMemo)
  // ==================================================================================

  const filteredWorkers = useMemo(() => {
    let result = workers;

    // 1. Fast Filtering (Booleans/IDs first)
    if (!showArchived) result = result.filter((w) => !w.archived);
    if (filterDept) result = result.filter((w) => w.department_id === Number(filterDept));
    
    // 2. Status filters (Optimized order)
    if (filterStatus) {
      if (filterStatus === 'late') {
        result = result.filter((w) => !w.archived && logic.isOverdue(w.next_exam_due));
      } else if (filterStatus === 'due_soon') {
        result = result.filter((w) => !w.archived && logic.isDueSoon(w.next_exam_due) && !logic.isOverdue(w.next_exam_due));
      } else if (filterStatus === 'inapte') {
        result = result.filter((w) => w.latest_status === 'inapte');
      } else if (filterStatus === 'apte_partielle') {
        result = result.filter((w) => w.latest_status === 'apte_partielle');
      } else if (filterStatus === 'apte') {
        result = result.filter((w) => w.latest_status === 'apte' && !logic.isOverdue(w.next_exam_due));
      }
    }

    // 3. Search (Substring matching)
    if (debouncedSearch) {
      const lower = debouncedSearch.toLowerCase();
      result = result.filter((w) => {
        const nameMatch = w.full_name && w.full_name.toLowerCase().includes(lower);
        const idMatch = w.national_id && String(w.national_id).toLowerCase().includes(lower);
        return nameMatch || idMatch;
      });
    }

    // 4. Sort logic (Pre-calculate sort values)
    if (sortConfig.key) {
      const isDeptSort = sortConfig.key === 'department_id';
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      
      result = [...result].sort((a, b) => {
        let aVal, bVal;
        
        if (isDeptSort) {
          aVal = departments.find((x) => x.id == a.department_id)?.name || '';
          bVal = departments.find((x) => x.id == b.department_id)?.name || '';
        } else {
          aVal = a[sortConfig.key];
          bVal = b[sortConfig.key];
        }

        if (typeof aVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = (bVal || '').toLowerCase();
        }
        
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;
        return 0;
      });
    }

    return result;
  }, [workers, filterDept, showArchived, sortConfig, departments, filterStatus, debouncedSearch]);

  // [SURGICAL ADDITION] Optimized Memoized List
  const memoizedWorkers = useMemo(() => {
    // We only process the SLICE that will actually be rendered + a buffer
    // This is the "Poor Man's Virtualization"
    return filteredWorkers.slice(0, displayLimit + 20).map((w) => ({
      ...w,
      isOverdue: logic.isOverdue(w.next_exam_due),
      deptName: departments.find((d) => d.id == w.department_id)?.name || '-',
    }));
  }, [filteredWorkers, departments, displayLimit]);
  // ==================================================================================
  // 4. BATCH OPERATIONS HANDLERS
  // ==================================================================================

  // Toggle the Checkbox Column ON/OFF
  const toggleSelectionMode = () => {
    const newState = !isSelectionMode;
    setIsSelectionMode(newState);
    localStorage.setItem('copro_selection_mode_workers', newState);

    // Safety: If turning OFF, clear selections to avoid accidental deletes later
    if (!newState) {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredWorkers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWorkers.map((w) => w.id)));
    }
  };

  const toggleSelectOne = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // [SURGICAL FIX: BATCH WITH DOCTOR NAME]
  const handleBatchScheduleConfirm = async (dateStr) => {
    // 1. Identify Targets
    const targets = workers.filter((w) => selectedIds.has(w.id));

    // 2. [NEW] Fetch the Default Doctor Name (Same as ExamForm)
    const settings = await db.getSettings();
    const defaultDoctor = settings.doctor_name || 'Dr. Kibeche Ali Dia Eddine';

    await Promise.all(
      targets.map(async (w) => {
        // 3. Create the Exam (Clone of Manual Creation)
        const newExam = {
          worker_id: w.id,
          exam_date: dateStr, // Date requested
          physician_name: defaultDoctor, // [FIX] Now includes the doctor!
          notes: 'Analyse Groupée (Batch)',
          status: 'open', // Still "En attente"
          lab_result: null,
          decision: null,
        };

        // 4. Save to DB
        await db.saveExam(newExam);

        // 5. Sync Worker Dates
        const allExams = await db.getExamsByWorker(w.id);
        const statusUpdate = logic.recalculateWorkerStatus(allExams);
        await db.saveWorker({ ...w, ...statusUpdate });
      })
    );

    // 6. Cleanup
    setShowScheduleModal(false);
    setSelectedIds(new Set());
    loadData(); // Refresh list immediately
    // OLD: alert(`${targets.length} analyses créées pour ${defaultDoctor}.`);
    // NEW:
    showToast(`${targets.length} analyses créées pour ${defaultDoctor}.`, 'success');
  };

  // [NEW] BATCH PRINT HANDLER
  const handleBatchPrint = () => {
    setShowPrintModal(true);
  };
  // [UPDATED] Logique d'impression pour la liste (Batch)
  const confirmBatchPrint = (docType, dateSelected, extraOptions = {}) => {
    // 1. On récupère les travailleurs sélectionnés
    const targets = workers.filter((w) => selectedIds.has(w.id));

    // 2. On enrichit avec les noms de service et lieu
    const targetsWithInfo = targets.map((w) => ({
      ...w,
      deptName: departments.find((d) => d.id === w.department_id)?.name || 'Autre',
      workplaceName: workplaces.find((wp) => wp.id === w.workplace_id)?.name || '',
    }));

    // 3. On génère le PDF en passant les nouvelles options (heure/date consultation)
    pdfService.generateBatchDoc(targetsWithInfo, docType, {
      date: dateSelected,
      ...extraOptions, // <--- C'est ici que passent l'heure et la date de RDV
    });

    setShowPrintModal(false);
  };

  // [NEW] BATCH RESULT HANDLER
  const handleBatchResultConfirm = async (payload) => {
    const targets = workers.filter((w) => selectedIds.has(w.id));

    await Promise.all(
      targets.map(async (w) => {
        // 1. Find the LATEST OPEN exam for this worker
        const allExams = await db.getExamsByWorker(w.id);

        // Sort by date descending
        const sorted = allExams.sort((a, b) => new Date(b.exam_date) - new Date(a.exam_date));

        // Find the most recent 'open' exam, OR just take the last exam if none are explicitly open
        let targetExam = sorted.find((e) => e.status === 'open') || sorted[0];

        if (!targetExam) return; // Should not happen if workflow is followed

        // 2. Prepare the Update
        const updateData = {
          ...targetExam,
          status: 'closed', // We are closing it now
          lab_result: {
            result: payload.mode, // 'negative' or 'positive'
            date: payload.date,
            parasite: payload.parasite || '',
          },
          decision: {
            status: payload.decision, // 'apte', 'inapte', etc.
            date: payload.date,
          },
        };

        // Add Treatment if positive
        if (payload.mode === 'positive') {
          updateData.treatment = {
            drug: payload.treatment,
            start_date: payload.date,
            retest_date: logic.calculateRetestDate(payload.date, payload.retestDays),
          };
        } else {
          // If Negative, ensure we clear any old treatment data if reusing an object
          updateData.treatment = null;
        }

        // 3. Save Exam
        await db.saveExam(updateData);

        // 4. Sync Worker Status (This calculates the next +6 months or +7 days)
        const refreshedExams = await db.getExamsByWorker(w.id);
        const statusUpdate = logic.recalculateWorkerStatus(refreshedExams);
        await db.saveWorker({ ...w, ...statusUpdate });
      })
    );

    setShowResultModal(false);
    setSelectedIds(new Set());
    loadData();
    // OLD: alert(`${targets.length} résultats mis à jour !`);
    // NEW:
    showToast(`${targets.length} résultats mis à jour !`, 'success');
  };

  // [SURGICAL FIX: BATCH DELETE WITH SYNC]
  // [CORRECTED FOR WORKER LIST]
  const handleBatchDelete = async () => {
    // 1. Confirm Intent (Deleting WORKERS)
    if (!window.confirm(`Supprimer définitivement ${selectedIds.size} travailleurs ?`)) {
      return;
    }

    try {
      setIsLoading(true);
      const targets = Array.from(selectedIds);

      // 2. Delete WORKERS (Not exams)
      await Promise.all(targets.map((id) => db.deleteWorker(id)));

      // 3. Reload List
      setSelectedIds(new Set());
      await loadData();

      // OLD: alert('Suppression terminée.');
      // NEW:
      showToast('Suppression terminée.', 'success');
    } catch (e) {
      console.error('Batch Delete Failed:', e);
      // OLD: alert('Erreur lors de la suppression.');
      // NEW:
      showToast('Erreur lors de la suppression.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBatchArchive = async () => {
    // 1. Identify the selected workers
    const targets = workers.filter((w) => selectedIds.has(w.id));

    // 2. Detect State: Are they ALL currently archived?
    // If every selected worker is already archived, we assume you want to RESTORE them.
    const areAllArchived = targets.length > 0 && targets.every((w) => w.archived);

    // 3. Determine Action & New Status
    const actionLabel = areAllArchived ? 'Restaurer' : 'Archiver';
    const newStatus = !areAllArchived; // If all archived (true), set to false (active).

    // 4. Confirm & Execute
    if (window.confirm(`${actionLabel} ${selectedIds.size} travailleurs ?`)) {
      await Promise.all(targets.map((w) => db.saveWorker({ ...w, archived: newStatus })));

      setSelectedIds(new Set());
      // Keep Selection Mode ON (User Preference)
      loadData();
    }
  };
  const handleBatchMoveConfirm = async (deptId) => {
    const targets = workers.filter((w) => selectedIds.has(w.id));
    await Promise.all(targets.map((w) => db.saveWorker({ ...w, department_id: parseInt(deptId) })));

    setShowMoveModal(false);
    setSelectedIds(new Set());
    // [FIX] Mode stays ON after move
    loadData();
  };

  // ==================================================================================
  // 5. STANDARD ACTION HANDLERS
  // ==================================================================================

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
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

  const handleEdit = (e, worker) => {
    e.stopPropagation();
    setEditingWorker(worker);
    setShowForm(true);
  };

  const handleDelete = async (e, worker) => {
    e.stopPropagation();
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer ${worker.full_name} ?`)) {
      try {
        setDeletingId(worker.id); // [NEW] Start loading
        await db.deleteWorker(worker.id);
        await loadData(); // Wait for reload
        // [Optional] You can add a success toast here if you like
        showToast('Travailleur supprimé.', 'success');
      } catch (error) {
        console.error('Delete failed', error);
        // OLD: alert('Erreur lors de la suppression');
        // NEW:
        showToast('Erreur lors de la suppression', 'error');
      } finally {
        setDeletingId(null); // [NEW] Stop loading
      }
    }
  };

  const handleExport = async () => {
    try {
      const json = await db.exportData();
      // Use the backup service to ensure it saves correctly
      await backupService.saveBackupJSON(
        json,
        `medical_backup_${new Date().toISOString().split('T')[0]}.json`
      );
      // OLD: alert('Export réussi ! (Vérifiez le dossier Documents/copro-watch)');
      // NEW:
      showToast('Export réussi ! (Vérifiez le dossier Documents)', 'success');
    } catch (e) {
      console.error(e);
      // OLD: alert("Erreur lors de l'export: " + e.message);
      // NEW:
      showToast("Erreur lors de l'export: " + e.message, 'error');
    }
  };
  // [NEW] Excel Reporting Function
  const handleExcelExport = async () => {
    if (filteredWorkers.length === 0) {
      // OLD: alert('Aucune donnée affichée à exporter.');
      // NEW:
      showToast('Aucune donnée affichée à exporter.', 'warning');
      return;
    }

    // Uses the current filtered list (respects your search/department filters)
    try {
      await exportWorkersToExcel(filteredWorkers, departments);
      // [Optional] Add success toast
      showToast('Fichier Excel généré !', 'success');
    } catch (error) {
      console.error('Export Excel failed:', error);
      // OLD: alert('Erreur lors de la création du fichier Excel.');
      // NEW:
      showToast('Erreur lors de la création du fichier Excel.', 'error');
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const success = await db.importData(evt.target.result);
      if (success) {
        // OLD: alert('Import réussi !');
        // NEW:
        showToast('Import réussi !', 'success');
        loadData();
      } else {
        // OLD: alert("Erreur lors de l'import.");
        // NEW:
        showToast("Erreur lors de l'import.", 'error');
      }
    };
    reader.readAsText(file);
  };

  // ==================================================================================
  // 6. HELPER FUNCTIONS
  // ==================================================================================

  const getDeptName = (id) => {
    return departments.find((x) => x.id == id)?.name || '-';
  };

  const renderStatusBadge = (status) => {
    if (!status) return null;
    const configs = {
      apte: { class: 'badge-green', label: 'Apte' },
      inapte: { class: 'badge-red', label: 'Inapte' },
      apte_partielle: { class: 'badge-yellow', label: 'Apte Partiel' },
    };
    const conf = configs[status];
    if (!conf) return null;

    return (
      <span className={`badge ${conf.class}`} style={{ marginLeft: '0.5rem', fontSize: '0.7rem' }}>
        {conf.label}
      </span>
    );
  };

  // [HELPER] Search Highlighter
  const highlightMatch = (text, search) => {
    if (!search || !text) return text;
    // Split text based on the search term (case insensitive)
    const parts = text.toString().split(new RegExp(`(${search})`, 'gi'));
    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === search.toLowerCase() ? (
            <span
              key={i}
              style={{ backgroundColor: '#fef08a', color: 'black', borderRadius: '2px' }}
            >
              {part}
            </span>
          ) : (
            part
          )
        )}
      </span>
    );
  };

  const emptyStateUI = (
    <div
      className="card"
      style={{
        textAlign: 'center',
        padding: '4rem 2rem',
        border: '2px dashed var(--border-color)',
        background: '#f8fafc',
        boxShadow: 'none',
        marginTop: '2rem',
      }}
    >
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌱</div>
      <h3 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Aucun travailleur enregistré</h3>
      <p
        style={{
          color: 'var(--text-muted)',
          marginBottom: '2rem',
          maxWidth: '450px',
          margin: '0 auto 2rem',
        }}
      >
        Votre base de données est vide. Commencez par ajouter votre premier travailleur.
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={() => {
            setEditingWorker(null);
            setShowForm(true);
          }}
        >
          <FaUserPlus /> Ajouter le premier travailleur
        </button>
      </div>
    </div>
  );
  // ==================================================================================
  // RENDER: HYBRID ROW-CARD LAYOUT (Fixed)
  // ==================================================================================

  // Columns: Check | Nom | Mat | Svc | Last | Next | Actions
  // [FIX] Updated Template: 2.2fr for Prochain Dû (Column 6) to stop squishing
  const gridTemplate = isSelectionMode
    ? '50px 1.9fr 0.8fr 1fr 0.9fr 2.2fr 100px'
    : '0px 1.5fr 0.8fr 1fr 0.9fr 2.2fr 100px';

  return (
    <div>
      {/* HEADER BAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h2 style={{ marginBottom: 0 }}>Liste des Travailleurs</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {filteredWorkers.length} dossier{filteredWorkers.length > 1 ? 's' : ''} trouvé(s)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {/* SELECTION MODE BUTTON */}
          <button
            className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-outline'}`}
            onClick={toggleSelectionMode}
            title={isSelectionMode ? 'Masquer la sélection' : 'Activer la sélection multiple'}
            style={{ padding: '0.6rem 0.8rem' }}
          >
            <FaCheckSquare />
          </button>

          {/* [NEW] SCAN BUTTON */}
          <button
            className="btn btn-outline"
            onClick={() => setShowOCRModal(true)}
            title="Scanner une liste papier (OCR)"
          >
            <FaCamera /> <span className="hide-mobile">Scan</span>
          </button>

          {/* [NEW] EXCEL BUTTON (For Administration) */}
          <button
            className="btn btn-outline"
            onClick={handleExcelExport}
            title="Générer un rapport Excel officiel"
            style={{ borderColor: '#107C41', color: '#107C41' }}
          >
            <FaFileExcel /> <span className="hide-mobile">Excel</span>
          </button>

          {/* NEW WORKER BUTTON */}
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingWorker(null);
              setShowForm(true);
            }}
          >
            <FaPlus /> <span className="hide-mobile">Nouveau</span>
          </button>
        </div>
      </div>

      {/* [SURGICAL REPLACEMENT] Fix #4 & #5: Skeleton + Optimized Map */}
      {isLoading ? (
        <LoadingSkeleton mode={isSelectionMode} />
      ) : workers.length === 0 ? (
        emptyStateUI
      ) : (
        <>
          {/* FILTERS BAR (Kept exactly as it was) */}
          <div
            className="card"
            style={{
              padding: '0.75rem',
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              overflowX: 'auto',
              marginBottom: '1rem',
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
                placeholder="Rechercher (Nom et prénom, Matricule)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              className="input"
              style={{ width: 'auto', borderRadius: '50px' }}
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
            >
              <option value="">Tous les services</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{
                width: 'auto',
                borderRadius: '50px',
                fontWeight: filterStatus ? 'bold' : 'normal',
                color: filterStatus ? 'var(--primary)' : 'inherit',
              }}
              value={filterStatus}
              onChange={(e) => {
                setFilterStatus(e.target.value);
                localStorage.setItem('worker_filter_status', e.target.value);
              }}
            >
              <option value="">Tout le monde</option>
              <option value="late">⚠️ En Retard</option>
              <option value="due_soon">📅 À Prévoir (Bientôt)</option>
              <option value="inapte">🔴 Inaptes (Malades)</option>
              <option value="apte_partielle">🟠 Aptes Partiels</option>
              <option value="apte">🟢 Aptes</option>
            </select>
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
              />
              Archives
            </label>
            {(searchTerm || filterDept || filterStatus) && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setSearchTerm('');
                  setFilterDept('');
                  setFilterStatus('');
                  // [FIX] Clear Storage
                  localStorage.removeItem('worker_filter_dept');
                  localStorage.removeItem('worker_filter_status');
                }}
              >
                Effacer
              </button>
            )}
          </div>

          {/* SCROLLABLE TABLE WINDOW */}
          <div
            className="scroll-wrapper"
            // [SURGICAL FIX] When compactMode is OFF, remove limit ('none') to disable internal scroll
            style={{ maxHeight: compactMode ? '75vh' : 'none', paddingBottom: '120px' }}
          >
            <div className="hybrid-container">
              {/* 1. STICKY HEADER ROW */}
              <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate }}>
                <div style={{ textAlign: 'center' }}>
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      onChange={toggleSelectAll}
                      checked={
                        filteredWorkers.length > 0 && selectedIds.size === filteredWorkers.length
                      }
                    />
                  )}
                </div>
                <div onClick={() => handleSort('full_name')} style={{ cursor: 'pointer' }}>
                  Nom et prénom {getSortIcon('full_name')}
                </div>
                <div onClick={() => handleSort('national_id')} style={{ cursor: 'pointer' }}>
                  <span className="hide-mobile">Matricule</span>
                  <span className="show-mobile">Mat</span>
                  {getSortIcon('national_id')}
                </div>
                <div onClick={() => handleSort('department_id')} style={{ cursor: 'pointer' }}>
                  Service {getSortIcon('department_id')}
                </div>
                <div onClick={() => handleSort('last_exam_date')} style={{ cursor: 'pointer' }}>
                  <span className="hide-mobile">Dernier Exam</span>
                  <span className="show-mobile">Last</span>
                  {getSortIcon('last_exam_date')}
                </div>
                <div onClick={() => handleSort('next_exam_due')} style={{ cursor: 'pointer' }}>
                  <span className="hide-mobile">Prochain Dû</span>
                  <span className="show-mobile">Next</span>
                  {getSortIcon('next_exam_due')}
                </div>
                <div style={{ textAlign: 'right', paddingRight: '0.5rem' }}>Actions</div>
              </div>

              {/* 2. OPTIMIZED DATA ROWS (Manual Chunking) */}
              {memoizedWorkers.slice(0, displayLimit).map((w) => {
                const isSelected = selectedIds.has(w.id);

                return (
                  <div
                    key={w.id}
                    onClick={() =>
                      isSelectionMode ? toggleSelectOne(w.id) : onNavigateWorker(w.id)
                    }
                    className={`hybrid-row ${isSelected ? 'selected' : ''} ${
                      !w.archived && w.isOverdue ? 'overdue-worker-row' : ''
                    }`}
                    style={{
                      gridTemplateColumns: gridTemplate,
                      opacity: w.archived ? 0.6 : 1,
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{ textAlign: 'center', overflow: 'hidden' }}>
                      {isSelectionMode && (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(w.id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>

                    {/* Nom et prénom */}
                    <div className="hybrid-cell cell-name">
                      {highlightMatch(w.full_name, debouncedSearch)}
                      {w.archived && (
                        <span
                          className="badge"
                          style={{
                            fontSize: '0.6rem',
                            marginLeft: '5px',
                            background: '#eee',
                            color: '#666',
                          }}
                        >
                          Archivé
                        </span>
                      )}
                    </div>

                    {/* Matricule */}
                    <div className="hybrid-cell">
                      <span
                        style={{
                          fontFamily: 'monospace',
                          background: '#f1f5f9',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.8rem',
                          color: '#64748b',
                        }}
                      >
                        {highlightMatch(w.national_id, debouncedSearch)}
                      </span>
                    </div>

                    {/* Service (Uses pre-calculated name) */}
                    <div className="hybrid-cell">{w.deptName}</div>

                    {/* Dernier Exam */}
                    <div className="hybrid-cell">
                      {w.last_exam_date ? logic.formatDateDisplay(new Date(w.last_exam_date)) : '-'}
                    </div>

                    {/* Prochain Dû (Optimized) */}
                    <div
                      className="hybrid-cell"
                      style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                      <span style={{ fontWeight: 600, minWidth: '85px', display: 'inline-block' }}>
                        {logic.formatDateDisplay(w.next_exam_due)}
                      </span>
                      {renderStatusBadge(w.latest_status)}
                      {!w.archived && w.isOverdue && (
                        <span
                          className="badge badge-red"
                          style={{ fontSize: '0.65rem', padding: '2px 6px' }}
                        >
                          RETARD
                        </span>
                      )}
                    </div>

                    {/* Actions - Forced 9px gap for better touch separation */}
                    <div
                      className="hybrid-actions"
                      style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end' }}
                    >
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={(e) => handleEdit(e, w)}
                        title="Modifier"
                      >
                        <FaEdit />
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={(e) => handleDelete(e, w)}
                        disabled={deletingId === w.id}
                        style={{
                          color: 'var(--danger)',
                          borderColor: 'var(--danger)',
                          backgroundColor: '#fff1f2',
                        }}
                        title="Supprimer"
                      >
                        {deletingId === w.id ? (
                          <div
                            className="loading-spinner"
                            style={{ width: '12px', height: '12px', borderWidth: '2px' }}
                          ></div>
                        ) : (
                          <FaTrash />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* [NEW] THE BULLETPROOF FALLBACK BUTTON */}
              {displayLimit < memoizedWorkers.length && (
                <div style={{ textAlign: 'center', padding: '1.5rem 0' }}>
                  <button 
                    className="btn btn-outline" 
                    onClick={() => setDisplayLimit(prev => prev + 30)}
                    style={{ fontWeight: 'bold', width: '200px' }}
                  >
                    Afficher plus...
                  </button>
                </div>
              )}

              {/* Empty Search Result State */}
              {memoizedWorkers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🔍</div>
                  <p>Aucun résultat trouvé.</p>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setSearchTerm('');
                      setFilterDept('');
                    }}
                  >
                    Effacer les filtres
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* FLOATERS */}
      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onDelete={handleBatchDelete}
          onArchive={handleBatchArchive}
          onMove={() => setShowMoveModal(true)}
          onSchedule={() => setShowScheduleModal(true)} // [NEW]
          onPrint={() => setShowPrintModal(true)} // [NEW]
          onResult={() => setShowResultModal(true)} // [NEW]
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {showScheduleModal && (
        <BatchScheduleModal
          count={selectedIds.size}
          onConfirm={handleBatchScheduleConfirm}
          onCancel={() => setShowScheduleModal(false)}
        />
      )}

      {showMoveModal && (
        <MoveWorkersModal
          departments={departments}
          onConfirm={handleBatchMoveConfirm}
          onCancel={() => setShowMoveModal(false)}
        />
      )}

      {showForm && (
        <AddWorkerForm
          workerToEdit={editingWorker}
          onClose={() => setShowForm(false)}
          onSave={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}

      {showPrintModal && (
        <BatchPrintModal
          count={selectedIds.size}
          onConfirm={confirmBatchPrint}
          onCancel={() => setShowPrintModal(false)}
        />
      )}

      {showResultModal && (
        <BatchResultModal
          count={selectedIds.size}
          onConfirm={handleBatchResultConfirm}
          onCancel={() => setShowResultModal(false)}
        />
      )}
      {/* [NEW] OCR Modal for Workers */}
      {showOCRModal && (
        <UniversalOCRModal
          mode="worker" // <--- Tells it to save to Worker DB
          departments={departments}
          onClose={() => setShowOCRModal(false)}
          onImportSuccess={(count) => {
            loadData();
            showToast(`${count} travailleurs importés !`, 'success');
          }}
        />
      )}

      {/* [NEW] TOAST CONTAINER */}
      <ToastContainer />
    </div>
  );
}
