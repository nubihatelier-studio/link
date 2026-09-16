import { MessageCircle, Mail } from 'lucide-react'
import { feedbackMessage, mailtoUrl, whatsappUrl, type FeedbackContext } from '@/lib/feedback'
import { t } from '@/i18n/es'

/**
 * "Contar un problema o una idea", inside the "⋯" menus: the one way back
 * from a weaver trying the app to the person who makes it. The app keeps no
 * accounts and no analytics, so without this nobody who gets stuck is ever
 * heard from. Plain links (not buttons): a `mailto:`/WhatsApp link is what
 * both the browser and the installed app know how to hand to the right app.
 */
export function FeedbackMenuItems({ context, onDone }: { context?: FeedbackContext; onDone?: () => void }) {
  const message = feedbackMessage(context)
  const style =
    'flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-text hover:bg-surface-2'
  return (
    <>
      <a href={whatsappUrl(message)} target="_blank" rel="noopener noreferrer" onClick={onDone} className={style}>
        <MessageCircle size={16} className="shrink-0 text-text-muted" />
        {t.feedback.whatsapp}
      </a>
      <a href={mailtoUrl(message)} target="_blank" rel="noopener noreferrer" onClick={onDone} className={style}>
        <Mail size={16} className="shrink-0 text-text-muted" />
        {t.feedback.email}
      </a>
      <p className="px-3 pb-1 pt-1 text-[11px] text-text-muted">{t.feedback.hint}</p>
    </>
  )
}
