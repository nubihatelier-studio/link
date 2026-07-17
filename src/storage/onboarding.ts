const ONBOARDING_SEEN_KEY = 'nubih-onboarding-seen'

/** True once the first-launch sample pattern + welcome banner have already been shown (this device). */
export function hasSeenOnboarding(): boolean {
  if (typeof localStorage === 'undefined') return true
  return localStorage.getItem(ONBOARDING_SEEN_KEY) === '1'
}

/** Marks onboarding as done — call right after creating the sample pattern, so it never runs twice. */
export function markOnboardingSeen(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(ONBOARDING_SEEN_KEY, '1')
}
