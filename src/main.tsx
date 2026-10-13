import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { initPwa } from './lib/pwa'

const container = document.getElementById('root')
if (!container) throw new Error('DayFlow could not find the #root element.')

initPwa()

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
