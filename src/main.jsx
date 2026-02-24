import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import ErrorBoundary from './components/ErrorBoundary'

// [FIX] Removed the global window.onerror alert. 
// Background worker network errors will no longer freeze the app.

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error("Could not find root element with ID 'root'");

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  )
} catch (e) {
  console.error("RENDER ERROR: ", e);
}
