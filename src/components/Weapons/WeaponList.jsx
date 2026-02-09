import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import AddWeaponHolderForm from './AddWeaponHolderForm';
import { useToast } from '../Toast';
import BulkActionsToolbar from '../BulkActionsToolbar';
import { exportWeaponsToExcel } from '../../services/excelExport';
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
  FaPrint,
} from 'react-icons/fa';

export default function WeaponList({ onNavigateWeaponHolder, compactMode }) {
  const { showToast, ToastContainer } = useToast();
  const [holders, setHolders] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  
  const [filterDept, setFilterDept] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  
  const [sortConfig, setSortConfig] = useState({ key: 'full_name', direction: 'asc' });
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingHolder, setEditingHolder] = useState(null);

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [h, d] = await Promise.all([
        db.getWeaponHolders(),
        db.getWeaponDepartments(),
      ]);
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
      result = result.filter((h) => h.department_id === Number(filterDept));
    }

    if (filterStatus) {
       if (filterStatus === 'due_soon') {
          result = result.filter(h => logic.isWeaponDueSoon(h.next_review_date) && h.status === 'apte');
       } else {
          result = result.filter((h) => h.status === filterStatus);
       }
    }

    if (deferredSearch) {
      const lower = deferredSearch.toLowerCase();
      result = result.filter((h) => 
        (h.full_name && h.full_name.toLowerCase().includes(lower)) ||
        (h.national_id && String(h.national_id).toLowerCase().includes(lower))
      );
    }

    if (sortConfig.key) {
      result = [...result].sort((a, b) => {
        let aVal = a[sortConfig.key] || '';
        let bVal = b[sortConfig.key] || '';
        
        if (sortConfig.key === 'department_id') {
          aVal = departments.find(d => d.id === a.department_id)?.name || '';
          bVal = departments.find(d => d.id === b.department_id)?.name || '';
        }

        if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase(); }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [holders, deferredSearch, showArchived, sortConfig, filterStatus, filterDept, departments]);

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
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
    else setSelectedIds(new Set(filteredHolders.map(h => h.id)));
  };

  const handleBatchDelete = async () => {
    if (window.confirm(`Supprimer ${selectedIds.size} agents ?`)) {
      await Promise.all(Array.from(selectedIds).map(id => db.deleteWeaponHolder(id)));
      showToast('Suppression terminée', 'success');
      setSelectedIds(new Set());
      loadData();
    }
  };

  const handleExcelExport = async () => {
    try {
      await exportWeaponsToExcel(filteredHolders, departments);
    } catch (e) {
      showToast('Erreur export Excel', 'error');
    }
  };

  const gridTemplate = isSelectionMode ? '50px 1.5fr 1fr 1fr 1.2fr 1fr 100px' : '0px 1.5fr 1fr 1fr 1.2fr 1fr 100px';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>{"Détenteurs d'Armes"}</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {filteredHolders.length} agent(s) trouvé(s)
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className={`btn ${isSelectionMode ? 'btn-primary' : 'btn-outline'}`} onClick={toggleSelectionMode} title="Sélection Multiple" style={{ padding: '0.8rem 1rem' }}>
            <FaCheckSquare />
          </button>
          <button className="btn btn-outline" style={{ color: '#107C41', borderColor: '#107C41', padding: '0.8rem 1rem' }} onClick={handleExcelExport}>
            <FaFileExcel /> <span className="hide-mobile">Excel</span>
          </button>
          <button className="btn btn-primary" style={{ padding: '0.8rem 1rem' }} onClick={() => { setEditingHolder(null); setShowForm(true); }}>
            <FaPlus /> <span className="hide-mobile">Nouveau</span>
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', overflowX: 'auto' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem', borderRadius: '50px' }} placeholder="Rechercher (Nom, Matricule)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
        <select className="input" style={{ width: 'auto', borderRadius: '50px' }} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">Tous les services</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="input" style={{ width: 'auto', borderRadius: '50px' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          <option value="apte">🟢 Apte</option>
          <option value="inapte_temporaire">🔴 Inapte Temporaire</option>
          <option value="inapte_definitif">⚫ Inapte Définitif</option>
          <option value="due_soon">🟠 À Revoir</option>
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', whiteSpace: 'nowrap', cursor: 'pointer' }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archives
        </label>
      </div>

      <div className="scroll-wrapper" style={{ maxHeight: compactMode ? '75vh' : '60vh' }}>
        <div className="hybrid-container">
          <div className="hybrid-header" style={{ gridTemplateColumns: gridTemplate }}>
            <div style={{ textAlign: 'center' }}>
              {isSelectionMode && <input type="checkbox" onChange={toggleSelectAll} checked={filteredHolders.length > 0 && selectedIds.size === filteredHolders.length} />}
            </div>
            <div onClick={() => handleSort('full_name')} style={{ cursor: 'pointer' }}>Nom {sortConfig.key === 'full_name' && (sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />)}</div>
            <div>Matricule</div>
            <div>Service</div>
            <div>Poste / Grade</div>
            <div>Statut</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredHolders.map((h) => {
            const isSelected = selectedIds.has(h.id);
            const deptName = departments.find(d => d.id === h.department_id)?.name || '-';
            return (
              <div key={h.id} className={`hybrid-row ${isSelected ? 'selected' : ''}`} style={{ gridTemplateColumns: gridTemplate }} onClick={() => isSelectionMode ? toggleSelectOne(h.id) : onNavigateWeaponHolder(h.id)}>
                <div style={{ textAlign: 'center' }}>
                  {isSelectionMode && <input type="checkbox" checked={isSelected} onChange={() => toggleSelectOne(h.id)} onClick={e => e.stopPropagation()} />}
                </div>
                <div className="hybrid-cell" style={{ fontWeight: 600 }}>{h.full_name}</div>
                <div className="hybrid-cell"><span className="badge-id">{h.national_id}</span></div>
                <div className="hybrid-cell">{deptName}</div>
                <div className="hybrid-cell">{h.job_function}</div>
                <div className="hybrid-cell">
                  <span className={`badge ${h.status === 'apte' ? 'badge-green' : h.status === 'inapte_definitif' ? 'badge-black' : 'badge-red'}`}>
                    {h.status === 'apte' ? 'Apte' : h.status === 'inapte_definitif' ? 'Inapte Définitif' : 'Inapte Temp.'}
                  </span>
                </div>
                <div className="hybrid-actions">
                   <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setEditingHolder(h); setShowForm(true); }}><FaEdit /></button>
                   <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={(e) => { e.stopPropagation(); if(window.confirm('Supprimer ?')) { db.deleteWeaponHolder(h.id); loadData(); } }}><FaTrash /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedIds.size}
          onDelete={handleBatchDelete}
          onCancel={() => setSelectedIds(new Set())}
        />
      )}

      {showForm && (
        <AddWeaponHolderForm
          holderToEdit={editingHolder}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); loadData(); }}
        />
      )}
      <ToastContainer />
    </div>
  );
}