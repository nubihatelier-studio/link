import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { APP_URL, APP_URL_SHORT } from '@/lib/appUrl'
import { t } from '@/i18n/es'

/**
 * "Compartir la app": the link, in one tap, plus how to keep it as an app on
 * a phone — iPhone never offers that on its own, so someone who isn't told
 * about "Agregar a inicio" ends up with a browser tab she loses. Everything
 * here is the same address anyone can open; nothing about the weaver's own
 * patterns is shared (they never leave her device).
 */
export function ShareAppDialog({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(timer)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(APP_URL)
      setCopied(true)
    } catch {
      // Sin permiso de portapapeles el link igual está a la vista para copiarlo a mano.
      setCopied(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-app-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[85vh] md:max-w-md md:rounded-2xl md:pb-0"
      >
        <div className="shrink-0 px-4 pb-3 pt-4">
          <h2 id="share-app-title" className="text-base font-semibold">
            {t.share.title}
          </h2>
          <p className="text-xs text-text-muted">{t.share.intro}</p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
          <p className="select-all break-all rounded-2xl bg-surface-2 px-4 py-3 text-center text-sm font-semibold">
            {APP_URL_SHORT}
          </p>

          <div className="flex gap-2">
            <button
              onClick={copy}
              className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-accent-500 text-sm font-semibold text-accent-ink"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t.share.copied : t.share.copy}
            </button>
            {canShare && (
              <button
                onClick={() => navigator.share({ title: t.app.name, url: APP_URL }).catch(() => {})}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-surface-2 text-sm font-semibold"
              >
                <Share2 size={16} />
                {t.share.send}
              </button>
            )}
          </div>

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {t.share.installTitle}
            </h3>
            <div className="flex flex-col gap-3">
              <Steps title={t.share.iosTitle} steps={t.share.iosSteps} />
              <Steps title={t.share.androidTitle} steps={t.share.androidSteps} />
            </div>
          </section>

          <p className="text-xs text-text-muted">{t.share.dataNote}</p>
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3">
          <button onClick={onClose} className="h-11 w-full rounded-full bg-surface-2 text-sm font-semibold">
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  )
}

function Steps({ title, steps }: { title: string; steps: readonly string[] }) {
  return (
    <div className="rounded-2xl border border-border p-3">
      <p className="mb-1.5 text-sm font-semibold">{title}</p>
      <ol className="flex list-decimal flex-col gap-1 pl-4 text-xs text-text-muted">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  )
}
