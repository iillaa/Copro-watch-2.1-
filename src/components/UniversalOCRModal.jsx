import { useState, useRef, useEffect } from 'react';
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
  FaBug,
  FaClipboardList,
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
  // 1. STATE
  const [image, setImage] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [docLanguage, setDocLanguage] = useState('fra');
  const [debugMode, setDebugMode] = useState(false);

  // LOGGING SYSTEM
  const [logs, setLogs] = useState([]);
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    const logLine = `[${time}] ${msg}`;
    console.log(logLine);
    setLogs((prev) => [...prev, logLine]);
  };

  // Grid State
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
  const canvasRef = useRef(null);

  const colOptions = [
    { val: 'national_id', label: 'Matricule' },
    { val: 'full_name', label: 'Nom & Prénom' },
    { val: 'department_id', label: 'Service' },
    { val: 'job_info', label: mode === 'worker' ? 'Poste' : 'Grade' },
    { val: 'ignore', label: 'Ignorer' },
  ];

  // 2. IMAGE LOADING (SANITIZER)
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      addLog(`[LOAD] File selected: ${file.name} (${(file.size / 1024).toFixed(2)} KB)`);
      const reader = new FileReader();

      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Create a canvas to "bake" the rotation/dimensions
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          addLog(`[LOAD] Native Dimensions: ${width}x${height}`);

          // Cap resolution to 2000px width for stability
          if (width > 2000) {
            const scale = 2000 / width;
            width = 2000;
            height = height * scale;
            addLog(`[LOAD] Resizing to: ${width}x${Math.round(height)} for performance`);
          }

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const cleanUrl = canvas.toDataURL('image/jpeg', 0.9);
          addLog(`[LOAD] Image sanitized and ready.`);

          setImage(cleanUrl);
          setImgDimensions({ width, height });
          setCandidates([]);
          setHLines([]);
        };
        img.onerror = () => addLog('[ERROR] Failed to load image object.');
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // 3. DEBUGGER: VISUALIZE GRID
  const drawDebugGrid = () => {
    addLog('[DEBUG] Drawing Visual Grid...');
    const canvas = canvasRef.current;

    if (!canvas || !imageRef.current) {
      addLog('[ERROR] Canvas or Image ref missing. Is the image loaded?');
      return;
    }

    const ctx = canvas.getContext('2d');

    // Match dimensions strictly to internal state
    canvas.width = imgDimensions.width;
    canvas.height = imgDimensions.height;

    // Draw Image
    try {
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      addLog('[ERROR] Error drawing image to debug canvas: ' + e.message);
      return;
    }

    // Draw Rows (Red)
    const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 5;

    for (let r = 0; r < sortedH.length - 1; r++) {
      const y = sortedH[r] * canvas.height;
      const h = (sortedH[r + 1] - sortedH[r]) * canvas.height;
      ctx.strokeRect(0, y, canvas.width, h);

      ctx.fillStyle = 'red';
      ctx.font = 'bold 30px monospace';
      ctx.fillText(`ROW ${r + 1} (y=${Math.round(y)})`, 20, y + 40);
    }

    // Draw Columns (Blue)
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
    vLines.forEach((v, i) => {
      const x = v * canvas.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();

      ctx.fillStyle = 'blue';
      ctx.fillText(`COL ${i + 1} (${Math.round(v * 100)}%)`, x + 10, 80);
    });
    addLog('[DEBUG] Grid drawn. Check the yellow box below.');
  };

  // 4. OCR ENGINE: HEAVY LOGGING
  const runOCR = async () => {
    if (!image) return;
    setLogs([]);
    addLog('🚀 === STARTING OCR PROCESS ===');
    addLog(`[CONFIG] Image Size: ${imgDimensions.width}x${imgDimensions.height}`);

    if (debugMode) {
      drawDebugGrid();
      return;
    }

    setIsProcessing(true);
    setCandidates([]);
    setProgress(0);
    setStatusText('Initialisation...');

    let worker = null;

    try {
      const langs = docLanguage === 'ara' ? 'ara+fra' : 'fra';
      addLog(`[TESSERACT] Initializing Worker for languages: ${langs}`);

      worker = await Tesseract.createWorker(langs);
      addLog('[TESSERACT] Worker Ready.');

      const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
      let detected = [];

      addLog(
        `[GRID] Config: ${sortedH.length - 1} Rows defined, ${sortedV.length - 1} Columns defined.`
      );
      addLog(`[GRID] Columns (X%): ${sortedV.map((v) => (v * 100).toFixed(1) + '%').join(', ')}`);

      // STRATEGY: Native Rectangle Slicing
      if (hLines.length > 0) {
        const rowCount = sortedH.length - 1;

        for (let r = 0; r < rowCount; r++) {
          const yStart = Math.floor(sortedH[r] * imgDimensions.height);
          const height = Math.floor((sortedH[r + 1] - sortedH[r]) * imgDimensions.height);

          addLog(`\n--- ROW ${r + 1} ANALYSIS ---`);
          addLog(`[SLICE] Y-Start: ${yStart}px, Height: ${height}px`);

          if (height < 20) {
            addLog('[SKIP] Row too short (<20px). Likely noise.');
            continue;
          }

          const pct = Math.round(((r + 1) / rowCount) * 100);
          setProgress(pct);
          setStatusText(`Lecture ligne ${r + 1}/${rowCount}...`);

          // USE NATIVE TESSERACT RECTANGLE
          const rect = {
            top: yStart,
            left: 0,
            width: imgDimensions.width,
            height: height,
          };

          const { data } = await worker.recognize(image, {
            rectangle: rect,
            tessedit_pageseg_mode: '6', // Block mode
          });

          // SAFETY CHECK
          const words = data.words || [];
          addLog(`[OCR] Found ${words.length} words in this strip.`);

          if (words.length === 0) {
            addLog(`[OCR WARNING] Empty strip? Raw text: "${data.text.trim()}"`);
          } else {
            const preview = data.text.replace(/\n/g, ' ').substring(0, 60);
            addLog(`[OCR PREVIEW] "${preview}..."`);
          }

          // MAP WORDS TO COLUMNS
          let candidate = createEmptyCandidate();
          let hasData = false;

          words.forEach((w) => {
            if (w.confidence < 40) {
              // addLog(`[FILTER] Ignored low conf word: "${w.text}" (${w.confidence}%)`);
              return;
            }

            // Calculate relative position within the STRIP
            // NOTE: bbox is relative to the RECTANGLE, not the whole image in some versions,
            // but usually relative to the input image if using 'rectangle'.
            // Let's debug coordinates.
            const xCenter = (w.bbox.x0 + w.bbox.x1) / 2;
            const xPct = xCenter / imgDimensions.width;

            // addLog(`[MAP] Word "${w.text}" center X=${Math.round(xCenter)}px (${(xPct*100).toFixed(1)}%)`);

            let matched = false;
            for (let c = 0; c < sortedV.length - 1; c++) {
              const startPct = sortedV[c];
              const endPct = sortedV[c + 1];

              if (xPct >= startPct && xPct < endPct) {
                const fieldType = colMapping[c] || 'ignore';
                if (fieldType !== 'ignore') {
                  const cleanWord = w.text.replace(/[|\[\]{};:_*!@#$%^&()]/g, '').trim();
                  if (cleanWord) {
                    candidate[fieldType] =
                      (candidate[fieldType] ? candidate[fieldType] + ' ' : '') +
                      cleanWord.toUpperCase();
                    hasData = true;
                    matched = true;
                  }
                }
                break;
              }
            }
            // if(!matched) addLog(`[UNMATCHED] "${w.text}" at ${(xPct*100).toFixed(1)}% (Outside defined cols?)`);
          });

          if (hasData) {
            if (candidate.full_name) {
              candidate.original_name = candidate.full_name;
              candidate.isArabic = /[\u0600-\u06FF]/.test(candidate.full_name);
            }
            addLog(`[SUCCESS] Extracted: ${JSON.stringify(candidate)}`);
            detected.push(candidate);
          } else {
            addLog('[FAIL] Row processed but map yielded no valid data.');
          }
        }
      }
      // FALLBACK: Full Page
      else {
        addLog('\n[FALLBACK] No Red Lines. Switching to Full Page Mode (PSM 3).');
        setStatusText('Lecture globale (Auto)...');
        await worker.setParameters({ tessedit_pageseg_mode: '3' });
        const { data } = await worker.recognize(image);
        addLog(`[FALLBACK] Full page OCR complete. Text length: ${data.text.length}`);

        detected = parseTextToCandidatesLogic(data.text);
        addLog(`[FALLBACK] Regex Parser found ${detected.length} candidates.`);
      }

      if (detected.length === 0) {
        addLog('\n[CRITICAL] Final Result is EMPTY.');
        alert(
          'Aucune donnée trouvée. Vérifiez les logs pour voir si les colonnes (Bleu) sont bien alignées avec le texte.'
        );
      } else {
        addLog(`\n🏁 FINISHED. Found ${detected.length} candidates.`);
      }

      setCandidates(detected);
    } catch (err) {
      console.error(err);
      addLog(`[EXCEPTION] ${err.message}`);
      alert('Erreur: ' + err.message);
    } finally {
      if (worker) await worker.terminate();
      setIsProcessing(false);
      setStatusText('');
    }
  };

  // LOGIC HELPERS
  const parseTextToCandidatesLogic = (text) => {
    const lines = text.split('\n');
    const detected = [];
    lines.forEach((line) => {
      const cleanLine = line.replace(/[|\[\]{};:.,_*!@#$%^&()]/g, ' ').trim();
      if (cleanLine.length < 3) return;
      const tokens = cleanLine.split(/\s+/);
      let matricule = '';
      let nameParts = [];
      tokens.forEach((token) => {
        if (/^\d{2,15}$/.test(token) && !matricule) matricule = token;
        else if (/[a-zA-ZÀ-ÿ\u0600-\u06FF]{2,}/.test(token)) {
          const upper = token.toUpperCase();
          if (!['MAT', 'MATRICULE', 'NOM', 'PRENOM', 'SERVICE', 'GRADE'].includes(upper))
            nameParts.push(token);
        }
      });
      if (nameParts.length > 0) {
        const fullName = nameParts.join(' ').replace(/['"]/g, '');
        detected.push({
          id: Date.now() + Math.random(),
          national_id: matricule || '?',
          full_name: fullName.toUpperCase(),
          original_name: fullName.toUpperCase(),
          department_id: '',
          job_info: '',
          isArabic: /[\u0600-\u06FF]/.test(fullName),
        });
      }
    });
    return detected;
  };

  const createEmptyCandidate = () => ({
    id: Date.now() + Math.random(),
    national_id: '',
    full_name: '',
    department_id: '',
    job_info: '',
    original_name: '',
    isArabic: false,
  });

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
      const data = {
        full_name: c.full_name || 'Inconnu',
        national_id: c.national_id || '?',
        department_id: c.department_id ? parseInt(c.department_id) : null,
        archived: false,
        status: mode === 'worker' ? 'active' : 'pending',
        created_at: new Date().toISOString(),
      };
      if (mode === 'worker') {
        data.position = c.job_info || 'N/A';
        await db.saveWorker(data);
      } else {
        data.job_function = c.job_info || 'Agent';
        await db.saveWeaponHolder(data);
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
        {/* HEADER */}
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
              <FaCamera color="var(--primary)" /> Scan Intelligent (Debug V2)
            </h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#666' }}>
              Tracez les lignes. Consultez les logs en bas si ça échoue.
            </p>
          </div>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        {/* CONTROLS */}
        <div style={{ padding: '0 0.5rem 1rem' }}>
          <div
            style={{
              background: '#f8fafc',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
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
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setVLines([...vLines, 0.5])}
                  >
                    {' '}
                    <FaPlus /> Col (Bleu){' '}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setHLines([...hLines, 0.5])}
                  >
                    {' '}
                    <FaPlus /> Ligne (Rouge){' '}
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setVLines([]);
                      setHLines([]);
                    }}
                    style={{ color: 'red', borderColor: 'red' }}
                  >
                    {' '}
                    <FaEraser /> Reset{' '}
                  </button>

                  {/* DEBUG TOGGLE */}
                  <label
                    className="btn btn-sm"
                    style={{
                      border: '1px solid #f59e0b',
                      color: '#f59e0b',
                      background: debugMode ? '#fef3c7' : 'white',
                      cursor: 'pointer',
                      display: 'flex',
                      gap: '5px',
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={debugMode}
                      onChange={(e) => setDebugMode(e.target.checked)}
                      style={{ display: 'none' }}
                    />
                    <FaBug /> Debug {debugMode ? 'ON' : 'OFF'}
                  </label>

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
                  position: 'relative',
                }}
              >
                {/* HIDDEN CANVAS FOR DEBUGGING */}
                <canvas
                  ref={canvasRef}
                  style={{
                    display: debugMode ? 'block' : 'none',
                    width: '100%',
                    maxWidth: '800px',
                    border: '2px solid yellow',
                    margin: '10px auto',
                  }}
                />

                {/* NORMAL EDITOR */}
                <div
                  style={{
                    position: 'relative',
                    minWidth: '800px',
                    userSelect: 'none',
                    display: debugMode ? 'none' : 'block',
                  }}
                >
                  {/* COLUMN HEADERS */}
                  <div
                    style={{
                      display: 'flex',
                      width: '100%',
                      background: '#e0f2fe',
                      borderBottom: '1px solid #93c5fd',
                      position: 'absolute',
                      top: '-30px',
                      left: 0,
                      right: 0,
                      height: '30px',
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

                  <img
                    ref={imageRef}
                    src={image}
                    style={{
                      display: 'block',
                      width: '100%',
                      pointerEvents: 'none',
                      marginTop: '30px',
                    }}
                    alt="Scan"
                  />

                  {/* VERTICAL LINES (Columns - Blue) */}
                  {vLines.map((x, i) => (
                    <div
                      key={`v-${i}`}
                      style={{
                        position: 'absolute',
                        top: 30,
                        bottom: 0,
                        left: `${x * 100}%`,
                        width: '2px',
                        background: '#3b82f6',
                        zIndex: 20,
                      }}
                    >
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const p = e.currentTarget.parentElement.parentElement;
                          const move = (m) => {
                            const rect = p.getBoundingClientRect();
                            const nx = (m.clientX - rect.left) / rect.width;
                            const nv = [...vLines];
                            nv[i] = Math.max(0, Math.min(1, nx));
                            setVLines(nv);
                          };
                          const up = () => {
                            window.removeEventListener('mousemove', move);
                            window.removeEventListener('mouseup', up);
                          };
                          window.addEventListener('mousemove', move);
                          window.addEventListener('mouseup', up);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const p = e.currentTarget.parentElement.parentElement;
                          const move = (m) => {
                            const rect = p.getBoundingClientRect();
                            const nx = (m.touches[0].clientX - rect.left) / rect.width;
                            const nv = [...vLines];
                            nv[i] = Math.max(0, Math.min(1, nx));
                            setVLines(nv);
                          };
                          const end = () => {
                            window.removeEventListener('touchmove', move);
                            window.removeEventListener('touchend', end);
                          };
                          window.addEventListener('touchmove', move);
                          window.addEventListener('touchend', end);
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
                          border: '2px solid white',
                        }}
                      >
                        <FaArrowsAltH size={12} />
                      </div>
                    </div>
                  ))}

                  {/* HORIZONTAL LINES (Rows - Red) */}
                  {hLines.map((y, i) => (
                    <div
                      key={`h-${i}`}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `calc(${y * 100}% + 30px)`,
                        height: '2px',
                        background: '#ef4444',
                        zIndex: 10,
                      }}
                    >
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const p = e.currentTarget.parentElement.parentElement;
                          const move = (m) => {
                            const rect = p.getBoundingClientRect();
                            const imgHeight = rect.height - 30;
                            const ny = (m.clientY - rect.top - 30) / imgHeight;
                            const nh = [...hLines];
                            nh[i] = Math.max(0, Math.min(1, ny));
                            setHLines(nh);
                          };
                          const up = () => {
                            window.removeEventListener('mousemove', move);
                            window.removeEventListener('mouseup', up);
                          };
                          window.addEventListener('mousemove', move);
                          window.addEventListener('mouseup', up);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          const p = e.currentTarget.parentElement.parentElement;
                          const move = (m) => {
                            const rect = p.getBoundingClientRect();
                            const imgHeight = rect.height - 30;
                            const ny = (m.touches[0].clientY - rect.top - 30) / imgHeight;
                            const nh = [...hLines];
                            nh[i] = Math.max(0, Math.min(1, ny));
                            setHLines(nh);
                          };
                          const end = () => {
                            window.removeEventListener('touchmove', move);
                            window.removeEventListener('touchend', end);
                          };
                          window.addEventListener('touchmove', move);
                          window.addEventListener('touchend', end);
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
                          border: '2px solid white',
                        }}
                      >
                        <FaArrowsAltV size={12} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
                    <FaSpinner className="spin" /> {statusText}
                  </span>{' '}
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
                      transition: 'width 0.3s',
                    }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* LOGS PANEL */}
        {logs.length > 0 && (
          <div
            style={{
              border: '1px solid #ddd',
              background: '#2d3748',
              color: '#a0aec0',
              padding: '10px',
              margin: '0 0.5rem',
              maxHeight: '150px',
              overflowY: 'auto',
              borderRadius: '4px',
              fontFamily: 'monospace',
              fontSize: '0.7rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '5px',
              }}
            >
              <strong>Logs du système OCR:</strong>
              <button
                onClick={() => navigator.clipboard.writeText(logs.join('\n'))}
                className="btn btn-xs btn-outline"
                style={{ color: 'white', borderColor: 'white' }}
              >
                <FaClipboardList /> Copier logs
              </button>
            </div>
            {logs.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}

        {/* RESULTS TABLE */}
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

        {/* FOOTER */}
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
