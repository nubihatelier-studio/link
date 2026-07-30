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
    // weave_progress predates `order_version` — add it for installs upgrading from an older
    // version of the table; ignore the error on a fresh install where the column already exists.
    try {
      await this.connection.execute('ALTER TABLE weave_progress ADD COLUMN order_version INTEGER')
    } catch {
      // Column already exists — nothing to do.
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
      `INSERT INTO patterns (id, name, technique, cols, rows, bead_type_id, cells_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         technique = excluded.technique,
         cols = excluded.cols,
         rows = excluded.rows,
         bead_type_id = excluded.bead_type_id,
         cells_json = excluded.cells_json,
         updated_at = excluded.updated_at`,
      [
        doc.id,
        doc.name,
        doc.config.technique,
        doc.config.cols,
        doc.config.rows,
        doc.config.beadTypeId,
        JSON.stringify(doc.cells),
        doc.createdAt,
        doc.updatedAt,
      ],
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

function rowToPattern(row: Record<string, unknown>): PatternDoc {
  return {
    id: row.id as string,
    name: row.name as string,
    config: {
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
