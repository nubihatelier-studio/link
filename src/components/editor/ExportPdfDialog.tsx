import { useState } from 'react'
import { ALL_PDF_SECTIONS, type PdfSections } from '@/lib/pdfExport'
import { Button } from '@/components/shared/Button'
import { t } from '@/i18n/es'

interface ExportPdfDialogProps {
  onCancel: () => void
  onConfirm: (sections: PdfSections) => void
}

const SECTION_ORDER: { key: keyof PdfSections; label: string; hint: string }[] = [
  { key: 'chart', label: t.exportDialog.chart, hint: t.exportDialog.chartHint },
  { key: 'materials', label: t.exportDialog.materials, hint: t.exportDialog.materialsHint },
  { key: 'wordChart', label: t.exportDialog.wordChart, hint: t.exportDialog.wordChartHint },
  { key: 'notes', label: t.exportDialog.notes, hint: t.exportDialog.notesHint },
]

/**
 * "Qué incluir" picker shown before generating the PDF. Everything starts on:
 * a weaver working from a printout needs the word chart, and one who just
 * wants a compact reference sheet can switch it off here — which is the point
 * of asking instead of deciding for them.
 */
export function ExportPdfDialog({ onCancel, onConfirm }: ExportPdfDialogProps) {
  const [sections, setSections] = useState<PdfSections>(ALL_PDF_SECTIONS)
  const nothingSelected = !Object.values(sections).some(Boolean)

  function toggle(key: keyof PdfSections) {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.exportDialog.title}
        className="w-full max-w-md rounded-t-2xl bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:pb-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold">{t.exportDialog.title}</h2>
        <p className="mt-1 text-sm text-text-muted">{t.exportDialog.subtitle}</p>

        <div className="mt-4 flex flex-col gap-2">
          {SECTION_ORDER.map(({ key, label, hint }) => (
            <label
              key={key}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-surface-2"
            >
              <input
                type="checkbox"
                checked={sections[key]}
                onChange={() => toggle(key)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-accent-500"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-text-muted">{hint}</span>
              </span>
            </label>
          ))}
        </div>

        {nothingSelected && <p className="mt-3 text-xs text-red-500">{t.exportDialog.nothingSelected}</p>}

        <div className="mt-5 flex items-center gap-3">
          <Button variant="secondary" fullWidth onClick={onCancel}>
            {t.exportDialog.cancel}
          </Button>
          <Button fullWidth disabled={nothingSelected} onClick={() => onConfirm(sections)}>
            {t.exportDialog.confirm}
          </Button>
        </div>
      </div>
    </div>
  )
}
