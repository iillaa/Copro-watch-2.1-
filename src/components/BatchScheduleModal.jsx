import { useState } from 'react';
import { FaCalendarAlt, FaTimes, FaSave } from 'react-icons/fa';

export default function BatchScheduleModal({ count, onConfirm, onCancel, weaponMode = false }) {
  // Default to today
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // [REMOVED] 'examType' state. Your app only creates empty requests (Stage 1).

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(date); // We only send the date now
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '400px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaCalendarAlt /> {weaponMode ? 'Nouvel Examen' : 'Nouvelle Analyse'} ({count})
          </h3>
          <button onClick={onCancel} className="btn-icon">
            <FaTimes />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
        >
          <div>
            <label className="label">
              {weaponMode ? 'Date de consultation' : 'Date de la demande (Prélèvement)'}
            </label>
            <input
              type="date"
              className="input"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {/* [REMOVED] The Dropdown Menu for "Type de Visite" was deleted here */}

          <div
            style={{
              fontSize: '0.9rem',
              color: '#3b82f6',
              background: '#eff6ff',
              padding: '10px',
              borderRadius: '4px',
              borderLeft: '4px solid #3b82f6',
            }}
          >
            <strong>Note :</strong> Cela créera {count} {weaponMode ? 'examens' : 'analyses'} "EN ATTENTE" (Vides). La date de
            prochaine visite restera inchangée tant que le résultat n'est pas validé.
          </div>

          <div
            style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1rem' }}
          >
            <button type="button" className="btn btn-outline" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              <FaSave /> Créer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
