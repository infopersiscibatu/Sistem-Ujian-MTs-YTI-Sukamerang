import { q, sleep } from "./db.js";
import { hashPassword } from "./auth.js";

const CLASSES = ["7A", "7B", "8A", "8B", "9A", "9B"];

const SUBJECTS = [
  "Matematika",
  "Bahasa Indonesia",
  "Bahasa Inggris",
  "Ilmu Pengetahuan Alam",
  "Ilmu Pengetahuan Sosial",
  "Pendidikan Agama Islam",
  "Bahasa Sunda",
];

const STUDENTS = [
  ["Ahmad Fauzi", "ahmad"],
  ["Siti Aminah", "siti"],
  ["Nur Hidayah", "nur"],
  ["Fajar Nugraha", "fajar"],
  ["Rizki Ramadhan", "rizki"],
  ["Salma Nabila", "salma"],
];

const MATH_QUESTIONS = [
  {
    text: "Hasil dari (-12) + 25 - (-8) adalah ...",
    a: "5",
    b: "21",
    c: "29",
    d: "45",
    correct: "B",
  },
  {
    text: "KPK dari 12 dan 18 adalah ...",
    a: "6",
    b: "24",
    c: "36",
    d: "72",
    correct: "C",
  },
  {
    text: "Sebuah persegi panjang memiliki panjang 12 cm dan lebar 7 cm. Luasnya adalah ...",
    a: "38 cm²",
    b: "72 cm²",
    c: "84 cm²",
    d: "168 cm²",
    correct: "C",
  },
  {
    text: "Nilai x yang memenuhi persamaan 3x - 7 = 14 adalah ...",
    a: "x = 5",
    b: "x = 6",
    c: "x = 7",
    d: "x = 8",
    correct: "C",
  },
  {
    text: "Bentuk sederhana dari 2/3 + 1/6 adalah ...",
    a: "3/9",
    b: "5/6",
    c: "3/6",
    d: "2/9",
    correct: "B",
  },
  {
    text: "Hasil dari 4² + √144 adalah ...",
    a: "22",
    b: "24",
    c: "28",
    d: "30",
    correct: "C",
  },
  {
    text: "Jika harga 3 buku adalah Rp18.000, maka harga 5 buku yang sama adalah ...",
    a: "Rp24.000",
    b: "Rp27.000",
    c: "Rp30.000",
    d: "Rp33.000",
    correct: "C",
  },
  {
    text: "Rata-rata dari data 6, 7, 8, 9, 10 adalah ...",
    a: "7",
    b: "7,5",
    c: "8",
    d: "8,5",
    correct: "C",
  },
];

export async function seed() {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const { rows } = await q("SELECT count(*)::int AS n FROM users");
      if (rows[0].n > 0) return;
      await runSeed();
      console.log("[db] data awal dibuat");
      return;
    } catch (err) {
      console.warn(`[db] seed gagal (percobaan ${attempt}): ${err.message}`);
      await sleep(1000);
    }
  }
}

async function runSeed() {
  for (const name of CLASSES) {
    await q("INSERT INTO classes (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
  }
  for (const name of SUBJECTS) {
    await q("INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
  }

  const class7A = (await q("SELECT id FROM classes WHERE name = '7A'")).rows[0].id;
  const matematika = (await q("SELECT id FROM subjects WHERE name = 'Matematika'")).rows[0].id;

  await q(
    `INSERT INTO users (role, name, username, password_hash)
     VALUES ('guru', $1, $2, $3) ON CONFLICT (username) DO NOTHING`,
    ["Yadi Rusmiadi, S.Pd.", "guru", hashPassword("guru123")],
  );

  const studentHash = hashPassword("siswa123");
  for (const [name, username] of STUDENTS) {
    await q(
      `INSERT INTO users (role, name, username, password_hash, class_id)
       VALUES ('siswa', $1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
      [name, username, studentHash, class7A],
    );
  }

  const { rows: existingQuestions } = await q(
    "SELECT count(*)::int AS n FROM questions WHERE class_id = $1 AND subject_id = $2",
    [class7A, matematika],
  );
  if (existingQuestions[0].n === 0) {
    for (const item of MATH_QUESTIONS) {
      const options = [
        { id: "a", text: item.a, image: null, correct: item.correct === "A", weight: 1 },
        { id: "b", text: item.b, image: null, correct: item.correct === "B", weight: 1 },
        { id: "c", text: item.c, image: null, correct: item.correct === "C", weight: 1 },
        { id: "d", text: item.d, image: null, correct: item.correct === "D", weight: 1 },
      ];
      await q(
        `INSERT INTO questions (class_id, subject_id, text, type, weight, options, pairs)
         VALUES ($1, $2, $3, 'pg', 1, $4, '[]')`,
        [class7A, matematika, item.text, JSON.stringify(options)],
      );
    }
  }

  const { rows: existingExams } = await q("SELECT count(*)::int AS n FROM exams");
  if (existingExams[0].n === 0) {
    await q(
      `INSERT INTO exams (title, class_id, subject_id, token, duration_minutes, shuffle, is_active)
       VALUES ($1, $2, $3, $4, $5, true, true)`,
      ["Asesmen Sumatif Akhir Matematika", class7A, matematika, "MTK7A1", 45],
    );
  }
}
