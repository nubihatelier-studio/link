import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@/i18n/es'
import { TemplateCardDialog } from './TemplateCardDialog'

function open(overrides: Partial<Parameters<typeof TemplateCardDialog>[0]> = {}) {
  const onConfirm = vi.fn()
  render(
    <TemplateCardDialog
      title="Guardar como plantilla"
      name="Aro rombo"
      meta={{}}
      suggestedDifficulty="intermedio"
      confirmLabel={t.editor.saveTemplate.save}
      onConfirm={onConfirm}
      onCancel={() => {}}
      {...overrides}
    />,
  )
  return onConfirm
}

describe('la ficha de una plantilla', () => {
  it('propone una dificultad, la marca como propuesta, y la guarda si no se cambia', async () => {
    const user = userEvent.setup()
    const onConfirm = open()
    expect(screen.getByRole('button', { name: `${t.difficulty.intermedio} · ${t.editor.templateMeta.suggested}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await user.click(screen.getByRole('button', { name: t.editor.saveTemplate.save }))
    expect(onConfirm).toHaveBeenCalledWith({ name: 'Aro rombo', meta: { kind: undefined, difficulty: 'intermedio', photo: undefined } })
  })

  it('guarda el tipo de pieza y una dificultad elegida a mano', async () => {
    const user = userEvent.setup()
    const onConfirm = open()
    await user.click(screen.getByRole('button', { name: t.pieceKind.aro }))
    await user.click(screen.getByRole('button', { name: t.difficulty.avanzado }))
    await user.click(screen.getByRole('button', { name: t.editor.saveTemplate.save }))
    expect(onConfirm.mock.calls[0][0].meta).toEqual({ kind: 'aro', difficulty: 'avanzado', photo: undefined })
  })

  it('el tipo se puede soltar volviendo a tocarlo', async () => {
    const user = userEvent.setup()
    const onConfirm = open({ meta: { kind: 'collar' } })
    await user.click(screen.getByRole('button', { name: t.pieceKind.collar }))
    await user.click(screen.getByRole('button', { name: t.editor.saveTemplate.save }))
    expect(onConfirm.mock.calls[0][0].meta.kind).toBeUndefined()
  })

  it('una foto ya guardada se ve, con su peso, y se puede quitar', async () => {
    const user = userEvent.setup()
    const photo = 'data:image/jpeg;base64,' + 'A'.repeat(4096)
    const onConfirm = open({ meta: { photo } })
    expect(screen.getByText(t.editor.templateMeta.photoWeight(3))).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: t.editor.templateMeta.photoRemove }))
    await user.click(screen.getByRole('button', { name: t.editor.saveTemplate.save }))
    expect(onConfirm.mock.calls[0][0].meta.photo).toBeUndefined()
  })

  it('sin nombre no se puede guardar', async () => {
    const user = userEvent.setup()
    open()
    await user.clear(screen.getByLabelText(t.editor.saveTemplate.nameLabel))
    expect(screen.getByRole('button', { name: t.editor.saveTemplate.save })).toBeDisabled()
  })
})
