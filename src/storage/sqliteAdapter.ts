import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { PatternDoc } from '@/engine/types'
import type { StorageAdapter, WeaveProgressRecord } from './types'

const DB_NAME = 'nubih'
const DB_VERSION = 1

/**
 * Native (iOS/Android) storage backend: a real SQLite file via
 * @capacitor-community/sqlite, instead of @capacitor/preferences.
 *
 * Why not Preferences: it's a key-value wrapper over UserDefaults /
 * SharedPreferences, meant for small settings values — same practical size
 * ceiling as localStorage, which is exactly the problem this migration
 * exists to fix (photo-derived patterns with thousands of cells can be
 * several hundred KB each as JSON). SQLite has no such ceiling and is a
 * real file on disk, not part of the WebView's purgeable storage — the
 * actual fix for the "WKWebView clears localStorage under disk pressure"
 * risk described in the QA report.
 */
export class SqliteAdapter implements StorageAdapter {
  readonly backend = 'sqlite' as const
  private sqlite = new SQLiteConnection(CapacitorSQLite)
  private connection: SQLiteDBConnection | null = null

  async init(): Promise<void> {
    if (this.connection) return

    const ret = await this.sqlite.checkConnectionsConsistency()
    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result
    this.connection =
      ret.result && isConn
        ? await this.sqlite.retrieveConnection(DB_NAME, false)
        : await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', DB_VERSION, false)

    await this.connection.open()
    await this.connection.execute(`
      CREATE TABLE IF NOT EXISTS patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        technique TEXT NOT NULL,
        cols INTEGER NOT NULL,
        rows INTEGER NOT NULL,
        bead_type_id TEXT NOT NULL,
        cells_json TEXT NOT NULL,
        extra_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS weave_progress (
        pattern_id TEXT PRIMARY KEY,
        current_index INTEGER NOT NULL,
        order_version INTEGER,
        updated_at INTEGER NOT NULL
      );
    `)
    // Both tables grew a column after they first shipped — add it for installs upgrading from an
    // older version; on a fresh install the column already exists and the error is ignored.
    for (const statement of [
      'ALTER TABLE weave_progress ADD COLUMN order_version INTEGER',
      'ALTER TABLE patterns ADD COLUMN extra_json TEXT',
    ]) {
      try {
        await this.connection.execute(statement)
      } catch {
        // Column already exists — nothing to do.
      }
    }
  }

  private async db(): Promise<SQLiteDBConnection> {
    if (!this.connection) await this.init()
    return this.connection!
  }

  async listPatterns(): Promise<PatternDoc[]> {
    const db = await this.db()
    const res = await db.query('SELECT * FROM patterns ORDER BY updated_at DESC')
    return (res.values ?? []).map(rowToPattern)
  }

  async getPattern(id: string): Promise<PatternDoc | undefined> {
    const db = await this.db()
    const res = await db.query('SELECT * FROM patterns WHERE id = ?', [id])
    const row = res.values?.[0]
    return row ? rowToPattern(row) : undefined
  }

  async savePattern(doc: PatternDoc): Promise<void> {
    const db = await this.db()
    await db.run(
      `INSERT INTO patterns (id, name, technique, cols, rows, bead_type_id, cells_json, extra_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         technique = excluded.technique,
         cols = excluded.cols,
         rows = excluded.rows,
         bead_type_id = excluded.bead_type_id,
         cells_json = excluded.cells_json,
         extra_json = excluded.extra_json,
         updated_at = excluded.updated_at`,
      patternToRowValues(doc),
    )
  }

  async deletePattern(id: string): Promise<void> {
    const db = await this.db()
    await db.run('DELETE FROM patterns WHERE id = ?', [id])
  }

  async getWeaveProgress(patternId: string): Promise<WeaveProgressRecord | undefined> {
    const db = await this.db()
    const res = await db.query('SELECT * FROM weave_progress WHERE pattern_id = ?', [patternId])
    const row = res.values?.[0]
    return row ? rowToWeaveProgress(row) : undefined
  }

  async listWeaveProgress(): Promise<WeaveProgressRecord[]> {
    const db = await this.db()
    const res = await db.query('SELECT * FROM weave_progress')
    return (res.values ?? []).map(rowToWeaveProgress)
  }

  async setWeaveProgress(record: WeaveProgressRecord): Promise<void> {
    const db = await this.db()
    await db.run(
      `INSERT INTO weave_progress (pattern_id, current_index, order_version, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(pattern_id) DO UPDATE SET current_index = excluded.current_index, order_version = excluded.order_version, updated_at = excluded.updated_at`,
      [record.patternId, record.currentIndex, record.orderVersion ?? null, record.updatedAt],
    )
  }

  async deleteWeaveProgress(patternId: string): Promise<void> {
    const db = await this.db()
    await db.run('DELETE FROM weave_progress WHERE pattern_id = ?', [patternId])
  }
}

/**
 * Everything about a pattern that doesn't have a column of its own — fringe,
 * body shape, loop, note, stagger phase, the earring pair, and whatever
 * `PatternDoc` grows next — travels in `extra_json`.
 *
 * This table used to list its fields one by one and silently dropped every
 * field added after it was written: on iOS/Android a pattern lost its fringe,
 * shape, loop, note and stagger phase the next time it was loaded, while the
 * web build (IndexedDB stores the whole document) kept them. Taking "the
 * rest" by exclusion instead of by listing means a new field is persisted by
 * default rather than lost by default.
 */
export function patternToRowValues(doc: PatternDoc): (string | number)[] {
  const { id, name, config, cells, createdAt, updatedAt, ...rest } = doc
  const { technique, cols, rows, beadTypeId, ...restConfig } = config
  const extra = { ...rest, config: restConfig }
  return [id, name, technique, cols, rows, beadTypeId, JSON.stringify(cells), JSON.stringify(extra), createdAt, updatedAt]
}

export function rowToPattern(row: Record<string, unknown>): PatternDoc {
  // Rows saved before `extra_json` existed have it as null — they load as they always did.
  const extra = row.extra_json ? (JSON.parse(row.extra_json as string) as Partial<PatternDoc> & { config?: object }) : {}
  const { config: extraConfig, ...extraFields } = extra
  return {
    ...extraFields,
    id: row.id as string,
    name: row.name as string,
    config: {
      ...extraConfig,
      technique: row.technique as PatternDoc['config']['technique'],
      cols: row.cols as number,
      rows: row.rows as number,
      beadTypeId: row.bead_type_id as string,
    },
    cells: JSON.parse(row.cells_json as string),
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

function rowToWeaveProgress(row: Record<string, unknown>): WeaveProgressRecord {
  return {
    patternId: row.pattern_id as string,
    currentIndex: row.current_index as number,
    orderVersion: (row.order_version as number | null) ?? undefined,
    updatedAt: row.updated_at as number,
  }
}
