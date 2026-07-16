import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('@/storage/backup', () => ({
  exportFullBackup: vi.fn(async () => {}),
}))

import { exportFullBackup } from '@/storage/backup'

function Bomb(): never {
  throw new Error('boom')
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    // React (and our own componentDidCatch) log to console.error on a caught
    // crash — expected noise for this specific test, not a real test failure.
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
    vi.clearAllMocks()
  })

  it('renders children normally when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>todo bien</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('todo bien')).toBeInTheDocument()
  })

  it('shows the recovery screen instead of crashing when a child throws', () => {
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument()
    expect(screen.getByText('Recargar')).toBeInTheDocument()
    expect(screen.getByText('Descargar respaldo completo')).toBeInTheDocument()
  })

  it('lets the user download a full backup straight from the crash screen', async () => {
    const user = userEvent.setup()
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    )
    await user.click(screen.getByText('Descargar respaldo completo'))
    expect(exportFullBackup).toHaveBeenCalledTimes(1)
  })
})
