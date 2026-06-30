import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

// Register SW update listener for PWA refresh prompt
if ('serviceWorker' in navigator) {
  let swWatcher = null
  window.addEventListener('load', () => {
    // VitePWA autoUpdate will handle SW registration
    // Watch for controller changes (new SW activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      // New SW took over — reload to get fresh content
      if (swWatcher) clearTimeout(swWatcher)
      swWatcher = setTimeout(() => {
        window.location.reload()
      }, 1500)
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
