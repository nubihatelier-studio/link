import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportPdfDialog } from './ExportPdfDialog'
import { t } from '@/i18n/es'

function checkbox(label: string) {
  return screen.getByRole('checkbox', { name: new RegExp(label) })
}

describe('ExportPdfDialog — qué viene marcado por defecto', () => {
  it('la "Secuencia de tejido" nace desmarcada; gráfico, materiales y notas marcados', async () => {
    render(<ExportPdfDialog onCancel={vi.fn()} onConfirm={vi.fn()} />)

    expect(checkbox(t.exportDialog.chart)).toBeChecked()
    expect(checkbox(t.exportDialog.materials)).toBeChecked()
    expect(checkbox(t.exportDialog.notes)).toBeChecked()
    // El PDF por defecto es una sola hoja de gráfico + materiales; la
    // secuencia mostacilla-por-mostacilla la agrega quien la quiera.
    expect(checkbox(t.exportDialog.wordChart)).not.toBeChecked()
  })

  it('exportar sin tocar nada pide el documento sin secuencia de tejido', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ExportPdfDialog onCancel={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: t.exportDialog.confirm }))

    expect(onConfirm).toHaveBeenCalledWith({ chart: true, materials: true, wordChart: false, notes: true })
  })

  it('la secuencia de tejido sigue disponible: marcarla a mano la incluye', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ExportPdfDialog onCancel={vi.fn()} onConfirm={onConfirm} />)

    await user.click(checkbox(t.exportDialog.wordChart))
    expect(checkbox(t.exportDialog.wordChart)).toBeChecked()

    await user.click(screen.getByRole('button', { name: t.exportDialog.confirm }))
    expect(onConfirm).toHaveBeenCalledWith({ chart: true, materials: true, wordChart: true, notes: true })
  })

  it('el resto de las secciones se siguen pudiendo apagar, y con todo apagado no deja exportar', async () => {
    const user = userEvent.setup()
    render(<ExportPdfDialog onCancel={vi.fn()} onConfirm={vi.fn()} />)

    await user.click(checkbox(t.exportDialog.chart))
    await user.click(checkbox(t.exportDialog.materials))
    await user.click(checkbox(t.exportDialog.notes))

    expect(screen.getByText(t.exportDialog.nothingSelected)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: t.exportDialog.confirm })).toBeDisabled()
  })
})
