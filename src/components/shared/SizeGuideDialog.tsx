import { useEffect, useRef, useState } from 'react'
import {
  ANILLOS,
  calcularAnillo,
  calcularPulsera,
  COLLARES,
  diametroAnillo,
  HOLGURAS,
  PULSERA_HOMBRE,
  PULSERA_MUJER,
  PULSERA_NINOS,
  PULSERA_PULGADAS,
  TOBILLERA,
  type FilaTalla,
  type Holgura,
  type Rango,
} from '@/data/sizeGuide'
import { t } from '@/i18n/es'

const g = t.sizeGuide

const SECCIONES = ['calculadora', 'pulseras', 'tobilleras', 'collares', 'anillos', 'medir'] as const
type Seccion = (typeof SECCIONES)[number]

/** Con coma decimal y sin ceros de más: 16, 16,5, 1,72. */
const cm = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 })
const rango = ([a, b]: Rango) => (a === b ? cm(a) : `${cm(a)} – ${cm(b)}`)

const INPUT =
  'min-w-0 rounded-xl border border-border bg-surface-2 px-3 py-2 outline-none focus:border-accent-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-500'

/**
 * "Guía de tallas": las medidas de pulseras, tobilleras, collares y anillos,
 * con una calculadora para la medida de la clienta. Es una referencia, no
 * depende del patrón abierto, así que está en el menú de inicio y en el del
 * editor. Los números viven en `data/sizeGuide.ts`.
 */
export function SizeGuideDialog({ onClose }: { onClose: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const refs = useRef<Partial<Record<Seccion, HTMLElement | null>>>({})

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function irA(seccion: Seccion) {
    const el = refs.current[seccion]
    const cont = scrollRef.current
    if (!el || !cont) return
    // El contenedor es `relative`, así que offsetTop ya se mide desde él; se deja el margen de arriba.
    cont.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' })
  }

  const seccion = (id: Seccion) => ({ ref: (el: HTMLElement | null) => void (refs.current[id] = el), 'aria-labelledby': `talla-${id}` })

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/40 md:items-center md:justify-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="size-guide-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-surface pb-[env(safe-area-inset-bottom)] md:max-h-[88vh] md:max-w-2xl md:rounded-2xl md:pb-0"
      >
        <div className="shrink-0 border-b border-border px-4 pt-4">
          <h2 id="size-guide-title" className="text-base font-semibold">
            {g.title}
          </h2>
          <p className="text-xs text-text-muted">{g.lead}</p>
          <nav aria-label={g.sectionsLabel} className="-mx-4 flex gap-2 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {SECCIONES.map((id) => (
              <button
                key={id}
                onClick={() => irA(id)}
                className="shrink-0 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-sm font-semibold hover:border-accent-500"
              >
                {g.nav[id]}
              </button>
            ))}
          </nav>
        </div>

        <div ref={scrollRef} className="relative flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-4 py-4">
          <section {...seccion('calculadora')} className="flex flex-col gap-3">
            <Titulo id="calculadora">{g.calc.title}</Titulo>
            <Calculadora />
          </section>

          <section {...seccion('pulseras')} className="flex flex-col gap-3">
            <Titulo id="pulseras" tag={g.bracelets.tag}>
              {g.bracelets.title}
            </Titulo>
            <div className="grid gap-3 sm:grid-cols-3">
              <Caja titulo={g.bracelets.women}>
                <TablaTallas filas={PULSERA_MUJER} />
              </Caja>
              <Caja titulo={g.bracelets.men}>
                <TablaTallas filas={PULSERA_HOMBRE} />
              </Caja>
              <Caja titulo={g.bracelets.kids}>
                <TablaTallas filas={PULSERA_NINOS} cabecera={g.age} resaltar={false} />
              </Caja>
            </div>

            <div className="flex flex-col gap-2 rounded-2xl bg-accent-500/10 p-4">
              <p className="text-sm font-semibold text-warning">{g.bracelets.easeTitle}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {HOLGURAS.map((h, i) => (
                  <div key={h} className="rounded-xl bg-surface px-3 py-2 text-sm">
                    <b className="block text-base text-warning">+{cm(h)} cm</b>
                    {g.fits[i].name}, {g.fits[i].desc.toLowerCase()}
                  </div>
                ))}
              </div>
              <p className="text-xs text-text-muted">{g.bracelets.easeNote}</p>
            </div>

            <Caja titulo={g.bracelets.inchesTitle}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr>
                      <Th>{g.size}</Th>
                      <Th num>{g.bracelets.bracelet}</Th>
                      <Th num>{g.bracelets.forWrist}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {PULSERA_PULGADAS.map((f) => (
                      <tr key={f.talla} className="border-t border-border">
                        <Td talla>{f.talla}</Td>
                        <Td num>{f.pulsera}</Td>
                        <Td num>{rango(f.muneca)} cm</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Nota>{g.bracelets.inchesNote}</Nota>
            </Caja>
          </section>

          <section {...seccion('tobilleras')} className="flex flex-col gap-3">
            <Titulo id="tobilleras" tag={g.anklets.tag}>
              {g.anklets.title}
            </Titulo>
            <Caja className="sm:max-w-xs">
              <TablaTallas filas={TOBILLERA} />
            </Caja>
            <Nota>{g.anklets.note}</Nota>
          </section>

          <section {...seccion('collares')} className="flex flex-col gap-3">
            <Titulo id="collares" tag={g.necklaces.tag}>
              {g.necklaces.title}
            </Titulo>
            <div className="grid items-center gap-3 sm:grid-cols-[180px_1fr]">
              <DibujoCollares />
              <Caja>
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>{g.necklaces.length}</Th>
                      <Th>{g.necklaces.name}</Th>
                      <Th>{g.necklaces.falls}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {COLLARES.map((c) => (
                      <tr key={c.cm} className="border-t border-border">
                        <Td talla>{c.cm} cm</Td>
                        <Td>{c.nombre}</Td>
                        <Td>{c.cae}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Caja>
            </div>
            <Nota>{g.necklaces.note}</Nota>
          </section>

          <section {...seccion('anillos')} className="flex flex-col gap-3">
            <Titulo id="anillos" tag={g.rings.tag}>
              {g.rings.title}
            </Titulo>
            <Caja>
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr>
                    <Th>{g.size}</Th>
                    <Th num>{g.rings.circumference}</Th>
                    <Th num>{g.rings.diameter}</Th>
                  </tr>
                </thead>
                <tbody>
                  {ANILLOS.map((a) => (
                    <tr key={a.talla} className="border-t border-border">
                      <Td talla>{a.talla}</Td>
                      <Td num>{cm(a.contorno)} cm</Td>
                      <Td num>{cm(diametroAnillo(a.contorno))} cm</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Caja>
            <Nota>{g.rings.note}</Nota>
          </section>

          <section {...seccion('medir')} className="flex flex-col gap-3">
            <Titulo id="medir">{g.measure.title}</Titulo>
            <div className="grid gap-3 sm:grid-cols-3">
              <Pasos titulo={g.measure.wrist} pasos={g.measure.wristSteps} />
              <Pasos titulo={g.measure.finger} pasos={g.measure.fingerSteps} />
              <Pasos titulo={g.measure.necklace} pasos={g.measure.necklaceSteps} />
            </div>
          </section>

          <p className="text-xs text-text-muted">{g.footer}</p>
        </div>

        <div className="flex shrink-0 border-t border-border px-4 py-3">
          <button onClick={onClose} className="h-11 flex-1 rounded-full bg-surface-2 text-sm font-semibold">
            {g.close}
          </button>
        </div>
      </div>
    </div>
  )
}

function Calculadora() {
  const [muneca, setMuneca] = useState('16')
  const [unidad, setUnidad] = useState<'cm' | 'in'>('cm')
  const [holgura, setHolgura] = useState<Holgura>(1.5)
  const [dedo, setDedo] = useState('5,7')

  // Se acepta coma o punto: en Chile se escribe con coma.
  const numero = (s: string) => Number.parseFloat(s.replace(',', '.'))
  const munecaCm = numero(muneca) * (unidad === 'in' ? 2.54 : 1)
  const pulsera = calcularPulsera(munecaCm, holgura)
  const anillo = calcularAnillo(numero(dedo))

  return (
    <div className="grid gap-4 rounded-2xl bg-surface-3 p-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label htmlFor="talla-muneca" className="text-sm font-semibold">
          {g.calc.wrist}
        </label>
        <div className="flex gap-2">
          <input
            id="talla-muneca"
            inputMode="decimal"
            className={`${INPUT} flex-1`}
            value={muneca}
            onChange={(e) => setMuneca(e.target.value)}
          />
          <select
            aria-label={g.calc.unit}
            className={INPUT}
            value={unidad}
            onChange={(e) => setUnidad(e.target.value as 'cm' | 'in')}
          >
            <option value="cm">{g.calc.unitCm}</option>
            <option value="in">{g.calc.unitIn}</option>
          </select>
        </div>
        <label htmlFor="talla-holgura" className="text-sm font-semibold">
          {g.calc.fit}
        </label>
        <select
          id="talla-holgura"
          className={INPUT}
          value={holgura}
          onChange={(e) => setHolgura(Number(e.target.value) as Holgura)}
        >
          {HOLGURAS.map((h, i) => (
            <option key={h} value={h}>
              {g.calc.fitOption(cm(h), g.fits[i].name)}
            </option>
          ))}
        </select>
        <Resultado>
          {pulsera ? (
            <>
              <span className="text-xs text-text-muted">
                {g.calc.wristOf(cm(Math.round(munecaCm * 10) / 10))} ·{' '}
                {pulsera.grupo === 'ninos'
                  ? g.calc.kids(pulsera.talla.toLowerCase())
                  : pulsera.grupo === 'hombre'
                    ? g.calc.men(pulsera.talla)
                    : g.calc.women(pulsera.talla)}
              </span>
              <span className="text-xl font-bold text-warning">{g.calc.bracelet(cm(pulsera.largoPulsera))}</span>
            </>
          ) : (
            <span className="text-xs text-text-muted">{g.calc.empty}</span>
          )}
        </Resultado>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="talla-dedo" className="text-sm font-semibold">
          {g.calc.finger}
        </label>
        <div className="flex items-center gap-2">
          <input
            id="talla-dedo"
            inputMode="decimal"
            className={`${INPUT} flex-1`}
            value={dedo}
            onChange={(e) => setDedo(e.target.value)}
          />
          <span className="text-sm text-text-muted">{g.cm}</span>
        </div>
        <p className="text-xs text-text-muted">{g.calc.fingerHint}</p>
        <Resultado>
          {anillo ? (
            <>
              <span className="text-xl font-bold text-warning">
                {anillo.talla === null ? g.calc.ringTooBig : g.calc.ringSize(anillo.talla)}
              </span>
              <span className="text-xs text-text-muted">
                {g.calc.diameter(cm(anillo.diametro))}
                {anillo.entreTallas && ` · ${g.calc.between}`}
              </span>
            </>
          ) : (
            <span className="text-xs text-text-muted">{g.calc.empty}</span>
          )}
        </Resultado>
      </div>
    </div>
  )
}

function Resultado({ children }: { children: React.ReactNode }) {
  return (
    <div aria-live="polite" className="flex min-h-16 flex-col justify-center gap-0.5 rounded-xl bg-surface px-3 py-2.5 tabular-nums">
      {children}
    </div>
  )
}

function Titulo({ id, tag, children }: { id: Seccion; tag?: string; children: React.ReactNode }) {
  return (
    <h3 id={`talla-${id}`} className="flex flex-wrap items-baseline gap-x-2 text-lg font-bold">
      {children}
      {tag && <span className="text-xs font-semibold text-text-muted">{tag}</span>}
    </h3>
  )
}

function Caja({ titulo, className = '', children }: { titulo?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-2 rounded-2xl border border-border p-3 ${className}`}>
      {titulo && <p className="text-sm font-semibold">{titulo}</p>}
      {children}
    </div>
  )
}

function TablaTallas({ filas, cabecera = g.size, resaltar = true }: { filas: FilaTalla[]; cabecera?: string; resaltar?: boolean }) {
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr>
          <Th>{cabecera}</Th>
          <Th num>{g.cm}</Th>
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.talla} className="border-t border-border">
            <Td talla={resaltar}>{f.talla}</Td>
            <Td num>{rango(f.cm)}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Th({ num, children }: { num?: boolean; children: React.ReactNode }) {
  return (
    <th className={`px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-muted ${num ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

function Td({ num, talla, children }: { num?: boolean; talla?: boolean; children: React.ReactNode }) {
  return (
    <td className={`px-2 py-1.5 ${num ? 'text-right' : ''} ${talla ? 'whitespace-nowrap font-bold text-warning' : ''}`}>{children}</td>
  )
}

function Nota({ children }: { children: React.ReactNode }) {
  return <p className="border-l-2 border-accent-300 py-0.5 pl-3 text-xs text-text-muted">{children}</p>
}

function Pasos({ titulo, pasos }: { titulo: string; pasos: readonly string[] }) {
  return (
    <Caja titulo={titulo}>
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
        {pasos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ol>
    </Caja>
  )
}

/** Un torso con los cinco largos de collar, cada uno donde cae. */
function DibujoCollares() {
  const curvas = [
    { d: 'M78 38 Q110 58 142 38', cm: 35, x: 146, y: 44 },
    { d: 'M70 60 Q110 98 150 60', cm: 42, x: 154, y: 82 },
    { d: 'M64 66 Q110 130 156 66', cm: 50, x: 160, y: 104 },
    { d: 'M60 70 Q110 175 160 70', cm: 70, x: 164, y: 130 },
    { d: 'M58 72 Q110 215 162 72', cm: 80, x: 168, y: 160 },
  ]
  return (
    <svg viewBox="0 0 220 230" role="img" aria-label={g.necklaces.diagram} className="mx-auto w-full max-w-[180px]">
      <path
        d="M70 0 C70 40 72 55 60 70 L20 95 L20 230 L200 230 L200 95 L160 70 C148 55 150 40 150 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="text-border"
      />
      {curvas.map((c, i) => (
        <path
          key={c.cm}
          d={c.d}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          className={i < 2 ? 'text-accent-500' : i < 4 ? 'text-accent-700' : 'text-text-muted'}
        />
      ))}
      {curvas.map((c) => (
        <text key={c.cm} x={c.x} y={c.y} fontSize="11" fontWeight="700" fill="currentColor" className="text-text-muted">
          {c.cm}
        </text>
      ))}
    </svg>
  )
}
