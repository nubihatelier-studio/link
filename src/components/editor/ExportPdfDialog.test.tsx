import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportPdfDialog } from './ExportPdfDialog'
import { t } from '@/i18n/es'

function checkbox(label: string) {
  return screen.getByRole('checkbox', { name: new RegExp(label) })
}

describe('ExportPdfDialog — qué viene marcado por defecto', () => {
  it('ofrece tres secciones, las tres marcadas: gráfico, materiales y notas', async () => {
    render(<ExportPdfDialog onCancel={vi.fn()} onConfirm={vi.fn()} />)

    expect(checkbox(t.exportDialog.chart)).toBeChecked()
    expect(checkbox(t.exportDialog.materials)).toBeChecked()
    expect(checkbox(t.exportDialog.notes)).toBeChecked()
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
    // La secuencia de tejido dejó de ser una sección del PDF: vive en el modo tejido.
    expect(screen.queryByText(/Secuencia de tejido/)).not.toBeInTheDocument()
  })

  it('exportar sin tocar nada pide las tres secciones', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn()
    render(<ExportPdfDialog onCancel={vi.fn()} onConfirm={onConfirm} />)

    await user.click(screen.getByRole('button', { name: t.exportDialog.confirm }))

    expect(onConfirm).toHaveBeenCalledWith({ chart: true, materials: true, notes: true })
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
