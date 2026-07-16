import { beforeEach, describe, expect, it } from 'vitest'
import { dismissBackupReminder, getLastBackupAt, recordBackupNow, shouldShowBackupReminder } from './backupReminder'

const DAY = 24 * 60 * 60 * 1000

describe('backupReminder', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('never shows with fewer than 3 patterns, even if never backed up', () => {
    expect(shouldShowBackupReminder(0)).toBe(false)
    expect(shouldShowBackupReminder(2)).toBe(false)
  })

  it('shows once there are 3+ patterns and no backup has ever been made', () => {
    expect(shouldShowBackupReminder(3)).toBe(true)
  })

  it('records and reads back the last backup timestamp', () => {
    expect(getLastBackupAt()).toBeNull()
    recordBackupNow()
    expect(getLastBackupAt()).toBeCloseTo(Date.now(), -2)
  })

  it('stays hidden right after a fresh backup', () => {
    recordBackupNow()
    expect(shouldShowBackupReminder(5)).toBe(false)
  })

  it('comes back once the last backup is more than 30 days old', () => {
    recordBackupNow()
    const in31Days = Date.now() + 31 * DAY
    expect(shouldShowBackupReminder(5, in31Days)).toBe(true)
  })

  it('stays hidden for a week after being dismissed', () => {
    dismissBackupReminder()
    expect(shouldShowBackupReminder(5)).toBe(false)
    expect(shouldShowBackupReminder(5, Date.now() + 3 * DAY)).toBe(false)
  })

  it('comes back a week after being dismissed if still un-backed-up', () => {
    dismissBackupReminder()
    expect(shouldShowBackupReminder(5, Date.now() + 8 * DAY)).toBe(true)
  })
})
