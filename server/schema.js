import { q, sleep, hasDb } from "./db.js";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS classes (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    role TEXT NOT NULL CHECK (role IN ('guru', 'siswa')),
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'pg'`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS weight NUMERIC(6,2) NOT NULL DEFAULT 1`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS options JSONB`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS pairs JSONB`,
  `ALTER TABLE questions ADD COLUMN IF NOT EXISTS answer_key TEXT`,
  `ALTER TABLE questions ALTER COLUMN option_a DROP NOT NULL`,
  `ALTER TABLE questions ALTER COLUMN option_b DROP NOT NULL`,
  `ALTER TABLE questions ALTER COLUMN option_c DROP NOT NULL`,
  `ALTER TABLE questions ALTER COLUMN option_d DROP NOT NULL`,
  `ALTER TABLE questions ALTER COLUMN correct DROP NOT NULL`,
  `CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS exams (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    class_id INTEGER NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 60,
    shuffle BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS attempts (
    id SERIAL PRIMARY KEY,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'mengerjakan',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at TIMESTAMPTZ,
    score NUMERIC(8,2),
    total NUMERIC(8,2),
    question_order TEXT NOT NULL DEFAULT '[]',
    UNIQUE (exam_id, student_id)
  )`,
  `ALTER TABLE attempts ALTER COLUMN score TYPE NUMERIC(8,2) USING score::numeric`,
  `ALTER TABLE attempts ALTER COLUMN total TYPE NUMERIC(8,2) USING total::numeric`,
  `CREATE TABLE IF NOT EXISTS answers (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    choice TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (attempt_id, question_id)
  )`,
  `ALTER TABLE answers ADD COLUMN IF NOT EXISTS selected JSONB`,
  `ALTER TABLE answers ADD COLUMN IF NOT EXISTS matches JSONB`,
  `ALTER TABLE answers ADD COLUMN IF NOT EXISTS answer_text TEXT`,
  `ALTER TABLE answers ADD COLUMN IF NOT EXISTS score NUMERIC(6,2)`,
  `ALTER TABLE answers ADD COLUMN IF NOT EXISTS graded BOOLEAN NOT NULL DEFAULT false`,
  `UPDATE answers SET selected = to_jsonb(ARRAY[lower(choice)])
     WHERE choice IS NOT NULL AND selected IS NULL`,
  `UPDATE questions SET options = jsonb_build_array(
      jsonb_build_object('id','a','text',coalesce(option_a,''),'correct', correct = 'A','weight',1),
      jsonb_build_object('id','b','text',coalesce(option_b,''),'correct', correct = 'B','weight',1),
      jsonb_build_object('id','c','text',coalesce(option_c,''),'correct', correct = 'C','weight',1),
      jsonb_build_object('id','d','text',coalesce(option_d,''),'correct', correct = 'D','weight',1)
    )
    WHERE options IS NULL AND option_a IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS violations (
    id SERIAL PRIMARY KEY,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    exam_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_violations_exam ON violations (exam_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_violations_attempt ON violations (attempt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers (attempt_id)`,
  `CREATE INDEX IF NOT EXISTS idx_questions_class_subject ON questions (class_id, subject_id)`,
  `CREATE INDEX IF NOT EXISTS idx_attempts_exam ON attempts (exam_id)`,
];

export async function migrate() {
  if (!hasDb()) {
    console.warn("[db] DATABASE_URL belum tersedia — server berjalan tanpa database.");
    return false;
  }
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      for (const sql of STATEMENTS) {
        await q(sql);
      }
      console.log("[db] skema siap");
      return true;
    } catch (err) {
      console.warn(`[db] migrasi gagal (percobaan ${attempt}): ${err.message}`);
      await sleep(Math.min(3000, attempt * 500));
    }
  }
  throw new Error("Tidak bisa menyiapkan skema database.");
}
