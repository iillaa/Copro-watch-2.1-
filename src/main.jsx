import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// [TEMPORARY DEBUG] This will pop up a window on your phone if the JS fails
window.onerror = (msg, src, lin, col, err) => {
  alert(`FATAL: ${msg}\nAt: ${src}:${lin}`);
  return false;
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)