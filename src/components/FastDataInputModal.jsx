import { useState, useEffect } from 'react';
import { db } from '../services/db';
import { 
  FaBolt, 
  FaTimes, 
  FaPlus, 
  FaTrash, 
  FaSave, 
  FaGlobe,
  FaList,
  FaUsers,
  FaMapMarkerAlt,
  FaBriefcase,
  FaCheckCircle
} from 'react-icons/fa';

export default function FastDataInputModal({ mode = 'worker', onClose, onSave, departments = [], workplaces = [] }) {
  const [rows, setRows] = useState([]);
  const [isSaving, setIsProcessing] = useState(false);
  const [existingMatricules, setExistingMatricules] = useState(new Set());
  const [focusedRowId, setFocusedRowId] = useState(null); // [NEW] Row Highlighting

  // Load existing matricules for duplicate check (UI warning only)
  useEffect(() => {
    const loadIds = async () => {
      const all = mode === 'worker' ? await db.getWorkers() : await db.getWeaponHolders();
      setExistingMatricules(new Set(all.map(x => x.national_id?.toString().trim())));
    };
    loadIds();

    // Initialize with 5 empty rows
    const initialRows = Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      national_id: '',
      full_name: '',
      full_name_ar: '',
      department_id: localStorage.getItem(`last_${mode}_dept`) || '',
      workplace_id: localStorage.getItem(`last_${mode}_place`) || '',
      job_role: localStorage.getItem(`last_${mode}_job`) || '',
      job_role_ar: '',
      is_viewing_ar: false
    }));
    setRows(initialRows);
  }, [mode]);

  const addRow = () => {
    setRows(prev => {
      const last = prev.length > 0 ? prev[prev.length - 1] : {};
      return [
        ...prev,
        {
          id: Date.now(),
          national_id: '',
          full_name: '',
          full_name_ar: '',
          department_id: last.department_id || (localStorage.getItem(`last_${mode}_dept`) || ''),
          workplace_id: last.workplace_id || (localStorage.getItem(`last_${mode}_place`) || ''),
          job_role: last.job_role || (localStorage.getItem(`last_${mode}_job`) || ''),
          job_role_ar: '',
          is_viewing_ar: false
        }
      ];
    });
  };

  const removeRow = (id) => {
    if (rows.length > 1) {
      setRows(prev => prev.filter(r => r.id !== id));
    }
  };

  // [NEW] Live Uppercase First Letter Logic
  const formatName = (str) => {
    if (!str) return '';
    return str
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const updateRow = (id, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.id === id) {
        let finalValue = value;
        // Apply auto-capitalize to French full_name
        if (field === 'full_name' && !r.is_viewing_ar) {
          finalValue = formatName(value);
        }
        return { ...r, [field]: finalValue };
      }
      return r;
    }));
  };

  const toggleLang = (id) => {
    setRows(prev => prev.map(r => {
      if (r.id === id) return { ...r, is_viewing_ar: !r.is_viewing_ar };
      return r;
    }));
  };

  const handleBulkSave = async () => {
    // 1. Filter out completely empty rows
    const validRows = rows.filter(r => r.full_name || r.full_name_ar || r.national_id);
    if (validRows.length === 0) {
      onClose();
      return;
    }

    // 2. FORCED DUPLICATE PROTECTION (Internal & External)
    const seenInBatch = new Set();
    const duplicatesFound = [];

    for (const r of validRows) {
      const mid = r.national_id.toString().trim();
      
      // Check if duplicated WITHIN the current table
      if (mid && seenInBatch.has(mid)) {
        duplicatesFound.push(`${r.full_name || r.full_name_ar} (Matricule ${mid} déjà dans le tableau)`);
      }
      if (mid) seenInBatch.add(mid);

      // Check if duplicated in the DATABASE
      if (mid && existingMatricules.has(mid)) {
        duplicatesFound.push(`${r.full_name || r.full_name_ar} (Matricule ${mid} déjà dans la base)`);
      }
    }

    if (duplicatesFound.length > 0) {
      alert(`ENREGISTREMENT BLOQUÉ :\n\n${duplicatesFound.join('\n')}\n\nVeuillez corriger les matricules en rouge.`);
      return;
    }

    setIsProcessing(true);
    try {
      for (const r of validRows) {
        const data = {
          national_id: (r.national_id || '').toString().trim(),
          full_name: (r.full_name || '').trim(), // Already formatted by formatName
          full_name_ar: (r.full_name_ar || '').trim(),
          department_id: r.department_id ? Number(r.department_id) : '',
          status: mode === 'worker' ? 'active' : 'pending',
          created_at: new Date().toISOString()
        };

        if (mode === 'worker') {
          data.workplace_id = r.workplace_id ? Number(r.workplace_id) : '';
          data.job_role = (r.job_role || '').trim();
          data.job_role_ar = (r.job_role_ar || '').trim();
          await db.saveWorker(data);
        } else {
          data.job_function = (r.job_role || '').trim();
          data.job_function_ar = (r.job_role_ar || '').trim();
          await db.saveWeaponHolder(data);
        }
      }

      const lastRow = validRows[validRows.length - 1];
      localStorage.setItem(`last_${mode}_dept`, lastRow.department_id);
      if (mode === 'worker') {
        localStorage.setItem(`last_${mode}_place`, lastRow.workplace_id);
        localStorage.setItem(`last_${mode}_job`, lastRow.job_role);
      }

      onSave();
    } catch (err) {
      console.error('Fast Input Save Failed', err);
      alert('Erreur lors de l\'enregistrement.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFocus = (e, rowId) => {
    e.target.select();
    setFocusedRowId(rowId);
  };

  const handleKeyDown = (e, index, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (index < rows.length - 1) {
        const nextInput = document.querySelector(`tr[data-index="${index + 1}"] input[name="${field}"]`);
        if (nextInput) nextInput.focus();
        else addRow();
      } else {
        addRow();
      }
    }
  };

  const applyFirstToAll = (field) => {
    if (rows.length < 2) return;
    const firstVal = rows[0][field];
    if (!firstVal) {
      alert("Veuillez d'abord sélectionner une valeur dans la PREMIÈRE LIGNE.");
      return;
    }
    
    if (confirm(`Appliquer cette sélection à toutes les (${rows.length}) lignes ?`)) {
      setRows(prev => prev.map(r => ({ ...r, [field]: firstVal })));
    }
  };

  const validCount = rows.filter(r => r.full_name || r.national_id).length;
  const errorCount = rows.filter(r => r.national_id && existingMatricules.has(r.national_id.toString().trim())).length;

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: '1150px', height: '90vh', display: 'flex', flexDirection: 'column' }}>
        
        {/* HEADER */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '2px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)', color: 'white', padding: '12px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(217, 119, 6, 0.2)' }}>
              <FaBolt size={22} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800 }}>Saisie Rapide {mode === 'worker' ? 'Travailleurs' : 'Agents'}</h2>
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <span className="badge" style={{ background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd' }}>{rows.length} lignes</span>
                <span className="badge" style={{ background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>{validCount} valides</span>
                {errorCount > 0 && <span className="badge" style={{ background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>{errorCount} doublons</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="btn-icon" style={{ color: 'var(--danger)' }}><FaTimes size={20} /></button>
        </div>

        {/* TABLE BODY */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', background: '#f8fafc' }}>
          <div className="table-container" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 10, borderBottom: '2px solid #e2e8f0' }}>
                <tr>
                  <th style={{ padding: '14px 12px', textAlign: 'left', width: '130px', color: '#475569' }}><FaList /> Matricule</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', color: '#475569' }}><FaUsers /> Nom & Prénom</th>
                  <th style={{ padding: '14px 12px', textAlign: 'left', width: '190px', color: '#475569' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>{mode === 'worker' ? 'SERVICE RH' : 'SERVICE ARME'}</span>
                      <button 
                        onClick={() => applyFirstToAll('department_id')} 
                        style={{ 
                          fontSize: '0.65rem', 
                          padding: '2px 6px', 
                          borderRadius: '4px', 
                          background: '#f5f3ff', 
                          color: '#7c3aed', 
                          border: '1px solid #ddd6fe',
                          cursor: 'pointer',
                          width: 'fit-content',
                          fontWeight: 800
                        }}
                      >
                        <FaCheckCircle size={10} /> APPLIQUER TOUT
                      </button>
                    </div>
                  </th>
                  {mode === 'worker' && (
                    <th style={{ padding: '14px 12px', textAlign: 'left', width: '190px', color: '#475569' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800 }}>LIEU DE TRAVAIL</span>
                        <button 
                          onClick={() => applyFirstToAll('workplace_id')} 
                          style={{ 
                            fontSize: '0.65rem', 
                            padding: '2px 6px', 
                            borderRadius: '4px', 
                            background: '#f5f3ff', 
                            color: '#7c3aed', 
                            border: '1px solid #ddd6fe',
                            cursor: 'pointer',
                            width: 'fit-content',
                            fontWeight: 800
                          }}
                        >
                          <FaCheckCircle size={10} /> APPLIQUER TOUT
                        </button>
                      </div>
                    </th>
                  )}
                  <th style={{ padding: '14px 12px', textAlign: 'left', width: '190px', color: '#475569' }}>Poste</th>
                  <th style={{ width: '60px' }}></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => {
                  const isDuplicate = r.national_id && existingMatricules.has(r.national_id.toString().trim());
                  const isFocused = focusedRowId === r.id;
                  return (
                    <tr 
                      key={r.id} 
                      data-index={idx} 
                      style={{ 
                        borderBottom: '1px solid #f1f5f9', 
                        background: isDuplicate ? '#fff1f2' : (isFocused ? '#eff6ff' : 'transparent'),
                        transition: 'background 0.2s'
                      }}
                    >
                      {/* MATRICULE */}
                      <td style={{ padding: '10px' }}>
                        <input 
                          className="input" 
                          name="national_id"
                          value={r.national_id} 
                          onFocus={(e) => handleFocus(e, r.id)}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'national_id')}
                          onChange={(e) => updateRow(r.id, 'national_id', e.target.value)}
                          placeholder="Ex: 8456"
                          style={{ 
                            fontFamily: 'monospace', 
                            borderColor: isDuplicate ? '#ef4444' : (isFocused ? '#3b82f6' : undefined),
                            background: isDuplicate ? '#fff1f2' : undefined 
                          }}
                        />
                      </td>

                      {/* NOM & PRENOM */}
                      <td style={{ padding: '10px' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            className="input" 
                            name="full_name"
                            value={r.is_viewing_ar ? r.full_name_ar : r.full_name} 
                            onFocus={(e) => handleFocus(e, r.id)}
                            onKeyDown={(e) => handleKeyDown(e, idx, 'full_name')}
                            onChange={(e) => updateRow(r.id, r.is_viewing_ar ? 'full_name_ar' : 'full_name', e.target.value)}
                            placeholder={r.is_viewing_ar ? 'الاسم واللقب' : 'NOM ET PRÉNOM'}
                            style={{ 
                              fontWeight: 700, 
                              flex: 1,
                              fontFamily: r.is_viewing_ar ? 'Amiri, serif' : 'inherit',
                              fontSize: r.is_viewing_ar ? '1.15rem' : '0.95rem',
                              borderColor: isFocused ? '#3b82f6' : undefined
                            }}
                          />
                          <button 
                            onClick={() => toggleLang(r.id)}
                            className="btn btn-outline btn-sm"
                            title="Switcher de langue"
                            style={{ 
                              padding: '6px', 
                              borderRadius: '8px',
                              borderColor: r.is_viewing_ar ? '#10b981' : '#3b82f6',
                              background: r.is_viewing_ar ? '#f0fdf4' : '#eff6ff'
                            }}
                          >
                            <FaGlobe color={r.is_viewing_ar ? '#10b981' : '#3b82f6'} size={14} />
                          </button>
                        </div>
                      </td>

                      {/* SERVICE */}
                      <td style={{ padding: '10px' }}>
                        <select 
                          className="input" 
                          value={r.department_id}
                          onFocus={(e) => setFocusedRowId(r.id)}
                          onChange={(e) => updateRow(r.id, 'department_id', e.target.value)}
                          style={{ fontSize: '0.85rem', borderColor: isFocused ? '#3b82f6' : undefined }}
                        >
                          <option value="">Sélectionner...</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </td>

                      {/* LIEU (Worker Only) */}
                      {mode === 'worker' && (
                        <td style={{ padding: '10px' }}>
                          <select 
                            className="input" 
                            value={r.workplace_id}
                            onFocus={(e) => setFocusedRowId(r.id)}
                            onChange={(e) => updateRow(r.id, 'workplace_id', e.target.value)}
                            style={{ fontSize: '0.85rem', borderColor: isFocused ? '#3b82f6' : undefined }}
                          >
                            <option value="">Sélectionner...</option>
                            {workplaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        </td>
                      )}

                      {/* POSTE / GRADE */}
                      <td style={{ padding: '10px' }}>
                        <input 
                          className="input" 
                          name="job_role"
                          value={r.is_viewing_ar ? r.job_role_ar : r.job_role} 
                          onFocus={(e) => handleFocus(e, r.id)}
                          onKeyDown={(e) => handleKeyDown(e, idx, 'job_role')}
                          onChange={(e) => updateRow(r.id, r.is_viewing_ar ? 'job_role_ar' : 'job_role', e.target.value)}
                          placeholder={r.is_viewing_ar ? 'الوظيفة' : 'Poste'}
                          style={{ 
                            fontFamily: r.is_viewing_ar ? 'Amiri, serif' : 'inherit',
                            fontSize: r.is_viewing_ar ? '1.1rem' : '0.9rem',
                            borderColor: isFocused ? '#3b82f6' : undefined
                          }}
                        />
                      </td>

                      {/* DELETE */}
                      <td style={{ textAlign: 'center' }}>
                        <button 
                          onClick={() => removeRow(r.id)} 
                          style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}
                        >
                          <FaTrash size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button 
            onClick={addRow} 
            className="btn btn-outline" 
            style={{ 
              marginTop: '1.25rem', width: '100%', borderStyle: 'dashed', 
              color: 'var(--primary)', fontWeight: 700, padding: '12px',
              background: '#fff'
            }}
          >
            <FaPlus /> Ajouter une ligne vide
          </button>
        </div>

        {/* FOOTER */}
        <div style={{ padding: '1.25rem 1.5rem', borderTop: '2px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '1rem', background: '#fff' }}>
          <button className="btn btn-outline" onClick={onClose} disabled={isSaving}>Annuler</button>
          <button 
            className="btn btn-primary" 
            onClick={handleBulkSave} 
            disabled={isSaving}
            style={{ minWidth: '180px', height: '45px', fontSize: '1rem' }}
          >
            {isSaving ? 'Traitement en cours...' : <><FaSave /> Enregistrer tout ({rows.filter(r => r.full_name || r.national_id).length})</>}
          </button>
        </div>
      </div>
    </div>
  );
}
