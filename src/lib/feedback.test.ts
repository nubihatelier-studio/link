import { describe, expect, it } from 'vitest'
import { APP_VERSION } from '@/version'
import { feedbackMessage, mailtoUrl, NUBIH_EMAIL, NUBIH_WHATSAPP, whatsappUrl } from './feedback'

describe('contar un problema o una idea', () => {
  it('el mensaje trae saludo, espacio para escribir y la versión de la app', () => {
    const message = feedbackMessage()
    expect(message).toContain('Hola Nubih')
    expect(message).toContain(`Nubih Creator ${APP_VERSION}`)
    expect(message).toContain('\n\n\n') // las líneas en blanco donde se escribe
  })

  it('con un patrón abierto dice qué es, sin su nombre ni sus colores', () => {
    const message = feedbackMessage({ technique: 'brick', cols: 8, rows: 24 })
    expect(message).toContain('8 × 24')
    expect(message).toMatch(/Brick/i)
  })

  it('el link de WhatsApp lleva al número y el mensaje va escapado', () => {
    const url = whatsappUrl('Hola & chao')
    expect(url).toBe(`https://wa.me/${NUBIH_WHATSAPP}?text=Hola%20%26%20chao`)
  })

  it('el correo trae asunto y cuerpo', () => {
    const url = mailtoUrl('Hola')
    expect(url.startsWith(`mailto:${NUBIH_EMAIL}?subject=`)).toBe(true)
    expect(url).toContain('body=Hola')
  })
})
