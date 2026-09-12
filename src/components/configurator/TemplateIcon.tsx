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

/** Una mostacilla redonda: los cierres de la pulsera y el remate de cada fleco, que no son cuadradas. */
function roundBead(cx: number, cy: number, r: number, key: number | string) {
  return <circle key={key} cx={cx} cy={cy} r={r} fill="none" stroke="currentColor" strokeWidth={1.4} />
}

const STROKE = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' } as const

/**
 * Pulsera — la tira de mostacillas a lo ancho, con su cierre redondo en cada
 * punta: así se ve la pieza terminada sobre la muñeca. Antes era un aro
 * cerrado de mostacillas, que leía más como una pulsera rígida que como la
 * tira angosta y larga que la plantilla crea.
 */
function PulseraIcon({ size = 40, className }: IconProps) {
  const rows = [18.6, 24, 29.4]
  // Siete columnas de mostacillas más chicas: la tira cruza el ícono de lado a
  // lado, que es lo que distingue una pulsera de un aro.
  const cols = [12.6, 17.2, 21.8, 26.4, 31, 35.6]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      {rows.map((y, r) => cols.map((x, c) => bead(x, y, 4, `${r}-${c}`)))}
      {roundBead(5.4, 24, 2.8, 'cierre-izq')}
      {roundBead(42.6, 24, 2.8, 'cierre-der')}
      <line x1={8.2} y1={24} x2={10.6} y2={24} {...STROKE} />
      <line x1={37.6} y1={24} x2={39.8} y2={24} {...STROKE} />
    </svg>
  )
}

/**
 * Aro con flecos — el gancho y la pieza entera como silueta: el rombo que
 * forman el cuerpo y los flecos juntos, que es como se ve el aro terminado
 * (y como se ve el patrón en el editor). Antes eran un cuerpito y tres hebras
 * sueltas, que leían como un colgante de alambre.
 */
function AroFlecosIcon({ size = 40, className }: IconProps) {
  // Un rombo alargado: se ensancha hasta la mitad y vuelve a la punta, como
  // el cuerpo y los flecos juntos. Las mostacillas son más chicas que el paso
  // (3.2 contra 3.6) para que se distingan una a una: pegadas se veían como
  // una mazorca maciza.
  const pitchX = 3.6
  const pitchY = 3.7
  const rowCounts = [1, 2, 3, 4, 5, 4, 3, 2, 1]
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M24 12.2V9a3.6 3.6 0 1 1 5.6 3" fill="none" {...STROKE} />
      {rowCounts.map((count, row) =>
        Array.from({ length: count }).map((_, i) =>
          bead(24 + (i - (count - 1) / 2) * pitchX, 13.8 + row * pitchY, 3.2, `${row}-${i}`),
        ),
      )}
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
