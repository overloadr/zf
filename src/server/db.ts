import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const defaultDir = path.resolve(process.env.DATA_DIR ?? path.join(process.cwd(), 'data'))

export function openDatabase(dbPath = process.env.DB_PATH ?? path.join(defaultDir, 'zf.db')): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      player_count INTEGER NOT NULL,
      status TEXT NOT NULL,
      initial_state TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(match_id, seq),
      FOREIGN KEY(match_id) REFERENCES matches(id)
    );
    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_match ON events(match_id, seq);
  `)
  return db
}
