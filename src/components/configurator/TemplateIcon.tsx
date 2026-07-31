export type TemplateId = 'pulsera' | 'aroFlecos' | 'personalizado'

interface TemplateIconProps {
  templateId: TemplateId
  size?: number
  className?: string
}

/**
 * Per-template starting-point icon, drawn in the same outline-bead visual
 * language as `TechniqueIcon` (48×48 viewBox, `stroke="currentColor"`, no
 * fill) so the "plantilla" row and the "técnica" row read as one family
 * instead of emoji next to line art.
 */
export function TemplateIcon({ templateId, size = 40, className }: TemplateIconProps) {
  switch (templateId) {
    case 'pulsera':
      return <PulseraIcon size={size} className={className} />
    case 'aroFlecos':
      return <AroFlecosIcon size={size} className={className} />
    case 'personalizado':
      return <PersonalizadoIcon size={size} className={className} />
  }
}

interface IconProps {
  size?: number
  className?: string
}

function bead(cx: number, cy: number, w: number, key: number | string) {
  return (
    <rect
      key={key}
      x={cx - w / 2}
      y={cy - w / 2}
      width={w}
      height={w}
      rx={1.6}
      ry={1.6}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
    />
  )
}

/** Pulsera — un lazo de mostacillas cerrado sobre sí mismo, como una tira que rodea la muñeca. */
function PulseraIcon({ size = 40, className }: IconProps) {
  const cx = 24
  const cy = 24
  const rx = 16
  const ry = 13
  const count = 11
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        return bead(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle), 5, i)
      })}
    </svg>
  )
}

/** Aro con flecos — un aro chico de mostacillas con hebras colgando, cada una rematada en una mostacilla. */
function AroFlecosIcon({ size = 40, className }: IconProps) {
  const cx = 24
  const cy = 15
  const r = 9
  const count = 8
  const fringeX = [15, 20, 28, 33]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => {
        const angle = (i / count) * Math.PI * 2
        return bead(cx + r * Math.cos(angle), cy + r * Math.sin(angle), 4.4, `ring-${i}`)
      })}
      {fringeX.map((x, i) => (
        <g key={`fringe-${i}`}>
          <line x1={x} y1={24} x2={x} y2={37} stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" />
          {bead(x, 40, 4, `drop-${i}`)}
        </g>
      ))}
    </svg>
  )
}

/** Personalizado — un lienzo en blanco con un "+", neutro a propósito: no anticipa ninguna técnica ni forma. */
function PersonalizadoIcon({ size = 40, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect x={9} y={9} width={30} height={30} rx={5} ry={5} fill="none" stroke="currentColor" strokeWidth={1.6} />
      <line x1={24} y1={17} x2={24} y2={31} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <line x1={17} y1={24} x2={31} y2={24} stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  )
}
