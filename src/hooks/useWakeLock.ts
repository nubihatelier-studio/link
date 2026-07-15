import { useEffect, useState } from 'react'
import { KeepAwake } from '@capacitor-community/keep-awake'

export interface WakeLockState {
  /** Whether this platform/browser can keep the screen awake at all. */
  isSupported: boolean
  /** Whether the wake lock is currently held. */
  isActive: boolean
}

/**
 * Keeps the screen on while `enabled` is true — used by Weave Mode so a
 * hands-busy session doesn't keep getting interrupted by the screen
 * locking. Backed by @capacitor-community/keep-awake, which routes to the
 * native iOS/Android API in a Capacitor build (no browser restrictions)
 * and to the web Screen Wake Lock API (`navigator.wakeLock`) otherwise.
 *
 * `navigator.wakeLock` only exists in a secure context (HTTPS or
 * localhost) — on a plain http://<lan-ip> dev server it's simply absent
 * from `navigator`, not an error. `isSupported` reflects that up front so
 * the UI can show "no disponible" instead of silently failing, and every
 * acquire/release call is still wrapped defensively in case a browser
 * reports support but rejects anyway (e.g. low battery on some Android
 * versions).
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const [isSupported, setIsSupported] = useState(false)
  const [isActive, setIsActive] = useState(false)

  useEffect(() => {
    let cancelled = false
    KeepAwake.isSupported()
      .then(({ isSupported }) => {
        if (!cancelled) setIsSupported(isSupported)
      })
      .catch(() => {
        if (!cancelled) setIsSupported(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isSupported || !enabled) {
      setIsActive(false)
      return
    }

    let cancelled = false

    async function acquire() {
      try {
        await KeepAwake.keepAwake()
        if (!cancelled) setIsActive(true)
      } catch {
        if (!cancelled) setIsActive(false)
      }
    }

    // The lock is released by the OS/browser the instant the tab or app
    // goes to background — it does not resume by itself, so coming back
    // to the foreground needs an explicit re-acquire every time.
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquire()
      else if (!cancelled) setIsActive(false)
    }

    acquire()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      KeepAwake.allowSleep().catch(() => {})
    }
  }, [isSupported, enabled])

  return { isSupported, isActive }
}
