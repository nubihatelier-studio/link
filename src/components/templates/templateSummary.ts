import type { PatternDoc } from '@/engine/types'
import { beadCount } from '@/engine/geometry'
import { totalFringeBeadCount } from '@/engine/fringe'
import { loopBeadCount } from '@/engine/loop'
import { t } from '@/i18n/es'

/** "Brick · 7 × 7 · 73 mostacillas" — body, fringe and loop, the count the editor shows once it's created. */
export function templateSummary(tpl: PatternDoc): string {
  const { technique, cols, rows } = tpl.config
  const beads = beadCount(technique, cols, rows, tpl.rowShape) + totalFringeBeadCount(tpl.fringe) + loopBeadCount(tpl.loop)
  return t.configurator.userTemplates.summary(t.technique[technique], cols, rows, beads)
}
