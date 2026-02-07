import { useState } from 'react';
import {
  FaPrint,
  FaTimes,
  FaFileAlt,
  FaListUl,
  FaUserMd,
  FaClock,
  FaCalendarDay,
} from 'react-icons/fa';

export default function BatchPrintModal({ count, onConfirm, onCancel }) {
  // Par défaut : si plusieurs personnes, liste manager, sinon convocation
  const [docType, setDocType] = useState(count > 1 ? 'list_manager' : 'convocation');

  // Date de création (Signature en bas de page)
  const [creationDate, setCreationDate] = useState(new Date().toISOString().split('T')[0]);

  // [NEW] Date et Heure de Consultation (Uniquement pour Convocation)
  const [consultDate, setConsultDate] = useState(new Date().toISOString().split('T')[0]);
  const [consultTime, setConsultTime] = useState('08:30');

  const handleSubmit = (e) => {
    e.preventDefault();
    // On envoie un objet d'options complet
    onConfirm(docType, creationDate, { consultDate, consultTime });
  };

  const radioStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px',
    border: '1px solid #e2e8f0',
    borderRadius: '6px',
    cursor: 'pointer',
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
          maxWidth: '450px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaPrint /> Impression {count > 1 ? `Groupée (${count})` : 'Individuelle'}
          </h3>
          <button onClick={onCancel} className="btn-icon">
            <FaTimes />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}
        >
          {/* Choix du Document */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
            <label className="label">Type de Document</label>

            {count > 1 && (
              <label style={radioStyle}>
                <input
                  type="radio"
                  name="doctype"
                  value="list_manager"
                  checked={docType === 'list_manager'}
                  onChange={(e) => setDocType(e.target.value)}
                />
                <FaListUl style={{ color: '#4F46E5' }} />
                <span>Liste de convocation (Par Service)</span>
              </label>
            )}

            <label style={radioStyle}>
              <input
                type="radio"
                name="doctype"
                value="convocation"
                checked={docType === 'convocation'}
                onChange={(e) => setDocType(e.target.value)}
              />
              <FaFileAlt style={{ color: '#4F46E5' }} />
              <span>{count > 1 ? 'Convocations Individuelles' : 'Convocation Médicale'}</span>
            </label>

            <label style={radioStyle}>
              <input
                type="radio"
                name="doctype"
                value="copro"
                checked={docType === 'copro'}
                onChange={(e) => setDocType(e.target.value)}
              />
              <FaFileAlt style={{ color: '#059669' }} />
              <span>Demande Coproparasitologie</span>
            </label>

            <label style={radioStyle}>
              <input
                type="radio"
                name="doctype"
                value="aptitude"
                checked={docType === 'aptitude'}
                onChange={(e) => setDocType(e.target.value)}
              />
              <FaUserMd style={{ color: '#4F46E5' }} />
              <span>Certificat d'Aptitude</span>
            </label>
          </div>

          <hr style={{ margin: 0, borderTop: '1px solid #eee' }} />

          {/* [NEW] SECTION CONVOCATION - Date de RDV */}

          {(docType === 'convocation' || docType === 'list_manager') && (
            <div
              style={{
                background: '#f0f9ff',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px dashed #0ea5e9',
              }}
            >
              <h4
                style={{
                  margin: '0 0 10px 0',
                  fontSize: '0.9rem',
                  color: '#0369a1',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <FaCalendarDay /> Détails du Rendez-vous
              </h4>
              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ flex: 1 }}>
                  <label className="label" style={{ fontSize: '0.8rem' }}>
                    Date Prévue
                  </label>
                  <input
                    type="date"
                    className="input"
                    required
                    value={consultDate}
                    onChange={(e) => setConsultDate(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="label" style={{ fontSize: '0.8rem' }}>
                    Heure
                  </label>
                  <div style={{ position: 'relative' }}>
                    <FaClock
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#aaa',
                      }}
                    />
                    <input
                      type="time"
                      className="input"
                      style={{ paddingLeft: '30px' }}
                      required
                      value={consultTime}
                      onChange={(e) => setConsultTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Date de signature (Création) */}
          <div>
            <label className="label">Date affichée en bas du document (Signature)</label>
            <input
              type="date"
              className="input"
              value={creationDate}
              onChange={(e) => setCreationDate(e.target.value)}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onCancel}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              Générer PDF
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
