// Background Worker
self.onmessage = async (e) => {
  const { data, password } = e.data;
  try {
    // 1. Heavy JSON Stringify
    const json = JSON.stringify(data);

    // 2. Encryption (Optional, if password provided)
    if (password) {
      // Import your crypto logic here or pass simpler data
      // For now, let's assume we just stringify to save the UI thread
    }

    self.postMessage({ success: true, json });
  } catch (err) {
    self.postMessage({ success: false, error: err.message });
  }
};
