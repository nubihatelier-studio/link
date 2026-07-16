import { Component, type ReactNode } from 'react'
import { t } from '@/i18n/es'
import { exportFullBackup } from '@/storage/backup'
import { Button } from './Button'
import { InfoScreen } from './InfoScreen'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Catches any render crash anywhere below it (React error boundaries only
 * catch render/lifecycle errors, not async/event-handler ones — those are
 * handled case by case where they happen) and shows a recovery screen
 * instead of a blank page. The one thing that must never be true is "a bug
 * in the app locks someone out of their patterns" — so the recovery screen
 * always offers downloading a full backup, on top of just reloading.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error('Crash de render capturado por ErrorBoundary', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <InfoScreen
          title={t.crash.title}
          message={t.crash.message}
          action={{ label: t.crash.reload, onClick: () => window.location.reload() }}
          secondaryAction={
            <Button variant="secondary" onClick={() => exportFullBackup()}>
              {t.backup.exportAll}
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
