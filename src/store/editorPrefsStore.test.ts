import { describe, expect, it } from 'vitest'
import { useEditorPrefsStore } from './editorPrefsStore'

describe('editorPrefsStore — el sentido del peyote triangular', () => {
  it('parte como el reloj, que es el recorrido que confirmó la tejedora', () => {
    expect(useEditorPrefsStore.getState().triangleWeaveClockwise).toBe(true)
  })

  it('se puede dar vuelta y volver', () => {
    useEditorPrefsStore.getState().setTriangleWeaveClockwise(false)
    expect(useEditorPrefsStore.getState().triangleWeaveClockwise).toBe(false)
    useEditorPrefsStore.getState().setTriangleWeaveClockwise(true)
    expect(useEditorPrefsStore.getState().triangleWeaveClockwise).toBe(true)
  })
})
