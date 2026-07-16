const REQUESTED_FLAG = 'nubih-storage-persist-requested'

/**
 * Asks the browser to mark this origin's storage as "persistent" — exempt
 * from the eviction browsers apply under storage pressure to regular
 * ("best-effort") origins. Safe to call on every save: the flag makes the
 * actual `navigator.storage.persist()` call happen exactly once ever (the
 * first real save), since asking repeatedly wouldn't change the answer and
 * the browser may show its own permission UI the first time.
 */
export async function requestPersistentStorageOnce(): Promise<void> {
  if (typeof localStorage === 'undefined' || localStorage.getItem(REQUESTED_FLAG)) return
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return
  localStorage.setItem(REQUESTED_FLAG, '1')
  try {
    await navigator.storage.persist()
  } catch {
    // Best-effort — an unsupported or denied request just means the
    // browser's default eviction rules apply, not a broken app.
  }
}
