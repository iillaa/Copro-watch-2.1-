import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { logic } from '../services/logic';
import { useToast } from './Toast';
import WaterAnalysisForm from './WaterAnalysisForm';
import BulkActionsToolbar from './BulkActionsToolbar';
import {
  FaArrowLeft,
  FaFlask,
  FaTrash,
  FaEye, // [NEW] Eye Icon for Details
  FaCheckSquare,
} from 'react-icons/fa';

export default function WaterServiceDetail({ department, onBack, onSave, compactMode }) {
  // Toast
  const { showToast, ToastContainer } = useToast();

  // ==================================================================================
  // 1. STATE MANAGEMENT
  // ==================================================================================

  const [analyses, setAnalyses] = useState([]);
  const [allAnalyses, setAllAnalyses] = useState([]);

  // Form States
  const [showForm, setShowForm] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [editingAnalysis, setEditingAnalysis] = useState(null);

  // [BATCH SELECTION STATE]
  const [isSelectionMode, setIsSelectionMode] = useState(
    () => localStorage.getItem('copro_selection_mode_water') === 'true'
  );
  const [selectedIds, setSelectedIds] = useState(new Set());

  // [SMART GRID CONFIG]
  // Cols: Check(50) | Demande(1) | Prelev(1) | Result(1) | Verdict(1) | Notes(1.5) | Actions(100)
  const gridTemplate = isSelectionMode
    ? '50px 0.9fr 0.9fr 0.9fr 1fr 1.5fr 100px'
    : '0px 0.9fr 0.9fr 0.9fr 1fr 1.5fr 100px';

  // ==================================================================================
  // 2. DATA LOADING
  // ==================================================================================

  const loadData = async () => {
    const all = await db.getWaterAnalyses();
    const deptHistory = logic.getDepartmentWaterHistory(department.id, all);
    setAnalyses(deptHistory);
    setAllAnalyses(all);
  };

  useEffect(() => {
    loadData();
  }, [department.id]);

  // ==================================================================================
  // 3. HANDLERS
  // ==================================================================================

  const handleNewAnalysis = () => {
    setSelectedAnalysis(null);
    setEditingAnalysis(null);
    setShowForm(true);
  };

  const handleEdit = (analysis) => {
    setSelectedAnalysis(analysis);
    setEditingAnalysis(analysis);
    setShowForm(true);
  };

  const handleDeleteAnalysis = async (analysisId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cette analyse ?')) {
      await db.deleteWaterAnalysis(analysisId);
      loadData();
      if (onSave) onSave();
      showToast('Analyse supprimée', 'success');
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setSelectedAnalysis(null);
    setEditingAnalysis(null);
    loadData();
    if (onSave) onSave();
  };

  const renderStatusBadge = (result) => {
    if (!result || result === 'pending')
      return <span className="badge badge-yellow">En attente</span>;
    if (result === 'potable') return <span className="badge badge-green">Potable</span>;
    if (result === 'non_potable') return <span className="badge badge-red">Non Potable</span>;
    return '-';
  };

  const currentStatus = logic.getServiceWaterStatus(department.id, allAnalyses);
  const statusLabel = logic.getServiceWaterStatusLabel(currentStatus.status);
  const statusColor = logic.getServiceWaterStatusColor(currentStatus.status);

  // ==================================================================================
  // 4. BATCH HANDLERS
  // ==================================================================================

  const toggleSelectionMode = () => {
    const newState = !isSelectionMode;
    setIsSelectionMode(newState);
    localStorage.setItem('copro_selection_mode_water', newState);
    if (!newState) setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === analyses.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(analyses.map((a) => a.id)));
  };

  const toggleSelectOne = (id) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const handleBatchDelete = async () => {
    if (window.confirm(`Supprimer définitivement ${selectedIds.size} analyses ?`)) {
      const idsToDelete = Array.from(selectedIds);
      await Promise.all(idsToDelete.map((id) => db.deleteWaterAnalysis(id)));
      setSelectedIds(new Set());
      loadData();
      if (onSave) onSave();
      showToast(`${idsToDelete.length} analyses supprimées`, 'success');
    }
  };

  // ==================================================================================
  // 5. RENDER (Hybrid Card V4)
  // ==================================================================================
  return (
    <div style={{ animation: 'fadeIn 0.3s ease' }}>
      {/* Back Button */}
      <div style={{ marginBottom: '1rem' }}>
        <button className="btn btn-outline" onClick={onBack}>
          <FaArrowLeft /> Retour
        </button>
      </div>

      {/* Header Card */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2 style={{ margin: 0 }}>{department.name}</h2>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              Historique complet des analyses
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-outline'}`}
              onClick={toggleSelectionMode}
              title={isSelectionMode ? 'Masquer la sélection' : 'Sélection multiple'}
            >
              <FaCheckSquare />
            </button>

            <button className="btn btn-primary" onClick={handleNewAnalysis}>
              <FaFlask /> Nouvelle Analyse
            </button>
          </div>
        </div>

        <div
          style={{
            marginTop: '1rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <strong>Statut ce mois-ci:</strong>
          <span style={{ color: statusColor, fontWeight: 'bold', marginLeft: '0.5rem' }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* History Title */}
      <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>Historique</h3>

      {/* --- HYBRID LIST CONTAINER --- */}
      <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '500px' : 'none' }}>
        <div className="hybrid-container" style={{ minWidth: '800px' }}>
          {/* 1. STICKY HEADER */}
          <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate }}>
            <div style={{ textAlign: 'center' }}>
              {isSelectionMode && (
                <input
                  type="checkbox"
                  onChange={toggleSelectAll}
                  checked={analyses.length > 0 && selectedIds.size === analyses.length}
                />
              )}
            </div>
            <div>Date Demande</div>
            <div>Date Prélèvement</div>
            <div>Date Résultat</div>
            <div>Verdict</div>
            <div>Notes</div>
            <div style={{ textAlign: 'right', paddingRight: '0.5rem' }}>Actions</div>
          </div>

          {/* 2. DATA ROWS */}
          {analyses.map((a) => {
            const isSelected = selectedIds.has(a.id);
            return (
              <div
                key={a.id}
                className={`hybrid-row ${isSelected ? 'selected' : ''}`}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {/* Checkbox */}
                <div style={{ textAlign: 'center' }}>
                  {isSelectionMode && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(a.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                </div>

                {/* Date Demande */}
                <div className="hybrid-cell">{logic.formatDateDisplay(a.request_date)}</div>

                {/* Date Prélèvement */}
                <div className="hybrid-cell" style={{ fontWeight: 800 }}>
                  {logic.formatDateDisplay(a.sample_date)}
                </div>

                {/* Date Résultat */}
                <div className="hybrid-cell">{logic.formatDateDisplay(a.result_date)}</div>

                {/* Verdict */}
                <div className="hybrid-cell">{renderStatusBadge(a.result)}</div>

                {/* Notes */}
                <div
                  className="hybrid-cell"
                  style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontStyle: 'italic' }}
                >
                  {a.notes ? (
                    <span title={a.notes}>
                      {a.notes.length > 30 ? `${a.notes.substring(0, 30)}...` : a.notes}
                    </span>
                  ) : (
                    '-'
                  )}
                </div>

                {/* Actions */}
                <div className="hybrid-actions" style={{ display: 'flex', gap: '9px', justifyContent: 'flex-end' }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleEdit(a)}
                    title="Voir Détails"
                  >
                    <FaEye />
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => handleDeleteAnalysis(a.id)}
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

          {analyses.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem', opacity: 0.5 }}>🧪</div>
              <p>Aucune analyse enregistrée.</p>
            </div>
          )}
        </div>
      </div>

      {/* Batch Toolbar */}
      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onDelete={handleBatchDelete}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {/* Form Modal */}
      {showForm && (
        <WaterAnalysisForm
          type={editingAnalysis ? 'edit' : 'launch'}
          department={department}
          analysis={selectedAnalysis}
          analysisToEdit={editingAnalysis}
          onSuccess={handleFormSuccess}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ToastContainer />
    </div>
  );
}
