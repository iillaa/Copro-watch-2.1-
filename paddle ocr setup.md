# PaddleOCR Setup Guide for Arabic + French Recognition

## 🎯 The Problem

Your error means the ONNX model files don't exist at `/public/models/`. When the browser tries to fetch them, it gets a 404 HTML page instead of binary WASM/ONNX files.

---

## ✅ Solution: Download & Install PaddleOCR Models

### Option 1: Quick Setup (Recommended for Testing)

1. **Create the models folder**:

   ```bash
   mkdir -p public/models
   ```

2. **Download pre-converted ONNX models**:

   Visit these repositories to get ONNX models:

   - https://github.com/muchaste/PaddleOCR-ONNX
   - https://paddleocr.bj.bcebos.com/PP-OCRv3/chinese/ (official)
   - https://github.com/PaddlePaddle/PaddleOCR/blob/release/2.7/doc/doc_en/models_list_en.md

   You need 3 files:

   - **det.onnx** (Detection model) - finds text regions
   - **rec_ara.onnx** (Arabic recognition) - reads Arabic text
   - **keys_ara.txt** (Character dictionary) - Arabic character mappings

3. **Place files in public/models/**:

   ```
   your-project/
     public/
       models/
         det.onnx          ← ~8MB
         rec_ara.onnx      ← ~10MB
         keys_ara.txt      ← ~5KB
   ```

4. **Test accessibility**:
   - Start dev server: `npm run dev`
   - Navigate to: `http://localhost:5173/models/det.onnx`
   - Should download a binary file (NOT show HTML)

---

### Option 2: Manual Model Conversion (Advanced)

If you can't find pre-converted ONNX models:

1. **Download PaddleOCR Python models**:

   ```bash
   pip install paddleocr paddle2onnx onnx
   ```

2. **Convert to ONNX**:

   ```python
   import paddle2onnx

   # Convert detection model
   paddle2onnx.convert(
       model_path='./det_model.pdmodel',
       params_path='./det_model.pdiparams',
       save_file='./det.onnx',
       opset_version=13
   )

   # Convert recognition model (Arabic)
   paddle2onnx.convert(
       model_path='./rec_ara_model.pdmodel',
       params_path='./rec_ara_model.pdiparams',
       save_file='./rec_ara.onnx',
       opset_version=13
   )
   ```

3. **Create dictionary file** (keys_ara.txt):
   ```
   ا
   أ
   إ
   آ
   ب
   ت
   ث
   ج
   ... (all Arabic characters)
   0
   1
   2
   ... (all numbers)
   ```

---

### Option 3: Use CDN Hosting (For Production)

If models are too large for your repo:

1. **Upload to a CDN** (AWS S3, Cloudflare R2, etc.)

2. **Update code to use CDN URLs**:
   ```javascript
   const ocr = await createOCREngine({
     models: {
       det: 'https://your-cdn.com/models/det.onnx',
       rec: 'https://your-cdn.com/models/rec_ara.onnx',
       dic: 'https://your-cdn.com/models/keys_ara.txt',
     },
   });
   ```

---

## 🚀 Alternative: Tesseract-Only Deployment

If setting up PaddleOCR is too complex:

### Remove Paddle UI Completely

```javascript
// In your component, remove this entire block:
<button
  onClick={() => setOcrEngine('paddle')}
  style={{...}}
>
  Paddle AI (Turbo)
</button>

// Simplify handleGo:
const handleGo = () => {
  runTesseractOCR();
};
```

**Benefits**:

- ✅ No external dependencies
- ✅ Works out of the box
- ✅ Smaller bundle size
- ✅ Already proven to work in your code

**Drawbacks**:

- ⚠️ Slower than PaddleOCR (but still fast enough)
- ⚠️ May need more preprocessing for Arabic

---

## 🔍 Verification Checklist

After setup, verify:

- [ ] Files exist: `ls -lh public/models/`
- [ ] Files are binary (not HTML): Check file size > 1MB
- [ ] Files are accessible: Browser can fetch them
- [ ] No CORS errors in console
- [ ] WASM initialization succeeds

---

## 📊 Model Size Comparison

| Model        | Size  | Purpose                 |
| ------------ | ----- | ----------------------- |
| det.onnx     | ~8MB  | Text region detection   |
| rec_fra.onnx | ~10MB | French text recognition |
| rec_ara.onnx | ~12MB | Arabic text recognition |
| keys\_\*.txt | ~5KB  | Character dictionaries  |

**Total**: ~30MB for dual-language support

---

## 🎯 Recommended Path for Your Project

Based on your code review:

**Use Tesseract Only**:

1. Your Tesseract implementation is solid
2. It already handles Arabic + French well
3. The grid system works perfectly
4. No external dependencies needed
5. Simpler deployment

**Only add Paddle if**:

- You need 2x-3x faster processing
- Processing hundreds of images daily
- Users complain about speed

---

## 💡 Quick Win: Optimize Current Tesseract Setup

Instead of adding Paddle, improve what you have:

```javascript
// Optimize Tesseract parameters
if (field === 'national_id') {
  await worker.setParameters({
    tessedit_pageseg_mode: '13', // Raw line (faster)
    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  });
} else if (docLanguage === 'ara') {
  await worker.setParameters({
    tessedit_pageseg_mode: '6', // Single uniform block
    preserve_interword_spaces: '1',
  });
}
```

---

## 🛠️ Debug Commands

```bash
# Check if files exist
ls -lh public/models/

# Check file type
file public/models/det.onnx
# Should show: "data" (binary), NOT "HTML document"

# Test in browser
curl http://localhost:5173/models/det.onnx --head
# Should return 200, Content-Type: application/octet-stream

# Check CORS
curl -H "Origin: http://localhost:5173" http://localhost:5173/models/det.onnx -v
```

---

## ✨ Final Recommendation

fix paddle ocr , keep the dual ocr engine with the switch button
