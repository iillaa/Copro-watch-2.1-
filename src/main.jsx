import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// [DEBUG MODE] This will pop up a console on your phone if you toggle dev mode in settings
if (localStorage.getItem('copro_dev_mode') === 'true') {
  import('eruda').then(eruda => eruda.default.init());
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)