import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { useThemeStore } from '@/store/themeStore'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

// Apply the persisted theme before first paint — avoids a flash of the wrong theme.
useThemeStore.getState().setTheme(useThemeStore.getState().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
