import { useState, useEffect, useMemo, useDeferredValue } from 'react';
import { db } from '../../services/db';
import { logic } from '../../services/logic';
import AddWeaponHolderForm from './AddWeaponHolderForm';
import { useToast } from '../Toast';
import {
  FaPlus,
  FaSearch,
  FaEdit,
  FaTrash,
  FaSort,
  FaSortUp,
  FaSortDown,
  FaUserPlus,
  FaStethoscope,
} from 'react-icons/fa';

export default function WeaponList({ onNavigateWeaponHolder, compactMode }) {
  const { showToast, ToastContainer } = useToast();
  const [holders, setHolders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [filterStatus, setFilterStatus] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'full_name', direction: 'asc' });
  const [showArchived, setShowArchived] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingHolder, setEditingHolder] = useState(null);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const h = await db.getWeaponHolders();
      setHolders(h || []);
    } catch (error) {
      console.error('Failed to load weapon holders:', error);
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
        if (typeof aVal === 'string') { aVal = aVal.toLowerCase(); bVal = bVal.toLowerCase(); }
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [holders, deferredSearch, showArchived, sortConfig, filterStatus]);

  const handleSort = (key) => {
    setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  };

  const handleDelete = async (e, holder) => {
    e.stopPropagation();
    if (window.confirm(`Supprimer ${holder.full_name} ?`)) {
      await db.deleteWeaponHolder(holder.id);
      showToast('Détenteur supprimé', 'success');
      loadData();
    }
  };

  const gridTemplate = '80px 1.5fr 1fr 1fr 1fr 1fr 120px';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ marginBottom: 0 }}>{"Détenteurs d'Armes"}</h2>
          <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            {filteredHolders.length} dossier(s) trouvé(s)
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditingHolder(null); setShowForm(true); }}>
          <FaPlus /> <span className="hide-mobile">Nouveau Détenteur</span>
        </button>
      </div>

      <div className="card" style={{ padding: '0.75rem', display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input className="input" style={{ paddingLeft: '2.5rem', borderRadius: '50px' }} placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
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
            <div>Photo</div>
            <div onClick={() => handleSort('full_name')} style={{ cursor: 'pointer' }}>Nom {sortConfig.key === 'full_name' && (sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />)}</div>
            <div>Matricule</div>
            <div>Fonction</div>
            <div>Permis</div>
            <div>Statut</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredHolders.map((h) => (
            <div key={h.id} className="hybrid-row" style={{ gridTemplateColumns: gridTemplate }} onClick={() => onNavigateWeaponHolder(h.id)}>
              <div className="hybrid-cell">
                {h.photo ? <img src={h.photo} alt="" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#eee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><FaUserPlus color="#ccc" /></div>}
              </div>
              <div className="hybrid-cell" style={{ fontWeight: 600 }}>{h.full_name}</div>
              <div className="hybrid-cell"><span className="badge-id">{h.national_id}</span></div>
              <div className="hybrid-cell">{h.job_function}</div>
              <div className="hybrid-cell">{h.permit_type}</div>
              <div className="hybrid-cell">
                <span className={`badge ${h.status === 'apte' ? 'badge-green' : h.status === 'inapte_definitif' ? 'badge-black' : 'badge-red'}`}>
                  {h.status === 'apte' ? 'Apte' : h.status === 'inapte_definitif' ? 'Inapte Définitif' : 'Inapte Temp.'}
                </span>
              </div>
              <div className="hybrid-actions">
                 <button className="btn btn-sm btn-outline" onClick={(e) => { e.stopPropagation(); setEditingHolder(h); setShowForm(true); }}><FaEdit /></button>
                 <button className="btn btn-sm btn-outline" style={{ color: 'var(--danger)' }} onClick={(e) => handleDelete(e, h)}><FaTrash /></button>
              </div>
            </div>
          ))}

          {filteredHolders.length === 0 && (
            <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
              <p>Aucun détenteur d'arme trouvé.</p>
            </div>
          )}
        </div>
      </div>

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
