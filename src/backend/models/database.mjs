import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function createDatabase({ databasePath, hospitalDay }) {
  if (databasePath !== ":memory:")
    mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.function("hospital_day", { deterministic: true }, hospitalDay);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS sectors(id TEXT PRIMARY KEY,name TEXT NOT NULL,slug TEXT NOT NULL UNIQUE,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL,must_change_password INTEGER NOT NULL DEFAULT 1,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS user_sectors(user_id TEXT NOT NULL REFERENCES users(id),sector_id TEXT NOT NULL REFERENCES sectors(id),PRIMARY KEY(user_id,sector_id));
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS surveys(id TEXT PRIMARY KEY,sector_id TEXT NOT NULL REFERENCES sectors(id),title TEXT NOT NULL,description TEXT NOT NULL DEFAULT '',active INTEGER NOT NULL DEFAULT 1,questions_json TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE UNIQUE INDEX IF NOT EXISTS one_active_survey ON surveys(sector_id) WHERE active=1;
    CREATE TABLE IF NOT EXISTS responses(id TEXT PRIMARY KEY,survey_id TEXT NOT NULL REFERENCES surveys(id),sector_id TEXT NOT NULL REFERENCES sectors(id),token_hash TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'partial',questions_json TEXT NOT NULL,attended_on TEXT NOT NULL DEFAULT '',shift TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,submitted_at TEXT,nps INTEGER,comment TEXT NOT NULL DEFAULT '',manifestation_type TEXT NOT NULL DEFAULT 'outro',phone TEXT NOT NULL DEFAULT '',wants_contact INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS responses_sector_date ON responses(sector_id,submitted_at);
    CREATE TABLE IF NOT EXISTS answers(response_id TEXT NOT NULL REFERENCES responses(id),question_id TEXT NOT NULL,value_json TEXT NOT NULL,answered_at TEXT NOT NULL,PRIMARY KEY(response_id,question_id));
    CREATE TABLE IF NOT EXISTS manifestations(id TEXT PRIMARY KEY,response_id TEXT NOT NULL UNIQUE REFERENCES responses(id),status TEXT NOT NULL DEFAULT 'nova',internal_note TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,updated_at TEXT NOT NULL,history_json TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value_json TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT,action TEXT NOT NULL,target_type TEXT NOT NULL,target_id TEXT NOT NULL,details_json TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_responses BEFORE UPDATE ON responses WHEN OLD.status='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_responses_delete BEFORE DELETE ON responses WHEN OLD.status='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_answers_update BEFORE UPDATE ON answers WHEN (SELECT status FROM responses WHERE id=OLD.response_id)='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_answers_insert BEFORE INSERT ON answers WHEN (SELECT status FROM responses WHERE id=NEW.response_id)='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;
    CREATE TRIGGER IF NOT EXISTS preserve_submitted_answers_delete BEFORE DELETE ON answers WHEN (SELECT status FROM responses WHERE id=OLD.response_id)='submitted' BEGIN SELECT RAISE(ABORT,'Respostas enviadas são imutáveis'); END;`);
  return db;
}
