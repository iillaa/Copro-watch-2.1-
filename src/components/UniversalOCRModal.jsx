import { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { db } from '../services/db';
import {
  FaCamera,
  FaSpinner,
  FaSave,
  FaTimes,
  FaMagic,
  FaGlobeAfrica,
  FaEraser,
  FaPlus,
  FaArrowsAltH,
  FaArrowsAltV,
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
    .replace(/OUA/g, 'WA')
    .replace(/IY/g, 'I');
};

export default function UniversalOCRModal({
  mode = 'worker',
  onClose,
  onImportSuccess,
  departments,
}) {
  // 1. STATE: CORE
  const [image, setImage] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [docLanguage, setDocLanguage] = useState('fra');

  // 2. STATE: THE GRID
  const [vLines, setVLines] = useState([0.2, 0.5, 0.8]);
  const [hLines, setHLines] = useState([]);

  const [colMapping, setColMapping] = useState([
    'national_id',
    'full_name',
    'department_id',
    'job_info',
  ]);
  const [imgDimensions, setImgDimensions] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);

  const colOptions = [
    { val: 'national_id', label: 'Matricule' },
    { val: 'full_name', label: 'Nom & Prénom' },
    { val: 'department_id', label: 'Service' },
    { val: 'job_info', label: mode === 'worker' ? 'Poste' : 'Grade' },
    { val: 'ignore', label: 'Ignorer' },
  ];

  // 3. IMAGE LOADING
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const url = URL.createObjectURL(e.target.files[0]);
      setImage(url);
      setCandidates([]);
      setHLines([]);

      const img = new Image();
      img.onload = () => setImgDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = url;
    }
  };

  // 4. OCR EXECUTION
 // [HYBRID UPDATE] Try Grid (Coords) -> Fallback to Text (Regex)
  const runOCR = async () => {
    if (!image) return;
    setIsProcessing(true);
    setCandidates([]);
    setProgress(0);

    try {
      const langs = docLanguage === 'ara' ? 'ara+fra' : 'fra';

      const { data } = await Tesseract.recognize(image, langs, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(parseInt(m.progress * 100));
          }
          setStatusText(m.status);
        },
        tessedit_pageseg_mode: '11', // Sparse Text Mode
      });

      // 1. CHECK FOR COORDINATES
      // Deep search for any words with bounding boxes
      let hasCoordinates = false;
      if (data.words && data.words.length > 0) hasCoordinates = true;
      else if (data.lines && data.lines.some(l => l.words && l.words.length > 0)) hasCoordinates = true;

      if (hasCoordinates) {
        console.log("✅ Mode Grille activé (Coordonnées trouvées)");
        parseDataToCandidates(data);
      } else {
        // 2. FALLBACK: TEXT MODE
        console.warn("⚠️ Pas de coordonnées. Passage au mode Texte (Regex).");
        if (data.text && data.text.length > 10) {
           parseTextToCandidates(data.text); // <--- We need to add this function below
        } else {
           alert("Aucun texte détecté. Vérifiez l'éclairage et la netteté.");
        }
      }

    } catch (err) {
      console.error(err);
      alert('Erreur OCR: ' + (err.message || "Impossible de lire l'image"));
    } finally {
      setIsProcessing(false);
    }
  };

  // 5. THE LOGIC: GRID PARSER (DEEP SEARCH VERSION)
  const parseDataToCandidates = (data) => {
    // [FIX] Deep Search Strategy: Iterate all levels to find words
    let words = [];

    // Level 1: Direct words
    if (data.words && data.words.length > 0) {
      words = data.words;
    }
    // Level 2: Inside Lines
    else if (data.lines && data.lines.length > 0) {
      words = data.lines.flatMap((l) => l.words || []);
    }
    // Level 3: Inside Paragraphs (Deepest)
    else if (data.paragraphs && data.paragraphs.length > 0) {
      words = data.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words || []));
    }
    // Level 4: Inside Blocks (Rare)
    else if (data.blocks && data.blocks.length > 0) {
      words = data.blocks.flatMap((b) =>
        b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words || []))
      );
    }

    // [DEBUG] Check what we found
    console.log(`OCR Found ${words.length} words`, words);

    if (words.length === 0) {
      // If we have raw text but no coordinates, we can't use the grid
      if (data.text && data.text.trim().length > 5) {
        alert(
          'Le texte a été lu mais sans coordonnées (positions). Essayez de prendre la photo de plus près.'
        );
      } else {
        alert("Aucun texte n'a été détecté. Vérifiez l'éclairage et la netteté.");
      }
      return;
    }

    const detected = [];

    // A. Sort Lines to define Zones
    const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);

    // If user added H-Lines, use them. If not, fallback to using the whole image height as one block
    // (This allows column-only scanning if rows aren't needed)
    let finalHLines = hLines.length > 0 ? hLines : [];
    const sortedH = [0, ...finalHLines, 1].sort((a, b) => a - b);

    // B. Iterate Rows
    for (let r = 0; r < sortedH.length - 1; r++) {
      const yStart = sortedH[r] * imgDimensions.height;
      const yEnd = sortedH[r + 1] * imgDimensions.height;

      // Ignore tiny slices (< 15px)
      if (yEnd - yStart < 15) continue;

      let candidate = {
        id: Date.now() + Math.random(),
        national_id: '',
        full_name: '',
        department_id: '',
        job_info: '',
        original_name: '',
        isArabic: false,
      };
      let hasData = false;

      // C. Iterate Columns
      for (let c = 0; c < sortedV.length - 1; c++) {
        const xStart = sortedV[c] * imgDimensions.width;
        const xEnd = sortedV[c + 1] * imgDimensions.width;
        const fieldType = colMapping[c] || 'ignore';

        if (fieldType === 'ignore') continue;

        // D. Collect words inside this Cell
        const cellWords = words.filter((w) => {
          if (!w || !w.bbox) return false;
          // Calculate Center Point of the word
          const wx = (w.bbox.x0 + w.bbox.x1) / 2;
          const wy = (w.bbox.y0 + w.bbox.y1) / 2;

          // Check if Center Point is inside the Box
          return wx >= xStart && wx < xEnd && wy >= yStart && wy < yEnd;
        });

        // E. Assemble Text
        const cellText = cellWords
          .map((w) => w.text)
          .join(' ')
          .replace(/[|\[\]{};:_*!@#$%^&()]/g, '') // Remove heavy noise
          .trim();

        if (cellText) {
          candidate[fieldType] = cellText.toUpperCase();
          if (fieldType === 'full_name') {
            candidate.original_name = candidate[fieldType];
            candidate.isArabic = /[\u0600-\u06FF]/.test(candidate[fieldType]);
          }
          hasData = true;
        }
      }

      if (hasData) detected.push(candidate);
    }

    setCandidates(detected);
  };

  // 6. HELPER FUNCTIONS
  const handleTransliterate = (id, originalName) => {
    const frenchName = transliterateArToFr(originalName);
    updateCandidate(id, 'full_name', frenchName);
  };

  const handleRevertArabic = (id, originalName) => {
    updateCandidate(id, 'full_name', originalName);
  };

  const updateCandidate = (id, field, value) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
  };

  const removeCandidate = (id) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  const handleBulkImport = async () => {
    if (candidates.length === 0) return;
    const valid = candidates.filter((c) => c.full_name || c.national_id);

    for (const c of valid) {
      if (mode === 'worker') {
        await db.saveWorker({
          full_name: c.full_name || 'Inconnu',
          national_id: c.national_id || '?',
          department_id: c.department_id ? parseInt(c.department_id) : null,
          position: c.job_info || 'N/A',
          status: 'active',
          archived: false,
          created_at: new Date().toISOString(),
        });
      } else {
        await db.saveWeaponHolder({
          full_name: c.full_name || 'Inconnu',
          national_id: c.national_id || '?',
          department_id: c.department_id ? parseInt(c.department_id) : null,
          job_function: c.job_info || 'Agent',
          status: 'pending',
          archived: false,
          next_review_date: '',
        });
      }
    }
    onImportSuccess(valid.length);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        style={{
          maxWidth: '1100px',
          width: '98%',
          maxHeight: '95vh',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* --- HEADER --- */}
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
              Scan Intelligent : Mode Grille
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>
              Ajoutez des lignes avec les boutons, déplacez avec les poignées.
            </p>
          </div>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        {/* --- CONTROLS & EDITOR --- */}
        <div style={{ padding: '0 0.5rem 1rem' }}>
          <div
            style={{
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            {/* Toolbar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.5rem',
                marginBottom: '1rem',
                alignItems: 'center',
              }}
            >
              <label className="btn btn-primary btn-sm" style={{ cursor: 'pointer' }}>
                <FaCamera /> {image ? 'Changer' : 'Photo'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
              </label>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: 'white',
                  padding: '5px 10px',
                  borderRadius: '4px',
                  border: '1px solid #ddd',
                }}
              >
                <FaGlobeAfrica color="#666" />
                <select
                  className="input"
                  style={{
                    width: 'auto',
                    padding: '2px',
                    border: 'none',
                    background: 'transparent',
                    fontSize: '0.8rem',
                  }}
                  value={docLanguage}
                  onChange={(e) => setDocLanguage(e.target.value)}
                >
                  <option value="fra">🇫🇷 Français</option>
                  <option value="ara">🇩🇿 Arabe</option>
                </select>
              </div>

              {image && (
                <>
                  <div
                    style={{ borderLeft: '1px solid #ccc', height: '20px', margin: '0 5px' }}
                  ></div>

                  {/* BUTTON: Add Column (Blue) */}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setVLines([...vLines, 0.5])}
                  >
                    <FaPlus /> Colonne (Bleu)
                  </button>

                  {/* BUTTON: Add Row (Red) */}
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setHLines([...hLines, 0.5])}
                  >
                    <FaPlus /> Ligne (Rouge)
                  </button>

                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setVLines([]);
                      setHLines([]);
                    }}
                    style={{ color: 'red', borderColor: 'red' }}
                  >
                    <FaEraser /> Reset
                  </button>

                  {!isProcessing && (
                    <button
                      onClick={runOCR}
                      className="btn btn-success btn-sm"
                      style={{ marginLeft: 'auto', fontWeight: 'bold' }}
                    >
                      <FaMagic /> GO
                    </button>
                  )}
                </>
              )}
            </div>

            {/* EDITOR CANVAS */}
            {image && (
              <div
                style={{
                  overflowX: 'auto',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  background: '#333',
                }}
              >
                {/* 1. COLUMN HEADERS */}
                <div
                  style={{
                    display: 'flex',
                    width: '100%',
                    minWidth: '800px',
                    background: '#e0f2fe',
                    borderBottom: '1px solid #93c5fd',
                  }}
                >
                  {(() => {
                    const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
                    return sortedV.slice(0, -1).map((x, i) => (
                      <div
                        key={i}
                        style={{
                          width: `${(sortedV[i + 1] - x) * 100}%`,
                          padding: '4px',
                          borderRight: '1px solid #93c5fd',
                          textAlign: 'center',
                        }}
                      >
                        <select
                          className="input"
                          style={{
                            fontSize: '0.75rem',
                            padding: '2px',
                            height: '24px',
                            width: '100%',
                            background: 'white',
                          }}
                          value={colMapping[i] || 'ignore'}
                          onChange={(e) => {
                            const newMap = [...colMapping];
                            newMap[i] = e.target.value;
                            setColMapping(newMap);
                          }}
                        >
                          {colOptions.map((opt) => (
                            <option key={opt.val} value={opt.val}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ));
                  })()}
                </div>

                {/* 2. IMAGE INTERACTIVE AREA */}
                {/* [CHANGED] No onClick on container = No accidental lines */}
                <div style={{ position: 'relative', minWidth: '800px', userSelect: 'none' }}>
                  <img
                    ref={imageRef}
                    src={image}
                    style={{ display: 'block', width: '100%', pointerEvents: 'none' }}
                    alt="Scan"
                  />

                  {/* --- VERTICAL LINES (Columns - Blue) --- */}
                  {vLines.map((x, i) => (
                    <div
                      key={`v-${i}`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        left: `${x * 100}%`,
                        width: '2px',
                        background: '#3b82f6',
                        zIndex: 20,
                      }}
                    >
                      {/* Handle (Bottom) */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation(); // Stop event bubbling
                          const parent = e.currentTarget.parentElement.parentElement;
                          const onMove = (mv) => {
                            const rect = parent.getBoundingClientRect();
                            const newX = (mv.clientX - rect.left) / rect.width;
                            const newV = [...vLines];
                            newV[i] = Math.max(0, Math.min(1, newX));
                            setVLines(newV);
                          };
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                        // Also support Touch events for mobile
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const parent = e.currentTarget.parentElement.parentElement;
                          const onMove = (mv) => {
                            const touch = mv.touches[0];
                            const rect = parent.getBoundingClientRect();
                            const newX = (touch.clientX - rect.left) / rect.width;
                            const newV = [...vLines];
                            newV[i] = Math.max(0, Math.min(1, newX));
                            setVLines(newV);
                          };
                          const onEnd = () => {
                            window.removeEventListener('touchmove', onMove);
                            window.removeEventListener('touchend', onEnd);
                          };
                          window.addEventListener('touchmove', onMove);
                          window.addEventListener('touchend', onEnd);
                        }}
                        style={{
                          position: 'absolute',
                          bottom: '-15px',
                          left: '-10px',
                          width: '20px',
                          height: '20px',
                          background: '#3b82f6',
                          borderRadius: '4px',
                          cursor: 'col-resize',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '10px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                          border: '2px solid white',
                        }}
                      >
                        <FaArrowsAltH />
                      </div>
                    </div>
                  ))}

                  {/* --- HORIZONTAL LINES (Rows - Red) --- */}
                  {hLines.map((y, i) => (
                    <div
                      key={`h-${i}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${y * 100}%`,
                        height: '2px',
                        background: '#ef4444',
                        zIndex: 10,
                      }}
                    >
                      {/* Handle (Right) */}
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const parent = e.currentTarget.parentElement.parentElement;
                          const onMove = (mv) => {
                            const rect = parent.getBoundingClientRect();
                            const newY = (mv.clientY - rect.top) / rect.height;
                            const newH = [...hLines];
                            newH[i] = Math.max(0, Math.min(1, newY));
                            setHLines(newH);
                          };
                          const onUp = () => {
                            window.removeEventListener('mousemove', onMove);
                            window.removeEventListener('mouseup', onUp);
                          };
                          window.addEventListener('mousemove', onMove);
                          window.addEventListener('mouseup', onUp);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const parent = e.currentTarget.parentElement.parentElement;
                          const onMove = (mv) => {
                            const touch = mv.touches[0];
                            const rect = parent.getBoundingClientRect();
                            const newY = (touch.clientY - rect.top) / rect.height;
                            const newH = [...hLines];
                            newH[i] = Math.max(0, Math.min(1, newY));
                            setHLines(newH);
                          };
                          const onEnd = () => {
                            window.removeEventListener('touchmove', onMove);
                            window.removeEventListener('touchend', onEnd);
                          };
                          window.addEventListener('touchmove', onMove);
                          window.addEventListener('touchend', onEnd);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setHLines(hLines.filter((_, idx) => idx !== i));
                        }}
                        style={{
                          position: 'absolute',
                          right: '0',
                          top: '-10px',
                          width: '20px',
                          height: '20px',
                          background: '#ef4444',
                          borderRadius: '4px',
                          cursor: 'row-resize',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          fontSize: '10px',
                          boxShadow: '0 2px 5px rgba(0,0,0,0.3)',
                          border: '2px solid white',
                        }}
                        title="Double-clic pour supprimer"
                      >
                        <FaArrowsAltV />
                      </div>
                    </div>
                  ))}
                </div>

                <div
                  style={{
                    background: '#333',
                    color: '#ccc',
                    padding: '10px',
                    fontSize: '0.7rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span>
                    🟦 <strong>Colonnes</strong> : Utilisez les boutons pour ajouter.
                  </span>
                  <span>
                    🟥 <strong>Lignes</strong> : Utilisez les boutons pour ajouter.
                  </span>
                </div>
              </div>
            )}

            {/* Progress Bar */}
            {isProcessing && (
              <div style={{ marginTop: '1rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.8rem',
                    marginBottom: '4px',
                  }}
                >
                  <span>
                    <FaSpinner className="spin" /> Analyse en cours... {statusText}
                  </span>
                  <span>{progress}%</span>
                </div>
                <div
                  style={{
                    width: '100%',
                    background: '#e2e8f0',
                    height: '8px',
                    borderRadius: '4px',
                  }}
                >
                  <div
                    style={{
                      width: `${progress}%`,
                      background: 'var(--primary)',
                      height: '100%',
                      borderRadius: '4px',
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* --- RESULTS TABLE --- */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
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
                    <th style={{ padding: '10px' }}>Matricule</th>
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
                          style={{ fontFamily: 'monospace', fontSize: '0.9rem', width: '100px' }}
                          value={c.national_id}
                          onChange={(e) => updateCandidate(c.id, 'national_id', e.target.value)}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <input
                            className="input"
                            style={{ fontWeight: 600 }}
                            value={c.full_name}
                            onChange={(e) => updateCandidate(c.id, 'full_name', e.target.value)}
                          />
                          {c.isArabic && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => handleRevertArabic(c.id, c.original_name)}
                                style={{
                                  padding: '0px 4px',
                                  fontSize: '0.65rem',
                                  borderColor: '#10b981',
                                  color: '#10b981',
                                }}
                              >
                                ع
                              </button>
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() => handleTransliterate(c.id, c.original_name)}
                                style={{
                                  padding: '0px 4px',
                                  fontSize: '0.65rem',
                                  borderColor: '#8b5cf6',
                                  color: '#8b5cf6',
                                }}
                              >
                                FR
                              </button>
                            </div>
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

        {/* --- FOOTER --- */}
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
