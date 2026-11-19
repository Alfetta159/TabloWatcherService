import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installDeviceFetch } from '@/lib/device'

// Before anything fetches - every /api request then says which Tablo it's for.
installDeviceFetch()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
