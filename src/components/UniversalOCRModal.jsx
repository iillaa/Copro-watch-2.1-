import { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import Ocr from '@gutenye/ocr-browser';
import * as ort from 'onnxruntime-web';

// 1. MATCH YOUR VERSION (Change 1.19.0 to whatever 'npm list' showed)
const ORT_VERSION = '1.24.1'; 
// NOTE: For offline support, these WASM files should be served locally from the public folder.
// Using CDN here as a fallback/default for development or online usage.
const CDN_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`;

// 2. FORCE PATHS BEFORE THE LIBRARY LOADS
ort.env.wasm.wasmPaths = CDN_URL;
// This tells the engine to use the main thread to fetch WASM, 
// which avoids the "Worker 404" problem.
ort.env.wasm.proxy = false;
ort.env.wasm.numThreads = 1;
window.ort = ort; 

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
  FaList,
  FaImage,
  FaEye,
  FaLightbulb,
} from 'react-icons/fa';

  // --- SMART ARABIC REVERSAL ---
  // Only reverses characters inside Arabic words. Protects Latin text and numbers.
  const smartRTLFix = (text) => {
    if (!text) return '';
    return text.split(' ').map(word => {
        // If the specific word contains Arabic, reverse it
        if (/[\u0600-\u06FF]/.test(word)) {
            return word.split('').reverse().join('');
        }
        // If it's a number or French word, leave it completely alone
        return word;
    }).join(' ');
  };

export default function UniversalOCRModal({
  mode = 'worker',
  onClose,
  onImportSuccess,
  departments,
}) {
  // ========== STATE ==========
  const [activeTab, setActiveTab] = useState('scan'); // 'scan' | 'results'
  const [image, setImage] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [docLanguage, setDocLanguage] = useState('fra');
  const [debugMode, setDebugMode] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [debugCrops, setDebugCrops] = useState([]);
  const [debugBoxes, setDebugBoxes] = useState([]);
  
  // SAFETY: Prevent state updates after unmount
  const isMounted = useRef(true);
  useEffect(() => {
    return () => { isMounted.current = false; };
  }, []);

  // NEW: Engine State
  const [ocrEngine, setOcrEngine] = useState('tesseract'); // 'tesseract' or 'paddle' or 'hybrid'

  // LOGS: Full Array + Scroll
  const [logs, setLogs] = useState([]);
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev, `[${time}] ${msg}`]);
  };

  // Grid State
  const [vLines, setVLines] = useState([0.25, 0.5, 0.75]);
  const [hLines, setHLines] = useState([]);
  const [colMapping, setColMapping] = useState([
    'national_id',
    'full_name',
    'department_id',
    'job_info',
  ]);
  
  // NEW: Track which engine handles which column in Hybrid Mode
  const [colEngines, setColEngines] = useState([
    'tesseract', // Default for Col 1
    'paddle',    // Default for Col 2
    'paddle',    // Default for Col 3
    'paddle'     // Default for Col 4
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

  // ========== IMAGE LOADING (RESTORED EXACTLY) ==========
  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          if (!img.width || !img.height) {
            alert('Erreur: Image invalide.');
            return;
          }
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          // Cap resolution for Global Scan stability (Tesseract crash prevention)
          if (width > 2500) {
            const scale = 2500 / width;
            width = 2500;
            height = Math.round(height * scale);
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          // Fill white (Fix transparent PNGs returning black/0 words)
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);

          const cleanUrl = canvas.toDataURL('image/jpeg', 0.95);

         setImage(cleanUrl);
          setImgDimensions({ width, height });
          setCandidates([]);
          setHLines([]);
          
          // MEMORY MANAGEMENT: Aggressively dump old base64 images
          setDebugCrops([]); 
          setDebugBoxes([]);
          
          setActiveTab('scan');
          setLogs([]); // Reset logs
          addLog(`[LOAD] Image chargée. Dimensions: ${width}x${height}px`);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // ========== TESSERACT HELPER (RESTORED EXACTLY) ==========
 const getCellImage = (imgElement, rect, paddingY = 15, paddingX = 8, binarize = true, customScale = 4) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const scale = customScale; // Use the parameter, not a hardcoded 4
    
    const targetW = (rect.width + paddingX * 2) * scale;
    const targetH = (rect.height + paddingY * 2) * scale;
    canvas.width = targetW;
    canvas.height = targetH;

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(
      imgElement,
      rect.x, rect.y, rect.width, rect.height,
      paddingX * scale, paddingY * scale, rect.width * scale, rect.height * scale
    );

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    if (binarize) {
      // TESSERACT: Hard Threshold (Pure Black & White)
      const threshold = 175;
      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        let v = gray < threshold ? 0 : 255;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
    }
    // For Paddle (!binarize), do absolutely nothing. Return the raw, natural image.
    
    ctx.putImageData(imageData, 0, 0);
    
    return canvas.toDataURL('image/png'); 
  };

  // ========== VISUAL DEBUGGER (RESTORED) ==========
  const drawDebugGrid = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageRef.current) {
      addLog('[DEBUG ERROR] Impossible de dessiner (Canvas/Image manquant)');
      return;
    }
    const ctx = canvas.getContext('2d');
    canvas.width = imgDimensions.width;
    canvas.height = imgDimensions.height;

    try {
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height);
    } catch (e) {
      return;
    }

    const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);

    // Draw Rows
    ctx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
    ctx.lineWidth = 4;
    for (let r = 0; r < sortedH.length - 1; r++) {
      const y = sortedH[r] * canvas.height;
      const h = (sortedH[r + 1] - sortedH[r]) * canvas.height;
      ctx.strokeRect(0, y, canvas.width, h);
      ctx.fillStyle = 'red';
      ctx.font = 'bold 30px monospace';
      ctx.fillText(`ROW ${r + 1} (Y=${Math.round(y)})`, 20, y + 40);
    }

    // Draw Cols
    ctx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
    vLines.forEach((v, i) => {
      const x = v * canvas.width;
      ctx.strokeRect(x, 0, 2, canvas.height);
      ctx.fillStyle = 'blue';
      ctx.fillText(`C${i + 1}`, x + 5, 60);
    });

    // Draw Debug Boxes (Paddle)
    if (debugBoxes.length > 0) {
       ctx.strokeStyle = '#00ff00';
       ctx.lineWidth = 2;
       debugBoxes.forEach(box => {
          // box.box is [[x,y],...]
          // Draw polygon
          ctx.beginPath();
          ctx.moveTo(box.box[0][0], box.box[0][1]);
          ctx.lineTo(box.box[1][0], box.box[1][1]);
          ctx.lineTo(box.box[2][0], box.box[2][1]);
          ctx.lineTo(box.box[3][0], box.box[3][1]);
          ctx.closePath();
          ctx.stroke();
       });
    }

    addLog('[DEBUG] Grille dessinée dans le cadre jaune.');
  };

  // AUTO-DEBUG: Redraw whenever grid/debug mode changes
  useEffect(() => {
    if (debugMode && image) {
      // Small timeout to ensure image ref is ready/layout stable
      const timer = setTimeout(drawDebugGrid, 50);
      return () => clearTimeout(timer);
    }
  }, [debugMode, image, hLines, vLines, debugBoxes]);

  // ========== MODE 1: TESSERACT PARALLEL (SAFE) ==========
  const runTesseractOCR = async () => {
    if (!image || !imageRef.current) return;
    setIsProcessing(true);
    setLogs([]);
    setDebugCrops([]);
    setCandidates([]);
    setProgress(0);
    setStatusText('Tesseract (Parallel Workers)...');

    let workers = [];
    try {
      // 1. Initialize Worker Pool (2 Workers for Dual-Core Optimization)
      const langs = docLanguage === 'ara' ? 'ara+fra' : 'fra';
      const numWorkers = 2;
      addLog(`[TESSERACT] Initializing ${numWorkers} workers (${langs})...`);
      
      for (let i = 0; i < numWorkers; i++) {
        const w = await Tesseract.createWorker(langs, 1);
        workers.push(w);
      }
      
      const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
      const isRTL = docLanguage === 'ara';
      
      // Initialize Results Array
      const numRows = sortedH.length - 1;
      const numCols = sortedV.length - 1;
      let gridResults = Array(numRows).fill(null).map(() => createEmptyCandidate());
      let cellsProcessed = 0;
      const totalCells = numRows * numCols;

      // 2. Column-based Processing (To minimize parameter switching)
      for (let c = 0; c < numCols; c++) {
        const colIndex = isRTL ? numCols - 1 - c : c;
        const field = colMapping[colIndex];
        
        if (!field || field === 'ignore') {
          cellsProcessed += numRows;
          continue;
        }

        // Configure all workers for this column type
        const params = (field === 'national_id') ? {
           tessedit_pageseg_mode: '7',
           preserve_interword_spaces: '1',
           tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-. '
        } : {
           tessedit_pageseg_mode: '7',
           preserve_interword_spaces: '1',
           tessedit_char_whitelist: '' // Allow Arabic
        };

        await Promise.all(workers.map(w => w.setParameters(params)));

        // Split rows between workers
        const promises = [];
        for (let r = 0; r < numRows; r++) {
          const workerIndex = r % numWorkers;
          
          const task = async () => {
             if (!isMounted.current) return;
             const rawW = (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width;
             const rawH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;
             const safetyMargin = 10;
             const cropParams = {
                x: sortedV[colIndex] * imgDimensions.width + safetyMargin,
                y: sortedH[r] * imgDimensions.height + safetyMargin,
                width: rawW - safetyMargin * 2,
                height: rawH - safetyMargin * 2
             };

             if (cropParams.width < 10 || cropParams.height < 10) return;

             const cellUrl = getCellImage(imageRef.current, cropParams, 5, 0);
             if (debugMode && isMounted.current) {
               setDebugCrops(prev => [...prev, { label: `R${r+1}C${c+1} (${field})`, url: cellUrl }]);
             }

             const { data: { text, confidence } } = await workers[workerIndex].recognize(cellUrl);
             
             let cleanText = text.trim().replace(/^[\s|I_\-.]+|[\s|I_\-.]+$/g, '');
             if (isRTL && cleanText.length < 3 && /^[a-zA-Z\s|]+$/.test(cleanText)) cleanText = '';
             
             if (cleanText && isMounted.current) {
                gridResults[r][field] = cleanText;
                addLog(`[CELL] R${r+1}C${c+1}: ${cleanText} (${confidence}%)`);
             }
             
             cellsProcessed++;
             setProgress(Math.round((cellsProcessed / totalCells) * 100));
          };
          
          promises.push(task());
        }
        await Promise.all(promises);
      }

      // CLEAN CANDIDATES
      gridResults.forEach(c => cleanCandidate(c));

      if (isMounted.current) {
        setCandidates(gridResults.filter(c => c.national_id || c.full_name || c.job_info));

        // DEBUG LOGIC FIX: Do not switch tab if debug mode is active
        if (!debugMode && gridResults.length > 0) {
          setActiveTab('results');
        } else if (debugMode) {
          addLog('[DEBUG] Fin du scan. Résultats non affichés (Mode Debug actif).');
        }
      }

    } catch (e) {
      if (isMounted.current) {
        addLog(`[CRASH] ${e.message}`);
        console.error(e);
      }
    } finally {
      // Terminate all workers
      for (const w of workers) await w.terminate();
      setIsProcessing(false);
    }
  };

  // ========== MODE 2: PADDLE FULL PAGE (CELLULAR MODE RESTORED + IMPROVED) ==========
  const runPaddleOCR = async () => {
    if (!image || !imageRef.current) return;
    setIsProcessing(true);
    setLogs([]);
    setDebugCrops([]);
    setCandidates([]);
    setProgress(0);
    setStatusText('Paddle AI (Cellular Mode)...');
    
    let ocr = null;
    try {
      // 1. Init Engine
      const baseUrl = window.location.origin + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
      const modelsUrl = baseUrl + 'models/';
      ocr = await Ocr.create({
        models: {
          detectionPath: `${modelsUrl}det.onnx`,
          recognitionPath: `${modelsUrl}rec_ara.onnx`,
          dictionaryPath: `${modelsUrl}keys_ara.txt`
        }
      });

      const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
      const isRTL = docLanguage === 'ara';
      const numRows = sortedH.length - 1;
      const numCols = sortedV.length - 1;
      let gridResults = Array(numRows).fill(null).map(() => createEmptyCandidate());
      
      const totalCells = numRows * numCols;
      let cellsProcessed = 0;
      let allDebugBoxes = [];

      // 2. DOUBLE LOOP: Rows then Columns (Ensures text stays in its box)
      for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
          if (!isMounted.current) break; // Check for cancel

          const colIndex = isRTL ? numCols - 1 - c : c;
          const field = colMapping[colIndex];
          
          // FIX: If column is marked 'ignore', skip the AI scan entirely
          if (!field || field === 'ignore') {
            cellsProcessed++;
            continue;
          }

          const rawW = (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width;
          const rawH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;
          
          const rect = {
            x: sortedV[colIndex] * imgDimensions.width,
            y: sortedH[r] * imgDimensions.height,
            width: rawW,
            height: rawH
          };

          // Scale 2 is 50% lighter on the CPU. Padding 5 prevents cross-column bleeding.
          const cellUrl = getCellImage(imageRef.current, rect, 5, 6, false, 2);
          
          if (debugMode && isMounted.current) {
            setDebugCrops(prev => [...prev, { label: `R${r+1}C${c+1} (${field})`, url: cellUrl }]);
          }

          const results = await ocr.detect(cellUrl);
          if (!isMounted.current) break;
          
          // Accumulate debug boxes with coordinate translation
          if (debugMode) {
             results.forEach(box => {
                // Translate box coordinates from Crop Space -> Image Space
                const translatedBox = {
                   box: box.box.map(point => [point[0] + rect.x, point[1] + rect.y]),
                   text: box.text
                };
                allDebugBoxes.push(translatedBox);
             });
          }

          let text = results.map(box => box.text).join(' ').trim();
          
          if (text) {
            // Clean vertical bars usually detected as noise from table borders
            text = text.replace(/[|]/g, '').trim();
            if (isRTL) text = smartRTLFix(text);
            
            gridResults[r][field] = text;
            if (isMounted.current) addLog(`[CELL] R${r+1}C${c+1} (${field}): ${text}`);
          }

          cellsProcessed++;
          if (isMounted.current) setProgress(Math.round((cellsProcessed / totalCells) * 100));
        }
      }

      // CLEAN CANDIDATES
      gridResults.forEach(c => cleanCandidate(c));

      if (isMounted.current) {
        setCandidates(gridResults.filter(c => c.national_id || c.full_name || c.job_info));

        if (debugMode) {
           setDebugBoxes(allDebugBoxes);
           addLog(`[DEBUG] ${allDebugBoxes.length} zones de texte détectées.`);
           // Force redraw
           setTimeout(drawDebugGrid, 100);
        }

        if (!debugMode && gridResults.length > 0) {
          setActiveTab('results');
        } else if (debugMode) {
          addLog('[DEBUG] Scan terminé. Resté sur l\'onglet Scan.');
        }
      }

    } catch (e) {
      if (isMounted.current) addLog(`[CRASH] ${e.message}`);
    } finally {
      if (ocr && ocr.dispose) await ocr.dispose();
      if (isMounted.current) setIsProcessing(false);
    }
  };

  // ========== MODE 3: HYBRID (SMART CELLULAR) ==========
  const runHybridOCR = async () => {
    if (!image || !imageRef.current) return;
    setIsProcessing(true);
    setLogs([]);
    setCandidates([]);
    setProgress(0);
    setStatusText('Hybrid Mode (Smart Cellular)...');

    let tesseractWorkers = [];
    let paddleOcr = null;

    try {
       // 1. Initialize Both Engines
       addLog('[HYBRID] Starting Engines...');
       
       const langs = docLanguage === 'ara' ? 'ara+fra' : 'fra';
       const worker1 = await Tesseract.createWorker(langs, 1);
       const worker2 = await Tesseract.createWorker(langs, 1);
       tesseractWorkers = [worker1, worker2];

       const baseUrl = window.location.origin + window.location.pathname.split('/').slice(0, -1).join('/') + '/';
       const modelsUrl = baseUrl + 'models/';
       paddleOcr = await Ocr.create({
         models: {
             detectionPath: `${modelsUrl}det.onnx`,
             recognitionPath: `${modelsUrl}rec_ara.onnx`,
             dictionaryPath: `${modelsUrl}keys_ara.txt`
         }
       });

       const sortedH = [0, ...hLines, 1].sort((a, b) => a - b);
       const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
       const isRTL = docLanguage === 'ara';
       const numRows = sortedH.length - 1;
       const numCols = sortedV.length - 1;
       let gridResults = Array(numRows).fill(null).map(() => createEmptyCandidate());
       const totalCells = numRows * numCols;
       let cellsProcessed = 0;

       // 2. Iterate by Column to Optimize Engine Usage
       for (let c = 0; c < numCols; c++) {
          if (!isMounted.current) break;
          const colIndex = isRTL ? numCols - 1 - c : c;
          const field = colMapping[colIndex];
          
          if (!field || field === 'ignore') {
             cellsProcessed += numRows;
             continue;
          }

          // DECISION LOGIC: User-Selected Routing
          const enginePreference = colEngines[colIndex] || 'paddle';
          
          if (enginePreference === 'tesseract') {
             addLog(`[HYBRID] Column "${field}" -> Tesseract (User Selected)`);
             const params = {
               tessedit_pageseg_mode: '7',
               preserve_interword_spaces: '1',
               tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz/-. '
             };
             await Promise.all(tesseractWorkers.map(w => w.setParameters(params)));

             const promises = [];
             for (let r = 0; r < numRows; r++) {
                const worker = tesseractWorkers[r % 2];
                const task = async () => {
                   if (!isMounted.current) return;
                   // ... Crop Logic ...
                   const rawW = (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width;
                   const rawH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;
                   // Use tight padding for Tesseract (numbers)
                   const cropParams = { x: sortedV[colIndex] * imgDimensions.width, y: sortedH[r] * imgDimensions.height, width: rawW, height: rawH };
                   const cellUrl = getCellImage(imageRef.current, cropParams, 5, 5); // 5px padding for Tesseract
                   
                   const { data: { text } } = await worker.recognize(cellUrl);
                   if (text.trim() && isMounted.current) gridResults[r][field] = text.trim();
                   cellsProcessed++;
                   if (isMounted.current) setProgress(Math.round((cellsProcessed / totalCells) * 100));
                };
                promises.push(task());
             }
             await Promise.all(promises);

          } else {
             addLog(`[HYBRID] Column "${field}" -> Paddle (Text Cellular)`);
             // Sequential loop for Paddle (Single Threaded WASM)
             for (let r = 0; r < numRows; r++) {
                if (!isMounted.current) break;
                const rawW = (sortedV[colIndex + 1] - sortedV[colIndex]) * imgDimensions.width;
                const rawH = (sortedH[r + 1] - sortedH[r]) * imgDimensions.height;
                const cropParams = { x: sortedV[colIndex] * imgDimensions.width, y: sortedH[r] * imgDimensions.height, width: rawW, height: rawH };
                
                // Scale 2 is 50% lighter on the CPU. Padding 5 prevents cross-column bleeding.
                const cellUrl = getCellImage(imageRef.current, cropParams, 5, 6, false, 2);
                
                const results = await paddleOcr.detect(cellUrl);
                if (!isMounted.current) break;
                let text = results.map(b => b.text).join(' ').trim();
                
                if (text) {
                   text = text.replace(/[|]/g, '').trim();
                   if (isRTL) text = smartRTLFix(text);
                   gridResults[r][field] = text;
                   if (isMounted.current) addLog(`[CELL] ${field}: ${text}`);
                }
                cellsProcessed++;
                if (isMounted.current) setProgress(Math.round((cellsProcessed / totalCells) * 100));
             }
          }
       }
       
       // CLEAN CANDIDATES
       gridResults.forEach(c => cleanCandidate(c));

       if (isMounted.current) {
         setCandidates(gridResults.filter(c => c.national_id || c.full_name));

         // DEBUG LOGIC FIX: Do not switch tab if debug mode is active
         if (!debugMode && gridResults.length > 0) {
           setActiveTab('results');
         } else if (debugMode) {
           addLog('[DEBUG] Fin du scan. Résultats non affichés (Mode Debug actif).');
         }
       }

    } catch (e) {
       if (isMounted.current) addLog(`[CRASH] ${e.message}`);
    } finally {
       for (const w of tesseractWorkers) await w.terminate();
       if (paddleOcr && paddleOcr.dispose) await paddleOcr.dispose();
       if (isMounted.current) setIsProcessing(false);
    }
  };
  // --- MASTER SWITCH ---
  const handleGo = () => {
    if (ocrEngine === 'paddle') {
      runPaddleOCR(); // Now Cellular (Slice-then-Read)
    } else if (ocrEngine === 'hybrid') {
      runHybridOCR();
    } else {
      runTesseractOCR(); // Now Parallel
    }
  };

  // --- HELPERS (RESTORED) ---
  const createEmptyCandidate = () => ({
    id: Math.random(),
    national_id: '',
    full_name: '',
    department_id: '',
    job_info: '',
    isArabic: false,
  });

  const cleanCandidate = (c) => {
    // ID mutation filter completely removed to preserve raw OCR output.
    c.isArabic = /[\u0600-\u06FF]/.test(c.full_name);
    if (c.isArabic) c.original_name = c.full_name;
  };

  const updateCandidate = (id, field, val) => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: val } : c)));
  };
  const removeCandidate = (id) => setCandidates((prev) => prev.filter((c) => c.id !== id));

  const handleBulkImport = async () => {
    if (candidates.length === 0) return;
    const valid = candidates.filter((c) => c.full_name || c.national_id);
    for (const c of valid) {
      const data = {
        full_name: c.full_name || 'Inconnu',
        national_id: c.national_id || '?',
        department_id: c.department_id ? parseInt(c.department_id) : null,
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
            padding: '1rem',
            borderBottom: '1px solid #eee',
          }}
        >
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FaCamera color="var(--primary)" /> Smart Scan (Hybrid Pro)
          </h3>
          <button onClick={onClose} className="btn-close">
            ×
          </button>
        </div>

        {/* TABS (NAVIGATION) */}
        <div style={{ display: 'flex', borderBottom: '1px solid #ddd', background: '#f8fafc' }}>
          <button
            onClick={() => setActiveTab('scan')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'scan' ? 'white' : 'transparent',
              fontWeight: activeTab === 'scan' ? 'bold' : 'normal',
              borderBottom: activeTab === 'scan' ? '3px solid var(--primary)' : 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaImage /> 1. Image & Grille
          </button>
          <button
            onClick={() => setActiveTab('results')}
            disabled={candidates.length === 0}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'results' ? 'white' : 'transparent',
              fontWeight: activeTab === 'results' ? 'bold' : 'normal',
              borderBottom: activeTab === 'results' ? '3px solid var(--primary)' : 'none',
              cursor: candidates.length > 0 ? 'pointer' : 'not-allowed',
              color: candidates.length > 0 ? 'black' : '#ccc',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <FaList /> 2. Résultats{' '}
            {candidates.length > 0 && (
              <span
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  borderRadius: '10px',
                  padding: '2px 6px',
                  fontSize: '0.7rem',
                }}
              >
                {candidates.length}
              </span>
            )}
          </button>
        </div>

        {/* TAB CONTENT: SCANNER */}
        {activeTab === 'scan' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
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
                <FaCamera /> {image ? 'Changer Image' : 'Charger Image'}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: 'none' }}
                />
              </label>

              <select
                className="input"
                style={{ width: 'auto' }}
                value={docLanguage}
                onChange={(e) => setDocLanguage(e.target.value)}
              >
                <option value="fra">🇫🇷 Français</option>
                <option value="ara">🇩🇿 Arabe</option>
              </select>

              {image && (
                <>
                  <div
                    style={{ width: '1px', height: '20px', background: '#ccc', margin: '0 5px' }}
                  ></div>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setVLines([...vLines, 0.5])}
                    style={{ color: '#3b82f6', borderColor: '#3b82f6', fontWeight: 'bold' }}
                  >
                    + Col
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => setHLines([...hLines, 0.5])}
                    style={{ color: '#ef4444', borderColor: '#ef4444', fontWeight: 'bold' }}
                  >
                    + Ligne
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => {
                      setVLines([0.25, 0.5, 0.75]);
                      setHLines([]);
                    }}
                    style={{ color: 'red' }}
                  >
                    Reset
                  </button>

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
                    <FaBug /> Debug
                  </label>

                  {/* NEW: HELP BUTTON */}
                  <button 
                    className="btn btn-sm" 
                    onClick={() => setShowHelp(true)}
                    title="Guide de Scan OCR"
                    style={{ border: '1px solid #0284c7', color: '#0284c7', background: 'white', padding: '6px 8px', minWidth: 'auto' }}
                  >
                    <FaLightbulb />
                  </button>

                  {/* NEW: ENGINE TOGGLE */}
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px' }}>
                    <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: '6px', padding: '2px' }}>
                        <button 
                          onClick={() => setOcrEngine('tesseract')} 
                          style={{ 
                            background: ocrEngine === 'tesseract' ? 'white' : 'transparent', 
                            color: ocrEngine === 'tesseract' ? '#0f172a' : '#64748b', 
                            border: '1px solid transparent', 
                            borderColor: ocrEngine === 'tesseract' ? '#cbd5e1' : 'transparent', 
                            borderRadius: '4px', 
                            padding: '4px 8px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold', 
                            cursor: 'pointer' 
                          }}
                        >
                          Safe
                        </button>
                        <button 
                          onClick={() => setOcrEngine('paddle')} 
                          style={{ 
                            background: ocrEngine === 'paddle' ? 'white' : 'transparent', 
                            color: ocrEngine === 'paddle' ? '#0f172a' : '#64748b', 
                            border: '1px solid transparent', 
                            borderColor: ocrEngine === 'paddle' ? '#cbd5e1' : 'transparent', 
                            borderRadius: '4px', 
                            padding: '4px 8px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold', 
                            cursor: 'pointer' 
                          }}
                        >
                          Turbo
                        </button>
                        <button 
                          onClick={() => setOcrEngine('hybrid')} 
                          style={{ 
                            background: ocrEngine === 'hybrid' ? 'white' : 'transparent', 
                            color: ocrEngine === 'hybrid' ? '#0f172a' : '#64748b', 
                            border: '1px solid transparent', 
                            borderColor: ocrEngine === 'hybrid' ? '#cbd5e1' : 'transparent', 
                            borderRadius: '4px', 
                            padding: '4px 8px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold', 
                            cursor: 'pointer' 
                          }}
                        >
                          Hybrid
                        </button>
                    </div>

                    {!isProcessing && (
                      <button onClick={handleGo} className="btn btn-success btn-sm" style={{ fontWeight: 'bold' }}>
                        <FaMagic /> GO
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>



            {/* CANVAS EDITOR */}
            {image && (
              <div
                style={{
                  position: 'relative',
                  overflowX: 'auto',
                  border: '1px solid #ccc',
                  background: '#333',
                }}
              >
                {/* Debug Canvas (RESTORED VISIBILITY) */}
                <canvas
                  ref={canvasRef}
                  style={{ display: debugMode ? 'block' : 'none', width: '100%', maxWidth: '100%' }}
                />

                {/* Interactive Editor with Scroll Gutter */}
                <div
                  style={{
                    position: 'relative',
                    minWidth: '600px',
                    display: debugMode ? 'none' : 'block',
                  }}
                >
                  {/* SCROLL GUTTER */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      right: 0,
                      width: '50px',
                      height: '100%',
                      zIndex: 60,
                      background: 'rgba(0, 0, 0, 0.1)',
                      borderLeft: '2px solid rgba(0, 0, 0, 0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      touchAction: 'pan-y',
                      pointerEvents: 'auto',
                    }}
                  >
                    <div
                      style={{
                        color: '#666',
                        writingMode: 'vertical-rl',
                        textOrientation: 'mixed',
                        fontSize: '0.7rem',
                        fontWeight: 'bold',
                        letterSpacing: '2px',
                      }}
                    >
                      SCROLL ↕
                    </div>
                  </div>

                  {/* HEADER SELECTORS */}
                  <div
                    style={{
                      display: 'flex',
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: '50px',
                      height: '30px',
                      zIndex: 30,
                    }}
                  >
                    {(() => {
                      const sortedV = [0, ...vLines, 1].sort((a, b) => a - b);
                      return sortedV.slice(0, -1).map((x, i) => (
                        <div
                          key={i}
                          style={{
                            position: 'absolute',
                            left: `${x * 100}%`,
                            width: `${(sortedV[i + 1] - x) * 100}%`,
                            textAlign: 'center',
                          }}
                        >
                          <select
                            className="input"
                            style={{
                              fontSize: '0.7rem',
                              padding: 0,
                              height: '24px',
                              width: '90%',
                              background: 'rgba(255,255,255,0.9)',
                            }}
                            value={colMapping[i] || 'ignore'}
                            onChange={(e) => {
                              const n = [...colMapping];
                              n[i] = e.target.value;
                              setColMapping(n);
                            }}
                          >
                            {colOptions.map((o) => (
                              <option key={o.val} value={o.val}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                          
                          {/* NEW: Explicit Engine Routing for Hybrid Mode */}
                          {ocrEngine === 'hybrid' && (
                            <select
                              className="input"
                              style={{
                                fontSize: '0.6rem',
                                padding: 0,
                                height: '18px',
                                width: '90%',
                                background: '#e2e8f0',
                                marginTop: '2px',
                                border: '1px solid #cbd5e1'
                              }}
                              value={colEngines[i] || 'paddle'}
                              onChange={(e) => {
                                const n = [...colEngines];
                                n[i] = e.target.value;
                                setColEngines(n);
                              }}
                            >
                              <option value="tesseract">Engine: Tess</option>
                              <option value="paddle">Engine: Paddle</option>
                            </select>
                          )}
                        </div>
                      ));
                    })()}
                  </div>

                  {/* STRICT IMAGE WRAPPER (Fixes the coordinate offset drift) */}
                  <div style={{ position: 'relative', marginTop: '30px' }}>
                    
                    {/* MAIN IMAGE */}
                    <img
                      ref={imageRef}
                      src={image}
                      style={{ display: 'block', width: '100%', touchAction: 'pan-y' }}
                      alt="Scan"
                    />

                    {/* VERTICAL HANDLES */}
                    {vLines.map((x, i) => (
                      <div
                        key={`v-${i}`}
                        style={{ position: 'absolute', top: 0, bottom: 0, left: `${x * 100}%`, width: '2px', background: '#3b82f6', zIndex: 40 }}
                      >
                        <div
                          style={{ position: 'absolute', top: '50%', left: '-16px', transform: 'translateY(-50%)', width: '32px', height: '32px', background: '#3b82f6', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', touchAction: 'none' }}
                          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                          onPointerMove={(e) => {
                            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            const rect = e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                            // MATH FIXED: Clean percentage of image width
                            const nx = (e.clientX - rect.left) / rect.width;
                            const nv = [...vLines];
                            nv[i] = Math.max(0, Math.min(1, nx));
                            setVLines(nv.sort((a, b) => a - b));
                          }}
                          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                        ><FaArrowsAltH size={12} /></div>
                      </div>
                    ))}

                    {/* HORIZONTAL HANDLES */}
                    {hLines.map((y, i) => (
                      <div
                        key={`h-${i}`}
                        style={{ position: 'absolute', left: 0, right: 0, top: `${y * 100}%`, height: '2px', background: '#ef4444', zIndex: 40 }}
                      >
                        <div
                          style={{ position: 'absolute', left: '50%', top: '-16px', transform: 'translateX(-50%)', width: '32px', height: '32px', background: '#ef4444', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', touchAction: 'none' }}
                          onPointerDown={(e) => e.currentTarget.setPointerCapture(e.pointerId)}
                          onPointerMove={(e) => {
                            if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
                            const rect = e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                            // MATH FIXED: Clean percentage of image height (No more -30px drift)
                            const ny = (e.clientY - rect.top) / rect.height;
                            const nh = [...hLines];
                            nh[i] = Math.max(0, Math.min(1, ny));
                            setHLines(nh.sort((a, b) => a - b));
                          }}
                          onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
                          onDoubleClick={() => setHLines(hLines.filter((_, idx) => idx !== i))}
                        ><FaArrowsAltV size={12} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Progress */}
            {isProcessing && (
              <div
                style={{
                  marginTop: '1rem',
                  background: '#e0f2fe',
                  padding: '10px',
                  borderRadius: '4px',
                  color: '#0369a1',
                }}
              >
                <div
                  style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}
                >
                  <span>
                    <FaSpinner className="spin" /> {statusText}
                  </span>{' '}
                  <b>{progress}%</b>
                </div>
                <div style={{ height: '6px', background: '#bae6fd', borderRadius: '3px' }}>
                  <div
                    style={{
                      width: `${progress}%`,
                      height: '100%',
                      background: '#0284c7',
                      borderRadius: '3px',
                      transition: 'width 0.2s',
                    }}
                  ></div>
                </div>
              </div>
            )}

            {/* Logs */}
            {logs.length > 0 && (
              <div
                style={{
                  marginTop: '10px',
                  padding: '10px',
                  background: '#1e293b',
                  color: '#94a3b8',
                  fontSize: '0.7rem',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: '5px',
                    borderBottom: '1px solid #334155',
                    paddingBottom: '5px',
                  }}
                >
                  <b>Console OCR</b>
                  <button
                    onClick={() => navigator.clipboard.writeText(logs.join('\n'))}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    <FaClipboardList />
                  </button>
                </div>
                {logs.map((l, i) => (
                  <div key={i} style={{ marginBottom: '2px' }}>
                    {l}
                  </div>
                ))}
              </div>
            )}

            {/* TRACE GALLERY (DEBUG CROPS RESTORED) */}
            {debugCrops.length > 0 && (
              <div style={{ marginTop: '20px', borderTop: '2px solid #ddd', paddingTop: '10px' }}>
                <h4 style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '10px' }}>
                  <FaEye /> Traces des cellules découpées (Debug)
                </h4>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '10px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    padding: '5px',
                    background: '#f1f5f9',
                    borderRadius: '8px',
                  }}
                >
                  {debugCrops.map((crop, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: 'white',
                        padding: '5px',
                        borderRadius: '4px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                      }}
                    >
                      <img
                        src={crop.url}
                        style={{ width: '100%', height: 'auto', border: '1px solid #eee' }}
                        alt="crop"
                      />
                      <div
                        style={{
                          fontSize: '10px',
                          color: '#94a3b8',
                          marginTop: '3px',
                          textAlign: 'center',
                        }}
                      >
                        {crop.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB CONTENT: RESULTS TABLE */}
        {activeTab === 'results' && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            <div className="table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead
                  style={{
                    position: 'sticky',
                    top: 0,
                    background: 'white',
                    zIndex: 10,
                    borderBottom: '2px solid #eee',
                  }}
                >
                  <tr style={{ color: '#64748b' }}>
                    <th style={{ padding: '10px' }}>Matricule</th>
                    <th style={{ padding: '10px' }}>Nom</th>
                    <th style={{ padding: '10px' }}>Service</th>
                    <th style={{ padding: '10px' }}>{mode === 'worker' ? 'Poste' : 'Grade'}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px' }}>
                        <input
                          className="input"
                          value={c.national_id}
                          onChange={(e) => updateCandidate(c.id, 'national_id', e.target.value)}
                          style={{ width: '80px', fontFamily: 'monospace' }}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <input
                          className="input"
                          value={c.full_name}
                          onChange={(e) => updateCandidate(c.id, 'full_name', e.target.value)}
                          style={{ fontWeight: 'bold' }}
                        />
                      </td>
                      <td style={{ padding: '8px' }}>
                        <select
                          className="input"
                          value={c.department_id}
                          onChange={(e) => updateCandidate(c.id, 'department_id', e.target.value)}
                        >
                          <option value="">-</option>
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
                      <td style={{ padding: '8px' }}>
                        <button
                          onClick={() => removeCandidate(c.id)}
                          style={{ color: 'red', background: 'none', border: 'none' }}
                        >
                          <FaTimes />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* FOOTER */}
        {activeTab === 'results' && candidates.length > 0 && (
          <div
            style={{
              padding: '1rem',
              borderTop: '1px solid #eee',
              background: 'white',
              textAlign: 'right',
            }}
          >
            <button
              onClick={handleBulkImport}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              <FaSave /> Sauvegarder {candidates.length} fiches
            </button>
          </div>
        )}
        {/* NEW: HELP OVERLAY MODAL */}
        {showHelp && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
            <div style={{ background: 'white', borderRadius: '8px', padding: '20px', maxWidth: '500px', width: '100%', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
               <h3 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '10px', marginTop: 0 }}><FaLightbulb /> Guide de Scan OCR</h3>
               <ul style={{ paddingLeft: '20px', fontSize: '0.9rem', lineHeight: '1.6', color: '#334155' }}>
                 <li style={{ marginBottom: '10px' }}><b>Règle d'Or (Les Lignes) :</b> Placez les <span style={{ color: '#3b82f6', fontWeight: 'bold' }}>Colonnes (Bleues)</span> et les <span style={{ color: '#ef4444', fontWeight: 'bold' }}>Lignes (Rouges)</span> <u>à l'intérieur</u> des cases. Ne touchez <b>jamais</b> le trait noir du tableau imprimé, sinon l'IA lira le trait comme un "1", un "L" ou un "د".</li>
                 <li style={{ marginBottom: '10px' }}><b>Éclairage :</b> Évitez les ombres projetées par votre téléphone. Utilisez le flash si la pièce est sombre pour éviter les zones noires.</li>
                 <li style={{ marginBottom: '10px' }}><b>Angle :</b> Tenez le téléphone parfaitement parallèle (à plat) au-dessus de la feuille. Ne prenez pas la photo de biais.</li>
                 <li><b>Papier :</b> La feuille doit être parfaitement plate. Les plis courbent le texte et faussent le découpage des cases.</li>
               </ul>
               <button onClick={() => setShowHelp(false)} className="btn btn-primary" style={{ width: '100%', marginTop: '15px', fontWeight: 'bold' }}>J'ai compris</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
