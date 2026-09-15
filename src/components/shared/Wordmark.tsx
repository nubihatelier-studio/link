import { t } from '@/i18n/es'

/**
 * The Nubih Creator wordmark, in its two drawings: teal script for a light
 * ground and a light script for a dark one. Only the one for the current
 * theme shows (see index.css), so only that one is read aloud. `decorative`
 * leaves it out of the reading entirely, for screens whose title already
 * says what they are.
 */
export function Wordmark({ className = '', decorative = false }: { className?: string; decorative?: boolean }) {
  const alt = decorative ? '' : t.app.name
  return (
    <>
      <img src="/logo-wordmark.png" alt={alt} className={`nb-logo-light w-auto max-w-full ${className}`} />
      <img src="/logo-wordmark-dark.png" alt={alt} className={`nb-logo-dark w-auto max-w-full ${className}`} />
    </>
  )
}
