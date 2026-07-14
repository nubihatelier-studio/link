import { Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { ConfiguratorPage } from '@/pages/ConfiguratorPage'
import { EditorPage } from '@/pages/EditorPage'
import { WeavePage } from '@/pages/WeavePage'
import { PhotoToPatternPage } from '@/pages/PhotoToPatternPage'

function App() {
  return (
    <div className="min-h-screen bg-canvas text-text">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/new" element={<ConfiguratorPage />} />
        <Route path="/new/photo" element={<PhotoToPatternPage />} />
        <Route path="/editor/:id" element={<EditorPage />} />
        <Route path="/editor/:id/weave" element={<WeavePage />} />
      </Routes>
    </div>
  )
}

export default App
