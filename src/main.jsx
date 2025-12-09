import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'       // Correct: Same folder
import App from './App.jsx' // Correct: Same folder

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
