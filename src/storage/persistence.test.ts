import { beforeEach, describe, expect, it, vi } from 'vitest'
import { requestPersistentStorageOnce } from './persistence'

const FLAG = 'nubih-storage-persist-requested'

describe('requestPersistentStorageOnce', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('calls navigator.storage.persist() the first time', async () => {
    const persist = vi.fn(async () => true)
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })

    await requestPersistentStorageOnce()

    expect(persist).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem(FLAG)).toBe('1')
  })

  it('never asks twice, even across separate calls', async () => {
    const persist = vi.fn(async () => true)
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })

    await requestPersistentStorageOnce()
    await requestPersistentStorageOnce()
    await requestPersistentStorageOnce()

    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does nothing (does not throw) when navigator.storage.persist is unavailable', async () => {
    Object.defineProperty(navigator, 'storage', { value: {}, configurable: true })
    await expect(requestPersistentStorageOnce()).resolves.toBeUndefined()
    expect(localStorage.getItem(FLAG)).toBeNull()
  })

  it('swallows a rejection from persist() instead of throwing', async () => {
    const persist = vi.fn(async () => {
      throw new Error('denied')
    })
    Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
    await expect(requestPersistentStorageOnce()).resolves.toBeUndefined()
  })
})
