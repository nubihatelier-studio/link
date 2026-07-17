import { beforeEach, describe, expect, it } from 'vitest'
import { hasSeenOnboarding, markOnboardingSeen } from './onboarding'

describe('onboarding', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('has not been seen on a fresh device', () => {
    expect(hasSeenOnboarding()).toBe(false)
  })

  it('stays seen once marked, across calls', () => {
    markOnboardingSeen()
    expect(hasSeenOnboarding()).toBe(true)
    expect(hasSeenOnboarding()).toBe(true)
  })
})
