import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = { supported: true, keepAwakeShouldFail: false }

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    isSupported: vi.fn(async () => ({ isSupported: state.supported })),
    keepAwake: vi.fn(async () => {
      if (state.keepAwakeShouldFail) throw new Error('unavailable')
    }),
    allowSleep: vi.fn(async () => {}),
  },
}))

import { KeepAwake } from '@capacitor-community/keep-awake'
import { useWakeLock } from './useWakeLock'

function setVisibility(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

describe('useWakeLock', () => {
  beforeEach(() => {
    state.supported = true
    state.keepAwakeShouldFail = false
    vi.clearAllMocks()
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('never calls keepAwake while disabled', async () => {
    const { result } = renderHook(() => useWakeLock(false))
    await waitFor(() => expect(result.current.isSupported).toBe(true))
    expect(result.current.isActive).toBe(false)
    expect(KeepAwake.keepAwake).not.toHaveBeenCalled()
  })

  it('acquires the lock when enabled and supported', async () => {
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(result.current.isActive).toBe(true))
    expect(KeepAwake.keepAwake).toHaveBeenCalledTimes(1)
  })

  it('reports unsupported without throwing, and never calls keepAwake', async () => {
    state.supported = false
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(result.current.isSupported).toBe(false))
    expect(result.current.isActive).toBe(false)
    expect(KeepAwake.keepAwake).not.toHaveBeenCalled()
  })

  it('stays inactive (not throwing) if keepAwake rejects despite isSupported=true', async () => {
    state.keepAwakeShouldFail = true
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(KeepAwake.keepAwake).toHaveBeenCalled())
    expect(result.current.isActive).toBe(false)
  })

  it('releases on backgrounding and re-acquires when foregrounded again', async () => {
    const { result } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(result.current.isActive).toBe(true))

    act(() => setVisibility('hidden'))
    expect(result.current.isActive).toBe(false)

    act(() => setVisibility('visible'))
    await waitFor(() => expect(result.current.isActive).toBe(true))
    expect(KeepAwake.keepAwake).toHaveBeenCalledTimes(2)
  })

  it('releases the lock on unmount', async () => {
    const { result, unmount } = renderHook(() => useWakeLock(true))
    await waitFor(() => expect(result.current.isActive).toBe(true))
    unmount()
    await waitFor(() => expect(KeepAwake.allowSleep).toHaveBeenCalled())
  })

  it('releases the lock when disabled after being active', async () => {
    const { result, rerender } = renderHook(({ enabled }) => useWakeLock(enabled), {
      initialProps: { enabled: true },
    })
    await waitFor(() => expect(result.current.isActive).toBe(true))

    rerender({ enabled: false })
    await waitFor(() => expect(result.current.isActive).toBe(false))
    expect(KeepAwake.allowSleep).toHaveBeenCalled()
  })
})
