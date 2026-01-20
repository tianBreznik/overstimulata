import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Speckled background removed - using plain white background

// Lock screen orientation to portrait (if supported)
if (typeof window !== 'undefined' && window.screen && window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
  // Try to lock orientation to portrait
  window.screen.orientation.lock('portrait').catch((err) => {
    // Ignore errors - orientation lock requires user gesture on some browsers

  });
  
  // Also listen for orientation changes and try to lock again
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (window.screen.orientation && typeof window.screen.orientation.lock === 'function') {
        window.screen.orientation.lock('portrait').catch(() => {
          // Ignore errors - some browsers don't support this or require user gesture
        });
      }
    }, 100);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
