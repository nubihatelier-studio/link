import { APP_VERSION } from '@/version'
import type { Technique } from '@/engine/types'
import { t } from '@/i18n/es'

/** Where the weaver's messages land — her own WhatsApp and mail. */
export const NUBIH_WHATSAPP = '56957783700'
export const NUBIH_EMAIL = 'nubih.atelier@gmail.com'

/** The pattern open when the message is written, if any — enough to picture it, never its name or colors. */
export interface FeedbackContext {
  technique: Technique
  cols: number
  rows: number
}

/**
 * The message the app hands over already written: a greeting, an empty line
 * to write in, and the few technical facts that make a report answerable
 * (version, which browser, what was open). Nothing else travels — no
 * pattern name, no colors, no beads: the app has no way to send anything on
 * its own, and this is a message the weaver reads and sends herself.
 */
export function feedbackMessage(context?: FeedbackContext): string {
  const lines = [t.feedback.greeting, '', '', t.feedback.dataHeading, t.feedback.appLine(APP_VERSION)]
  if (context) {
    lines.push(t.feedback.patternLine(t.technique[context.technique], context.cols, context.rows))
  }
  const agent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (agent) lines.push(t.feedback.deviceLine(agent))
  return lines.join('\n')
}

/** WhatsApp chat with the message already typed. */
export function whatsappUrl(message: string): string {
  return `https://wa.me/${NUBIH_WHATSAPP}?text=${encodeURIComponent(message)}`
}

/** Mail draft with subject and body already written. */
export function mailtoUrl(message: string): string {
  return `mailto:${NUBIH_EMAIL}?subject=${encodeURIComponent(t.feedback.mailSubject)}&body=${encodeURIComponent(message)}`
}
