import { useState } from 'react';
import { FaClipboardCheck, FaTimes, FaSave, FaFlask } from 'react-icons/fa';
import { logic } from '../services/logic'; // Need logic to calculate retest dates if needed

export default function BatchResultModal({ count, onConfirm, onCancel }) {
  const [mode, setMode] = useState('negative'); // 'negative' or 'positive'

  // Shared State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Positive State
  const [parasite, setParasite] = useState('Amibes');
  const [treatment, setTreatment] = useState('Flagyl 500mg (7j)');
  const [decision, setDecision] = useState('inapte'); // 'inapte' or 'apte_partielle'
  const [retestDays, setRetestDays] = useState(7);

  const handleSubmit = (e) => {
    e.preventDefault();

    const payload = {
      mode,
      date, // Date of result/validation
      parasite: mode === 'positive' ? parasite : null,
      treatment: mode === 'positive' ? treatment : null,
      decision: mode === 'positive' ? decision : 'apte',
      retestDays: mode === 'positive' ? retestDays : 0,
    };

    onConfirm(payload);
  };

  return (
    <div className="modal-overlay">
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaClipboardCheck /> Résultats Groupés ({count})
          </h3>
          <button onClick={onCancel} className="btn-icon">
            <FaTimes />
          </button>
        </div>

        {/* Mode Selection Tabs */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
          <button
            type="button"
            className={`btn ${mode === 'negative' ? 'btn-success' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('negative')}
          >
            Négatif (-) <br />
            <small>Tout va bien</small>
          </button>
          <button
            type="button"
            className={`btn ${mode === 'positive' ? 'btn-danger' : 'btn-outline'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('positive')}
          >
            Positif (+) <br />
            <small>Traitement requis</small>
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          {/* Common Date Field */}
          <div>
            <label className="label">Date du Résultat / Validation</label>
            <input
              type="date"
              className="input"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* NEGATIVE MODE UI */}
          {mode === 'negative' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
              ✅ <strong>Action :</strong> Ces {count} travailleurs seront marqués
              <strong> Négatifs</strong> et validés <strong>APTE</strong>. La prochaine visite sera
              calculée automatiquement (+6 mois).
            </div>
          )}

          {/* POSITIVE MODE UI */}
          {mode === 'positive' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className="label">Parasite identifié</label>
                <input
                  className="input"
                  placeholder="ex: Kystes d'amibes"
                  value={parasite}
                  onChange={(e) => setParasite(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Traitement prescrit</label>
                <input
                  className="input"
                  placeholder="ex: Metronidazole 500mg"
                  value={treatment}
                  onChange={(e) => setTreatment(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label className="label">Décision</label>
                  <select
                    className="input"
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    <option value="inapte">Inapte Temporaire</option>
                    <option value="apte_partielle">Apte Sous Réserve</option>
                  </select>
                </div>
                <div>
                  <label className="label">Contre-visite (Jours)</label>
                  <input
                    type="number"
                    className="input"
                    value={retestDays}
                    onChange={(e) => setRetestDays(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                ⚠️ <strong>Action :</strong> Ces {count} travailleurs seront marqués
                <strong> Positifs</strong>. Prochaine visite dans {retestDays} jours.
              </div>
            </div>
          )}

          <div
            style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}
          >
            <button type="button" className="btn btn-outline" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              <FaSave /> Appliquer aux {count} dossiers
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
