import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

// Chargement à la demande : la fenêtre d'overlay (en partie) ne charge que son propre code,
// sans les pages de l'app ni la bibliothèque de graphiques.
const App = lazy(() => import('./App').then((m) => ({ default: m.App })))
const Overlay = lazy(() => import('./Overlay').then((m) => ({ default: m.Overlay })))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{new URLSearchParams(location.search).has('overlay') ? <Overlay /> : <App />}</Suspense>
  </StrictMode>
)
