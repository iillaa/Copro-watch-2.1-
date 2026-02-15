import { useState } from 'react';
import Tesseract from 'tesseract.js';
import { db } from '../services/db';
import {
  FaCamera,
  FaSpinner,
  FaSave,
  FaTimes,
  FaMagic,
  FaLanguage,
  FaGlobeAfrica,
} from 'react-icons/fa';

// --- ALG-FR TRANSLITERATION ENGINE ---
const transliterateArToFr = (text) => {
  if (!text) return '';

  const map = {
    ا: 'A',
    أ: 'A',
    إ: 'E',
    آ: 'A',
    ى: 'A',
    ة: 'A',
    ب: 'B',
    ت: 'T',
    ث: 'T',
    ج: 'DJ',
    ح: 'H',
    خ: 'KH',
    د: 'D',
    ذ: 'D',
    ر: 'R',
    ز: 'Z',
    س: 'S',
    ش: 'CH',
    ص: 'S',
    ض: 'D',
    ط: 'T',
    ظ: 'Z',
    ع: 'A',
    غ: 'GH',
    ف: 'F',
    ق: 'K',
    ك: 'K',
    ل: 'L',
    م: 'M',
    ن: 'N',
    ه: 'H',
    و: 'OU',
    ي: 'Y',
    ' ': ' ',
    '-': '-',
    '.': '.',
  };

  return text
    .split('')
    .map((char) => map[char] || char)
    .join('')
    .toUpperCase()
    .replace(/OUA/g, 'WA') // Fix cases like 'W' usually appearing as OUA
    .replace(/IY/g, 'I'); // Fix ending Y usually being I
};

export default function UniversalOCRModal({
  mode = 'worker',
  onClose,
  onImportSuccess,
  departments,
}) {
  // Mode: 'worker' or 'weapon'
  const [image, setImage] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  // OCR Options
  const [docLanguage, setDocLanguage] = useState('fra'); // 'fra' or 'ara'

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setImage(URL.createObjectURL(e.target.files[0]));
      setCandidates([]);
    }
  };

  const runOCR = async () => {
    if (!image) return;
    setIsProcessing(true);
    setCandidates([]);

    try {
      // Load both if Arabic is selected, to catch numbers/French words mixed in
      const langs = docLanguage === 'ara' ? 'ara+fra' : 'fra';

      const {
        data: { text },
      } = await Tesseract.recognize(image, langs, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(parseInt(m.progress * 100));
          }
          setStatusText(m.status);
        },
      });

      parseTextToCandidates(text);
    } catch (err) {
      console.error(err);
      alert('Erreur OCR: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const parseTextToCandidates = (text) => {
    const lines = text.split('\n');
    const detected = [];

    lines.forEach((line) => {
      const cleanLine = line.trim();
      if (cleanLine.length < 4) return;

      // 1. Try to find Matricule (Digits)
      // Matches: Start with digits, or digits after a pipe/space
      // Regex looks for 2+ digits, then text
      const match = cleanLine.match(/(\d{2,12})[\s\W_]+(.+)/);

      if (match) {
        detected.push({
          id: Date.now() + Math.random(),
          national_id: match[1],
          full_name: match[2].replace(/[|\[\]{};]/g, '').trim(), // Remove OCR noise chars
          department_id: '',
          job_info: '', // Position (Worker) or Grade (Weapon)
          isArabic: /[\u0600-\u06FF]/.test(match[2]), // Flag for auto-translate button
        });
      }
    });

    if (detected.length === 0) {
      alert('Aucune donnée structurée détectée. Assurez-vous que la photo est nette.');
    }
    setCandidates(detected);
  };

  const handleTransliterate = (id, arabicName) => {
    const frenchName = transliterateArToFr(arabicName);
    updateCandidate(id, 'full_name', frenchName);
    updateCandidate(id, 'isArabic', false); // Hide button after use
  };

  const handleBulkImport = async () => {
    if (candidates.length === 0) return;
    const valid = candidates.filter((c) => c.full_name && c.national_id);

    for (const c of valid) {
      if (mode === 'worker') {
        await db.saveWorker({
          full_name: c.full_name,
          national_id: c.national_id,
          department_id: c.department_id ? parseInt(c.department_id) : null,
          position: c.job_info || 'N/A',
          status: 'active',
          archived: false,
          created_at: new Date().toISOString(),
        });
      } else {
        // Weapon Mode
        await db.saveWeaponHolder({
          full_name: c.full_name,
          national_id: c.national_id,
          department_id: c.department_id ? parseInt(c.department_id) : null,
          job_function: c.job_info || 'Agent de sécurité',
          status: 'pending', // Default for new scans
          archived: false,
          next_review_date: '',
        });
      }
    }

    onImportSuccess(valid.length);
    onClose();
  };

  const updateCandidate = (id, field, value) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeCandidate = (id) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        style={{
          maxWidth: '950px',
          width: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
            borderBottom: '1px solid #eee',
            paddingBottom: '1rem',
          }}
        >
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <FaCamera color="var(--primary)" />
              Scan Intelligent ({mode === 'worker' ? 'Travailleurs' : 'Armes'})
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>
              Reconnaissance optique & Translittération Arabe-Français
            </p>
          </div>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        {/* Controls */}
        <div style={{ padding: '0 0.5rem 1rem' }}>
          <div
            style={{
              display: 'flex',
              gap: '1rem',
              alignItems: 'center',
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '8px',
            }}
          >
            {/* Language Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <FaGlobeAfrica />{' '}
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Langue du document :</span>
              <select
                className="input"
                style={{ width: 'auto', padding: '4px 8px' }}
                value={docLanguage}
                onChange={(e) => setDocLanguage(e.target.value)}
              >
                <option value="fra">🇫🇷 Français (Standard)</option>
                <option value="ara">🇩🇿 Arabe (+Français)</option>
              </select>
            </div>

            <div style={{ borderLeft: '1px solid #ddd', height: '20px' }}></div>

            {/* File Input */}
            <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
              <FaCamera /> Prendre Photo
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
              />
            </label>

            {/* Action Button */}
            {image && !isProcessing && (
              <button onClick={runOCR} className="btn btn-success btn-sm">
                <FaMagic /> Extraire le texte
              </button>
            )}
          </div>

          {/* Progress */}
          {isProcessing && (
            <div style={{ marginTop: '1rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '0.8rem',
                  marginBottom: '5px',
                }}
              >
                <span>
                  <FaSpinner className="spin" /> {statusText}
                </span>
                <span>{progress}%</span>
              </div>
              <div
                style={{ width: '100%', background: '#e2e8f0', height: '8px', borderRadius: '4px' }}
              >
                <div
                  style={{
                    width: `${progress}%`,
                    background: 'var(--primary)',
                    height: '100%',
                    borderRadius: '4px',
                    transition: 'width 0.3s',
                  }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* Results Table */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
          {image && !isProcessing && candidates.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <img
                src={image}
                style={{ maxHeight: '200px', borderRadius: '8px', border: '1px solid #ddd' }}
              />
              <p style={{ color: '#999', fontSize: '0.9rem' }}>
                Image chargée. Cliquez sur "Extraire le texte".
              </p>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    background: 'white',
                    zIndex: 10,
                    boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
                  }}
                >
                  <tr style={{ textAlign: 'left', color: '#64748b' }}>
                    <th style={{ padding: '10px' }}>Matricule / ID</th>
                    <th style={{ padding: '10px' }}>Nom (Détecté)</th>
                    <th style={{ padding: '10px' }}>Service</th>
                    <th style={{ padding: '10px' }}>{mode === 'worker' ? 'Poste' : 'Grade'}</th>
                    <th style={{ padding: '10px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px' }}>
                        <input
                          className="input"
                          style={{ fontFamily: 'monospace', fontSize: '0.9rem' }}
                          value={c.national_id}
                          onChange={(e) => updateCandidate(c.id, 'national_id', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <input
                            className="input"
                            style={{ fontWeight: 600 }}
                            value={c.full_name}
                            onChange={(e) => updateCandidate(c.id, 'full_name', e.target.value)}
                          />
                          {/* Transliterate Button */}
                          {c.isArabic && (
                            <button
                              className="btn btn-sm btn-outline"
                              title="Traduire Arabe -> Français"
                              onClick={() => handleTransliterate(c.id, c.full_name)}
                              style={{
                                padding: '4px 8px',
                                borderColor: '#8b5cf6',
                                color: '#8b5cf6',
                              }}
                            >
                              <FaLanguage /> FR
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <select
                          className="input"
                          value={c.department_id}
                          onChange={(e) => updateCandidate(c.id, 'department_id', e.target.value)}
                        >
                          <option value="">-- Service --</option>
                          {departments.map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input
                          className="input"
                          value={c.job_info}
                          onChange={(e) => updateCandidate(c.id, 'job_info', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '8px', textAlign: 'center' }}>
                        <button
                          onClick={() => removeCandidate(c.id)}
                          style={{
                            color: 'var(--danger)',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <FaTimes />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid #eee',
            padding: '1rem',
            textAlign: 'right',
            background: '#f8fafc',
          }}
        >
          {candidates.length > 0 ? (
            <button onClick={handleBulkImport} className="btn btn-primary">
              <FaSave /> Enregistrer {candidates.length} fiches
            </button>
          ) : (
            <button onClick={onClose} className="btn btn-outline">
              Fermer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
