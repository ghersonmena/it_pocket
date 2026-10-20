import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { initTheme } from './theme'
import { registerServiceWorker } from './services/deviceNotifications'

// Antes del primer render, para que la app no parpadee en el tema equivocado
initTheme()

// Para las notificaciones del teléfono (public/sw.js)
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
