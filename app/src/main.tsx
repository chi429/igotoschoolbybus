import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// 有新版本時，新 SW 一裝好就自動 reload，用家 refresh 即見新 app
registerSW({
  immediate: true,
  onNeedRefresh() {
    window.location.reload()
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
