import { useEffect, useRef, useState } from 'react'
import { hexToHsv, hsvToHex, type HSV } from '@/lib/color'

interface ColorPickerProps {
  value: string
  onChange: (hex: string) => void
}

/**
 * Compact saturation/value square + hue slider, replacing a big static swatch
 * grid with something smaller that still covers the full color space.
 * Internal HSV state only re-syncs from `value` when it changed externally
 * (not from our own onChange), so dragging through grayscale (s=0, undefined
 * hue) doesn't make the hue thumb jump around.
 */
export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value))
  const lastEmitted = useRef(value.toLowerCase())
  const svRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (value.toLowerCase() === lastEmitted.current) return
    setHsv(hexToHsv(value))
    lastEmitted.current = value.toLowerCase()
  }, [value])

  function emit(next: HSV) {
    setHsv(next)
    const hex = hsvToHex(next)
    lastEmitted.current = hex.toLowerCase()
    onChange(hex)
  }

  function fromSvPoint(clientX: number, clientY: number) {
    const rect = svRef.current!.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    const v = 1 - Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    emit({ ...hsv, s, v })
  }

  function fromHuePoint(clientX: number) {
    const rect = hueRef.current!.getBoundingClientRect()
    const h = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * 360
    emit({ ...hsv, h })
  }

  function bindDrag(onMove: (x: number, y: number) => void) {
    return (e: React.PointerEvent) => {
      onMove(e.clientX, e.clientY)

      function handleMove(ev: PointerEvent) {
        onMove(ev.clientX, ev.clientY)
      }
      function handleUp() {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
      }
      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }
  }

  const hueColor = hsvToHex({ h: hsv.h, s: 1, v: 1 })

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={svRef}
        onPointerDown={bindDrag(fromSvPoint)}
        className="relative h-28 w-full cursor-crosshair touch-none rounded-lg"
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`,
        }}
      >
        <div
          className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>

      <div
        ref={hueRef}
        onPointerDown={bindDrag((x) => fromHuePoint(x))}
        className="relative h-3 w-full cursor-pointer touch-none rounded-full"
        style={{
          background:
            'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
      >
        <div
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueColor }}
        />
      </div>
    </div>
  )
}
