import { useLocation, useNavigate } from 'react-router-dom'
import { House, LayoutGrid, Plus } from 'lucide-react'
import { t } from '@/i18n/es'

/**
 * The bar at the bottom of the main screens: "Inicio" (the library) and
 * "Plantillas" as tabs, and "+" to create a pattern. It replaces the
 * full-width "+ Crear nuevo" button the library used to pin to the bottom.
 */
export function MainNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const tabs = [
    { path: '/', label: t.nav.home, Icon: House },
    { path: '/plantillas', label: t.nav.templates, Icon: LayoutGrid },
  ]
  return (
    <nav
      aria-label={t.nav.label}
      className="pointer-events-none fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-canvas via-canvas/90 to-transparent px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-6"
    >
      <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-3 sm:px-4">
        <div className="flex rounded-full border border-border bg-surface p-1 shadow-lg">
          {tabs.map(({ path, label, Icon }) => {
            const current = pathname === path
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                aria-current={current ? 'page' : undefined}
                className={`flex flex-col items-center gap-0.5 rounded-full px-5 py-1.5 text-[11px] font-semibold transition-colors
                  ${current ? 'bg-accent-500/15 text-accent-600' : 'text-text-muted hover:text-text'}`}
              >
                <Icon size={22} />
                {label}
              </button>
            )
          })}
        </div>
        <button
          onClick={() => navigate('/new')}
          aria-label={t.nav.create}
          title={t.nav.create}
          className="ml-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-500 text-accent-ink shadow-lg hover:bg-accent-400"
        >
          <Plus size={26} />
        </button>
      </div>
    </nav>
  )
}
