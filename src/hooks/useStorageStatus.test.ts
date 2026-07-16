import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useStorageStatus } from './useStorageStatus'

describe('useStorageStatus', () => {
  afterEach(() => {
    // @ts-expect-error -- test cleanup of a property we override per test
    delete navigator.storage
  })

  it('reports persisted=true and usage/quota when the browser grants persistence', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: {
        persisted: async () => true,
        estimate: async () => ({ usage: 1234, quota: 999999 }),
      },
      configurable: true,
    })

    const { result } = renderHook(() => useStorageStatus())
    await waitFor(() => expect(result.current.supported).toBe(true))
    expect(result.current.persisted).toBe(true)
    expect(result.current.usageBytes).toBe(1234)
    expect(result.current.quotaBytes).toBe(999999)
  })

  it('reports persisted=false when the browser has not granted it', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { persisted: async () => false, estimate: async () => ({}) },
      configurable: true,
    })

    const { result } = renderHook(() => useStorageStatus())
    await waitFor(() => expect(result.current.persisted).toBe(false))
  })

  it('reports unsupported (persisted=null) without throwing when navigator.storage is absent', async () => {
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true })

    const { result } = renderHook(() => useStorageStatus())
    await waitFor(() => expect(result.current.supported).toBe(false))
    expect(result.current.persisted).toBeNull()
  })
})
