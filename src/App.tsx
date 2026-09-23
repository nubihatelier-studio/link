import { lazy, Suspense, useEffect } from 'react'
import { Wordmark } from '@/components/shared/Wordmark'
import { Route, Routes } from 'react-router-dom'
import { usePatternsStore } from '@/store/patternsStore'
import { useAppUpdate } from '@/hooks/useAppUpdate'
import { HomePage } from '@/pages/HomePage'
import { ConfiguratorPage } from '@/pages/ConfiguratorPage'
import { EditorPage } from '@/pages/EditorPage'
import { WeavePage } from '@/pages/WeavePage'
import { TrianglePreviewPage } from '@/pages/TrianglePreviewPage'
import { PhotoToPatternPage } from '@/pages/PhotoToPatternPage'
import { NotFoundPage } from '@/pages/NotFoundPage'
import { UpdateToast } from '@/components/shared/UpdateToast'
import { StorageErrorScreen } from '@/components/shared/StorageErrorScreen'

/**
 * Loaded when first opened: it carries every template that ships with the app
 * (`data/nubihTemplates.ts`), a list that keeps growing — no reason to make
 * the editor wait for it on every launch. Still available offline: the PWA
 * precaches every chunk.
 */
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage').then((m) => ({ default: m.TemplatesPage })))

function App() {
  const hydrated = usePatternsStore((s) => s.hydrated)
  const hydrationError = usePatternsStore((s) => s.hydrationError)
  const hydrate = usePatternsStore((s) => s.hydrate)
  const { needRefresh, update } = useAppUpdate()

  useEffect(() => {
    hydrate()
  }, [hydrate])

  if (hydrationError) {
    return <StorageErrorScreen />
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas">
        <div className="flex max-w-[70vw] animate-pulse">
          <Wordmark decorative className="h-16" />
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-dvh bg-canvas text-text">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route
          path="/plantillas"
          element={
            <Suspense fallback={null}>
              <TemplatesPage />
            </Suspense>
          }
        />
        <Route path="/new" element={<ConfiguratorPage />} />
        <Route path="/new/photo" element={<PhotoToPatternPage />} />
        {/* Prueba a la vista, sin link en ninguna parte — ver TrianglePreviewPage. */}
        <Route path="/triangulo" element={<TrianglePreviewPage />} />
        <Route path="/editor/:id" element={<EditorPage />} />
        <Route path="/editor/:id/weave" element={<WeavePage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      {needRefresh && <UpdateToast onUpdate={update} />}
    </main>
  )
}

export default App
