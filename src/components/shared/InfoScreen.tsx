import type { ReactNode } from 'react'
import { Button } from './Button'

interface InfoScreenProps {
  title: string
  message?: string
  action: { label: string; onClick: () => void }
  secondaryAction?: ReactNode
}

/**
 * Full-screen "nothing to show here, here's what to do" state — used for
 * every dead-end in the app that isn't a normal empty list: storage failed
 * to open, a route matches nothing, a pattern id isn't on this device.
 * Same shell every time so these situations read as "the app told me
 * something", not "the app broke".
 */
export function InfoScreen({ title, message, action, secondaryAction }: InfoScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-canvas px-6 text-center">
      <img src="/logo.png" alt="" className="h-12 w-12 rounded-full opacity-60" />
      <h1 className="text-lg font-bold text-text">{title}</h1>
      {message && <p className="max-w-sm text-sm text-text-muted">{message}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={action.onClick}>{action.label}</Button>
        {secondaryAction}
      </div>
    </div>
  )
}
