import { renderHook, act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateServiceWorker = vi.fn()
let needRefreshState = false
const setNeedRefresh = vi.fn((v: boolean) => {
  needRefreshState = v
})

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefreshState, setNeedRefresh],
    updateServiceWorker,
  }),
}))

import { useAppUpdate } from './useAppUpdate'

describe('useAppUpdate', () => {
  beforeEach(() => {
    needRefreshState = false
    updateServiceWorker.mockClear()
    setNeedRefresh.mockClear()
  })

  it('forwards needRefresh from the underlying registration', () => {
    needRefreshState = true
    const { result } = renderHook(() => useAppUpdate())
    expect(result.current.needRefresh).toBe(true)
  })

  it('update() activates the waiting worker and reloads (reloadPage=true) — never a silent no-op update', () => {
    const { result } = renderHook(() => useAppUpdate())
    act(() => result.current.update())
    expect(updateServiceWorker).toHaveBeenCalledWith(true)
  })

  it('dismiss() clears needRefresh without touching the service worker', () => {
    const { result } = renderHook(() => useAppUpdate())
    act(() => result.current.dismiss())
    expect(setNeedRefresh).toHaveBeenCalledWith(false)
    expect(updateServiceWorker).not.toHaveBeenCalled()
  })
})
