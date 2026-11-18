import express from "express";
import multer from "multer";
import { q, hasDb } from "./db.js";
import { migrate } from "./schema.js";
import { seed } from "./seed.js";
import { hashPassword, verifyPassword, randomToken, examToken } from "./auth.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));

const PORT = Number(process.env.PORT || 3001);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const VIOLATION_TYPES = new Set([
  "tab_hidden",
  "fullscreen_exit",
  "window_blur",
  "copy_attempt",
  "page_exit",
  "other",
]);

function mapUser(row) {
  return {
    id: row.id,
    role: row.role,
    name: row.name,
    username: row.username,
    classId: row.class_id ?? null,
    className: row.class_name ?? null,
  };
}

/* ---------------------------------- auth ---------------------------------- */

const attachUser = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token) {
    const { rows } = await q(
      `SELECT u.id, u.role, u.name, u.username, u.class_id, c.name AS class_name
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         LEFT JOIN classes c ON c.id = u.class_id
        WHERE s.token = $1`,
      [token],
    );
    if (rows[0]) {
      req.user = mapUser(rows[0]);
      req.token = token;
    }
  }
  next();
});

app.use("/api", attachUser);

const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Sesi berakhir. Silakan login ulang." });
  next();
};
const requireTeacher = (req, res, next) => {
  if (req.user?.role !== "guru") return res.status(403).json({ error: "Halaman ini hanya untuk guru." });
  next();
};
const requireStudent = (req, res, next) => {
  if (req.user?.role !== "siswa") return res.status(403).json({ error: "Halaman ini hanya untuk siswa." });
  next();
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, db: hasDb(), time: new Date().toISOString() });
});

app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = req.body?.role === "guru" || req.body?.role === "siswa" ? req.body.role : null;

    if (!username || !password) {
      return res.status(400).json({ error: "Username dan password wajib diisi." });
    }

    const { rows } = await q(
      `SELECT u.*, c.name AS class_name FROM users u LEFT JOIN classes c ON c.id = u.class_id WHERE lower(u.username) = $1`,
      [username],
    );
    const row = rows[0];
    if (!row || !verifyPassword(password, row.password_hash)) {
      return res.status(401).json({ error: "Username atau password salah." });
    }
    if (role && row.role !== role) {
      return res.status(403).json({
        error: role === "guru" ? "Akun ini bukan akun guru." : "Akun ini bukan akun siswa.",
      });
    }

    const token = randomToken(24);
    await q("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [token, row.id]);
    res.json({ token, user: mapUser(row) });
  }),
);

app.post(
  "/api/auth/logout",
  requireAuth,
  wrap(async (req, res) => {
    await q("DELETE FROM sessions WHERE token = $1", [req.token]);
    res.json({ ok: true });
  }),
);

app.get("/api/auth/me", requireAuth, (req, res) => res.json({ user: req.user }));

/* -------------------------- login siswa tanpa akun ------------------------- */

app.get(
  "/api/public/classes",
  wrap(async (_req, res) => {
    const { rows } = await q("SELECT id, name FROM classes ORDER BY name");
    res.json({ classes: rows });
  }),
);

app.get(
  "/api/public/students",
  wrap(async (req, res) => {
    const classId = Number(req.query.classId) || 0;
    if (!classId) return res.json({ students: [] });
    const { rows } = await q(
      "SELECT id, name FROM users WHERE role = 'siswa' AND class_id = $1 ORDER BY name",
      [classId],
    );
    res.json({ students: rows });
  }),
);

app.post(
  "/api/auth/student-login",
  wrap(async (req, res) => {
    const classId = Number(req.body?.classId) || 0;
    const studentId = Number(req.body?.studentId) || 0;
    const token = String(req.body?.token || "").trim().toUpperCase();

    if (!classId || !studentId) {
      return res.status(400).json({ error: "Pilih kelas dan nama Anda terlebih dahulu." });
    }
    if (!token) return res.status(400).json({ error: "Token ujian wajib diisi." });

    const { rows: studentRows } = await q(
      `SELECT u.*, c.name AS class_name
         FROM users u LEFT JOIN classes c ON c.id = u.class_id
        WHERE u.id = $1 AND u.role = 'siswa'`,
      [studentId],
    );
    const student = studentRows[0];
    if (!student) return res.status(404).json({ error: "Nama tidak ditemukan. Pilih nama dari daftar." });
    if (student.class_id !== classId) {
      return res.status(400).json({ error: "Nama tersebut bukan siswa kelas yang dipilih." });
    }

    const { rows: examRows } = await q("SELECT * FROM exams WHERE upper(token) = $1", [token]);
    const exam = examRows[0];
    if (!exam) {
      return res.status(403).json({ error: "Token tidak dikenali. Periksa kembali token dari guru." });
    }
    if (exam.class_id !== classId) {
      const kelas = await q("SELECT name FROM classes WHERE id = $1", [exam.class_id]);
      return res
        .status(403)
        .json({ error: `Token ini untuk kelas ${kelas.rows[0]?.name ?? "lain"}. Periksa kembali kelas Anda.` });
    }
    if (!exam.is_active) {
      return res.status(403).json({ error: "Ujian dengan token ini sedang ditutup oleh guru." });
    }

    const sessionToken = randomToken(24);
    await q("INSERT INTO sessions (token, user_id) VALUES ($1, $2)", [sessionToken, student.id]);

    let attempt = (
      await q("SELECT id, status FROM attempts WHERE exam_id = $1 AND student_id = $2", [exam.id, student.id])
    ).rows[0];
    if (!attempt) {
      const order = await awardQuestions(exam);
      if (!order.length) {
        return res.status(409).json({ error: "Soal untuk ujian ini belum tersedia. Hubungi guru Anda." });
      }
      attempt = (
        await q(
          `INSERT INTO attempts (exam_id, student_id, question_order) VALUES ($1, $2, $3)
           RETURNING id, status`,
          [exam.id, student.id, JSON.stringify(order)],
        )
      ).rows[0];
    }

    const payload = await attemptPayload(attempt.id);

    res.json({
      token: sessionToken,
      user: mapUser(student),
      exam: {
        id: exam.id,
        title: exam.title,
        subjectName: payload?.attempt.subjectName ?? "",
      },
      attempt: {
        id: attempt.id,
        status: payload?.attempt.status ?? attempt.status,
      },
    });
  }),
);

/* ------------------------------ master data -------------------------------- */

app.get(
  "/api/classes",
  requireAuth,
  wrap(async (_req, res) => {
    const { rows } = await q(
      `SELECT c.id, c.name, (SELECT count(*)::int FROM users u WHERE u.role = 'siswa' AND u.class_id = c.id) AS student_count
         FROM classes c ORDER BY c.name`,
    );
    res.json({ classes: rows.map((r) => ({ id: r.id, name: r.name, studentCount: r.student_count })) });
  }),
);

app.post(
  "/api/classes",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nama kelas wajib diisi." });
    const { rows } = await q(
      "INSERT INTO classes (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name",
      [name],
    );
    if (!rows[0]) return res.status(409).json({ error: "Kelas itu sudah ada." });
    res.status(201).json({ class: { id: rows[0].id, name: rows[0].name, studentCount: 0 } });
  }),
);

app.delete(
  "/api/classes/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    await q("DELETE FROM classes WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

app.get(
  "/api/subjects",
  requireAuth,
  wrap(async (_req, res) => {
    const { rows } = await q("SELECT id, name FROM subjects ORDER BY name");
    res.json({ subjects: rows });
  }),
);

app.post(
  "/api/subjects",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Nama mata pelajaran wajib diisi." });
    const { rows } = await q(
      "INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id, name",
      [name],
    );
    if (!rows[0]) return res.status(409).json({ error: "Mata pelajaran itu sudah ada." });
    res.status(201).json({ subject: rows[0] });
  }),
);

app.delete(
  "/api/subjects/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    await q("DELETE FROM subjects WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

/* -------------------------------- students --------------------------------- */

app.get(
  "/api/students",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const classId = Number(req.query.classId) || null;
    const { rows } = await q(
      `SELECT u.id, u.name, u.username, u.class_id, c.name AS class_name
         FROM users u LEFT JOIN classes c ON c.id = u.class_id
        WHERE u.role = 'siswa' AND ($1::int IS NULL OR u.class_id = $1::int)
        ORDER BY c.name NULLS LAST, u.name`,
      [classId],
    );
    res.json({
      students: rows.map((r) => ({
        id: r.id,
        name: r.name,
        username: r.username,
        classId: r.class_id,
        className: r.class_name,
      })),
    });
  }),
);

app.post(
  "/api/students",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const name = String(req.body?.name || "").trim();
    const classId = Number(req.body?.classId) || null;
    if (!name) return res.status(400).json({ error: "Nama siswa wajib diisi." });
    if (!classId) return res.status(400).json({ error: "Kelas siswa wajib dipilih." });

    let username = String(req.body?.username || "")
      .trim()
      .toLowerCase();
    if (username) {
      const exists = await q("SELECT 1 FROM users WHERE lower(username) = $1", [username]);
      if (exists.rows[0]) return res.status(409).json({ error: "Username sudah dipakai." });
    } else {
      const base =
        name
          .toLowerCase()
          .normalize("NFKD")
          .replace(/[^a-z0-9]+/g, ".")
          .replace(/^\.+|\.+$/g, "") || "siswa";
      for (let i = 0; i < 60; i += 1) {
        const candidate = i === 0 ? base : `${base}${i + 1}`;
        const taken = await q("SELECT 1 FROM users WHERE lower(username) = $1", [candidate]);
        if (!taken.rows[0]) {
          username = candidate;
          break;
        }
      }
    }

    const password = String(req.body?.password || "").trim() || randomToken(9);

    const { rows } = await q(
      `INSERT INTO users (role, name, username, password_hash, class_id)
       VALUES ('siswa', $1, $2, $3, $4)
       RETURNING id, name, username, class_id`,
      [name, username, hashPassword(password), classId],
    );
    const classRow = await q("SELECT name FROM classes WHERE id = $1", [classId]);
    res.status(201).json({
      student: {
        id: rows[0].id,
        name: rows[0].name,
        username: rows[0].username,
        classId: rows[0].class_id,
        className: classRow.rows[0]?.name ?? null,
      },
    });
  }),
);

app.patch(
  "/api/students/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const fields = [];
    const values = [];
    if (req.body?.name !== undefined) {
      fields.push(`name = $${values.length + 1}`);
      values.push(String(req.body.name).trim());
    }
    if (req.body?.classId !== undefined) {
      fields.push(`class_id = $${values.length + 1}`);
      values.push(Number(req.body.classId) || null);
    }
    if (req.body?.password) {
      const pw = String(req.body.password);
      if (pw.length < 5) return res.status(400).json({ error: "Password minimal 5 karakter." });
      fields.push(`password_hash = $${values.length + 1}`);
      values.push(hashPassword(pw));
    }
    if (!fields.length) return res.status(400).json({ error: "Tidak ada perubahan." });
    values.push(id);
    await q(`UPDATE users SET ${fields.join(", ")} WHERE id = $${values.length} AND role = 'siswa'`, values);
    res.json({ ok: true });
  }),
);

app.delete(
  "/api/students/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    await q("DELETE FROM users WHERE id = $1 AND role = 'siswa'", [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

/* ---------------------------------- media ---------------------------------- */

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const uploadImage = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_IMAGE_BYTES, files: 1 } });

app.post(
  "/api/media",
  requireAuth,
  requireTeacher,
  (req, res, next) =>
    uploadImage.any()(req, res, (err) => {
      if (err) return res.status(400).json({ error: "Gambar gagal diunggah. Maksimal 3 MB per gambar." });
      next();
    }),
  wrap(async (req, res) => {
    const file = (req.files && req.files[0]) || req.file;
    if (!file) return res.status(400).json({ error: "Berkas gambar tidak ditemukan." });
    if (!IMAGE_MIME.has(file.mimetype)) {
      return res.status(400).json({ error: "Format gambar harus JPG, PNG, WEBP, atau GIF." });
    }
    const { rows } = await q("INSERT INTO media (mime, size, data) VALUES ($1,$2,$3) RETURNING id", [
      file.mimetype,
      file.size,
      file.buffer,
    ]);
    const url = `/api/media/${rows[0].id}`;
    res.json({ success: true, files: [url], url, id: rows[0].id });
  }),
);

app.get(
  "/api/media/:id",
  wrap(async (req, res) => {
    const { rows } = await q("SELECT mime, data FROM media WHERE id = $1", [Number(req.params.id) || 0]);
    if (!rows[0]) return res.status(404).json({ error: "Gambar tidak ditemukan." });
    res.setHeader("Content-Type", rows[0].mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.end(rows[0].data);
  }),
);

/* -------------------------------- questions -------------------------------- */

const QUESTION_TYPES = new Set(["pg", "pgk", "bs", "match", "essay"]);

const stripTags = (html) =>
  String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasContent = (html) => stripTags(html).length > 0 || /<img/i.test(String(html || ""));

function sanitizeHtml(input) {
  return String(input || "")
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|form)[^>]*\/?>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src)\s*=\s*("|')?\s*javascript:[^"'>\s]*/gi, "$1=$2#")
    .slice(0, 20000);
}

function toScore(value, fallback = 1) {
  const n = Number(String(value ?? "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(100, Math.round(n * 100) / 100);
}

function normalizeOptions(raw, { withWeight }) {
  const list = Array.isArray(raw) ? raw.slice(0, 8) : [];
  return list.map((option, index) => ({
    id: String(option?.id || `o${index + 1}`).slice(0, 12),
    text: sanitizeHtml(option?.text ?? "").slice(0, 2000),
    image: option?.image ? String(option.image).slice(0, 500) : null,
    correct: Boolean(option?.correct),
    weight: withWeight ? toScore(option?.weight, 1) : 1,
  }));
}

function normalizePairs(raw) {
  const list = Array.isArray(raw) ? raw.slice(0, 8) : [];
  return list.map((pair, index) => ({
    id: String(pair?.id || `p${index + 1}`).slice(0, 12),
    left: sanitizeHtml(pair?.left ?? "").slice(0, 500),
    right: sanitizeHtml(pair?.right ?? "").slice(0, 500),
    weight: toScore(pair?.weight, 1),
  }));
}

function questionTotals(type, weight, options, pairs) {
  if (type === "pgk") {
    return options.filter((o) => o.correct).reduce((sum, o) => sum + o.weight, 0);
  }
  if (type === "match") {
    return pairs.reduce((sum, p) => sum + p.weight, 0);
  }
  return weight;
}

function buildQuestion(body) {
  const type = QUESTION_TYPES.has(String(body?.type)) ? String(body.type) : "pg";
  const text = sanitizeHtml(body?.text);
  if (!hasContent(text)) throw new Error("Teks soal wajib diisi.");

  let options = [];
  let pairs = [];
  let weight = toScore(body?.weight, 1);

  if (type === "pg" || type === "pgk" || type === "bs") {
    if (type === "bs") {
      const correctSide = String(body?.bsAnswer || "").toLowerCase() === "salah" ? "salah" : "benar";
      options = [
        { id: "benar", text: "Benar", image: null, correct: correctSide === "benar", weight: 1 },
        { id: "salah", text: "Salah", image: null, correct: correctSide === "salah", weight: 1 },
      ];
    } else {
      options = normalizeOptions(body?.options, { withWeight: type === "pgk" });
      if (options.length < 2) throw new Error("Minimal dua pilihan jawaban.");
      if (options.some((o) => !stripTags(o.text) && !o.image)) {
        throw new Error("Semua pilihan jawaban wajib diisi.");
      }
      const correct = options.filter((o) => o.correct);
      if (type === "pg" && correct.length !== 1) throw new Error("Pilih satu jawaban benar.");
      if (type === "pgk" && correct.length < 2) {
        throw new Error("Pilihan ganda kompleks butuh minimal dua jawaban benar.");
      }
    }
  }

  if (type === "match") {
    pairs = normalizePairs(body?.pairs);
    if (pairs.length < 2) throw new Error("Menjodohkan butuh minimal dua pasangan.");
    if (pairs.some((p) => !stripTags(p.left) || !stripTags(p.right))) {
      throw new Error("Semua kolom kiri dan kanan wajib diisi.");
    }
  }

  if (type === "essay") {
    weight = toScore(body?.weight, 1);
  }

  const total = questionTotals(type, weight, options, pairs);
  if (!(total > 0)) throw new Error("Bobot nilai harus lebih dari nol.");

  return {
    type,
    text,
    weight: type === "pgk" || type === "match" ? total : weight,
    options,
    pairs,
    answerKey: type === "essay" ? sanitizeHtml(body?.answerKey).slice(0, 5000) : null,
  };
}

function mapQuestion(row) {
  const type = QUESTION_TYPES.has(row.type) ? row.type : "pg";
  const options = Array.isArray(row.options) ? row.options : [];
  const pairs = Array.isArray(row.pairs) ? row.pairs : [];
  return {
    id: row.id,
    classId: row.class_id,
    subjectId: row.subject_id,
    type,
    text: row.text,
    weight: Number(row.weight) || 0,
    options,
    pairs,
    answerKey: row.answer_key ?? "",
    maxScore: questionTotals(type, Number(row.weight) || 1, options, pairs),
  };
}

app.get(
  "/api/questions",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const classId = Number(req.query.classId) || 0;
    const subjectId = Number(req.query.subjectId) || 0;
    if (!classId || !subjectId) return res.json({ questions: [] });
    const { rows } = await q(
      `SELECT id, class_id, subject_id, type, text, weight, options, pairs, answer_key
         FROM questions WHERE class_id = $1 AND subject_id = $2 ORDER BY id`,
      [classId, subjectId],
    );
    res.json({ questions: rows.map(mapQuestion) });
  }),
);

app.post(
  "/api/questions",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const classId = Number(req.body?.classId) || 0;
    const subjectId = Number(req.body?.subjectId) || 0;
    if (!classId || !subjectId) return res.status(400).json({ error: "Kelas dan mata pelajaran wajib dipilih." });

    let payload;
    try {
      payload = buildQuestion(req.body);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const { rows } = await q(
      `INSERT INTO questions (class_id, subject_id, text, type, weight, options, pairs, answer_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, class_id, subject_id, type, text, weight, options, pairs, answer_key`,
      [
        classId,
        subjectId,
        payload.text,
        payload.type,
        payload.weight,
        JSON.stringify(payload.options),
        JSON.stringify(payload.pairs),
        payload.answerKey,
      ],
    );
    res.status(201).json({ question: mapQuestion(rows[0]) });
  }),
);

app.patch(
  "/api/questions/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const current = await q("SELECT * FROM questions WHERE id = $1", [id]);
    if (!current.rows[0]) return res.status(404).json({ error: "Soal tidak ditemukan." });

    let payload;
    try {
      payload = buildQuestion({ type: req.body?.type ?? current.rows[0].type, ...req.body });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }

    const { rows } = await q(
      `UPDATE questions SET text=$1, type=$2, weight=$3, options=$4, pairs=$5, answer_key=$6
        WHERE id=$7
        RETURNING id, class_id, subject_id, type, text, weight, options, pairs, answer_key`,
      [
        payload.text,
        payload.type,
        payload.weight,
        JSON.stringify(payload.options),
        JSON.stringify(payload.pairs),
        payload.answerKey,
        id,
      ],
    );
    res.json({ question: mapQuestion(rows[0]) });
  }),
);

app.delete(
  "/api/questions/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    await q("DELETE FROM questions WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

/* ---------------------------------- exams ---------------------------------- */

const examSelect = `
  SELECT e.id, e.title, e.class_id, c.name AS class_name, e.subject_id, s.name AS subject_name,
         e.token, e.duration_minutes, e.shuffle, e.is_active, e.created_at,
         (SELECT count(*)::int FROM questions q WHERE q.class_id = e.class_id AND q.subject_id = e.subject_id) AS question_count,
         (SELECT count(*)::int FROM attempts a WHERE a.exam_id = e.id) AS attempt_count
    FROM exams e
    JOIN classes c ON c.id = e.class_id
    JOIN subjects s ON s.id = e.subject_id`;

function mapExam(r) {
  return {
    id: r.id,
    title: r.title,
    classId: r.class_id,
    className: r.class_name,
    subjectId: r.subject_id,
    subjectName: r.subject_name,
    token: r.token,
    durationMinutes: r.duration_minutes,
    shuffle: r.shuffle,
    isActive: r.is_active,
    questionCount: r.question_count,
    attemptCount: r.attempt_count,
    createdAt: r.created_at,
  };
}

async function uniqueExamToken() {
  for (let i = 0; i < 12; i += 1) {
    const token = examToken(6);
    const exists = await q("SELECT 1 FROM exams WHERE token = $1", [token]);
    if (!exists.rows[0]) return token;
  }
  return examToken(8);
}

app.get(
  "/api/exams",
  requireAuth,
  requireTeacher,
  wrap(async (_req, res) => {
    const { rows } = await q(`${examSelect} ORDER BY e.created_at DESC`);
    res.json({ exams: rows.map(mapExam) });
  }),
);

app.post(
  "/api/exams",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const body = req.body || {};
    const title = String(body.title || "").trim();
    const classId = Number(body.classId) || 0;
    const subjectId = Number(body.subjectId) || 0;
    const durationMinutes = Math.min(240, Math.max(5, Number(body.durationMinutes) || 60));
    if (!title || !classId || !subjectId) {
      return res.status(400).json({ error: "Judul, kelas, dan mata pelajaran wajib diisi." });
    }
    const token = await uniqueExamToken();
    const { rows } = await q(
      `INSERT INTO exams (title, class_id, subject_id, token, duration_minutes, shuffle, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,true) RETURNING id`,
      [title, classId, subjectId, token, durationMinutes, body.shuffle !== false],
    );
    const full = await q(`${examSelect} WHERE e.id = $1`, [rows[0].id]);
    res.status(201).json({ exam: mapExam(full.rows[0]) });
  }),
);

app.patch(
  "/api/exams/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body || {};
    const { rows } = await q("SELECT * FROM exams WHERE id = $1", [id]);
    if (!rows[0]) return res.status(404).json({ error: "Ujian tidak ditemukan." });
    const current = rows[0];

    const title = body.title !== undefined ? String(body.title).trim() || current.title : current.title;
    const durationMinutes =
      body.durationMinutes !== undefined
        ? Math.min(240, Math.max(5, Number(body.durationMinutes) || current.duration_minutes))
        : current.duration_minutes;
    const shuffle = body.shuffle !== undefined ? Boolean(body.shuffle) : current.shuffle;
    const isActive = body.isActive !== undefined ? Boolean(body.isActive) : current.is_active;
    const token = body.regenerateToken ? await uniqueExamToken() : current.token;

    await q(
      `UPDATE exams SET title=$1, duration_minutes=$2, shuffle=$3, is_active=$4, token=$5 WHERE id=$6`,
      [title, durationMinutes, shuffle, isActive, token, id],
    );
    const full = await q(`${examSelect} WHERE e.id = $1`, [id]);
    res.json({ exam: mapExam(full.rows[0]) });
  }),
);

app.delete(
  "/api/exams/:id",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    await q("DELETE FROM exams WHERE id = $1", [Number(req.params.id)]);
    res.json({ ok: true });
  }),
);

/* ------------------------------- monitoring -------------------------------- */

app.get(
  "/api/exams/:id/monitor",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const examId = Number(req.params.id);
    const examRows = await q(`${examSelect} WHERE e.id = $1`, [examId]);
    if (!examRows.rows[0]) return res.status(404).json({ error: "Ujian tidak ditemukan." });
    const exam = mapExam(examRows.rows[0]);

    const students = await q(
      `SELECT u.id AS student_id, u.name, u.username,
              a.id AS attempt_id, a.status, a.started_at, a.submitted_at, a.score, a.total,
              (SELECT count(*)::int FROM answers an WHERE an.attempt_id = a.id AND an.choice IS NOT NULL) AS answered,
              (SELECT count(*)::int FROM violations v WHERE v.attempt_id = a.id) AS violations,
              (SELECT max(v.created_at) FROM violations v WHERE v.attempt_id = a.id) AS last_violation_at
         FROM users u
         LEFT JOIN attempts a ON a.student_id = u.id AND a.exam_id = $1
        WHERE u.role = 'siswa' AND u.class_id = $2
        ORDER BY u.name`,
      [examId, exam.classId],
    );

    const violations = await q(
      `SELECT v.id, v.type, v.detail, v.created_at, v.attempt_id, u.name AS student_name
         FROM violations v JOIN users u ON u.id = v.student_id
        WHERE v.exam_id = $1 ORDER BY v.id DESC LIMIT 40`,
      [examId],
    );

    const mapped = students.rows.map((r) => ({
      studentId: r.student_id,
      attemptId: r.attempt_id,
      name: r.name,
      username: r.username,
      status: r.attempt_id ? (r.status === "selesai" ? "selesai" : "mengerjakan") : "belum",
      answered: r.answered ?? 0,
      score: r.score === null || r.score === undefined ? null : Number(r.score),
      total: r.total === null || r.total === undefined ? null : Number(r.total),
      violations: r.violations ?? 0,
      startedAt: r.started_at,
      submittedAt: r.submitted_at,
      lastViolationAt: r.last_violation_at,
    }));

    res.json({
      exam,
      students: mapped,
      violations: violations.rows.map((r) => ({
        id: r.id,
        type: r.type,
        detail: r.detail,
        createdAt: r.created_at,
        attemptId: r.attempt_id,
        studentName: r.student_name,
      })),
      serverTime: new Date().toISOString(),
    });
  }),
);

app.get(
  "/api/violations/recent",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const since = Number(req.query.since) || 0;
    const { rows } = await q(
      `SELECT v.id, v.type, v.detail, v.created_at, v.exam_id, e.title AS exam_title,
              u.name AS student_name, c.name AS class_name, s.name AS subject_name
         FROM violations v
         JOIN users u ON u.id = v.student_id
         JOIN exams e ON e.id = v.exam_id
         JOIN classes c ON c.id = e.class_id
         JOIN subjects s ON s.id = e.subject_id
        WHERE v.id > $1
        ORDER BY v.id DESC LIMIT 25`,
      [since],
    );
    res.json({
      violations: rows.map((r) => ({
        id: r.id,
        type: r.type,
        detail: r.detail,
        createdAt: r.created_at,
        examId: r.exam_id,
        examTitle: r.exam_title,
        studentName: r.student_name,
        className: r.class_name,
        subjectName: r.subject_name,
      })),
    });
  }),
);

app.get(
  "/api/exams/:id/results",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const examId = Number(req.params.id);
    const examRows = await q(`${examSelect} WHERE e.id = $1`, [examId]);
    if (!examRows.rows[0]) return res.status(404).json({ error: "Ujian tidak ditemukan." });
    const { rows } = await q(
      `SELECT u.name, u.username, a.id AS attempt_id, a.status, a.score, a.total,
              a.started_at, a.submitted_at,
              (SELECT count(*)::int FROM violations v WHERE v.attempt_id = a.id) AS violations,
              (SELECT count(*)::int FROM answers an JOIN questions q ON q.id = an.question_id
                WHERE an.attempt_id = a.id AND q.type = 'essay' AND an.graded = false) AS pending_essays
         FROM attempts a JOIN users u ON u.id = a.student_id
        WHERE a.exam_id = $1
        ORDER BY a.score DESC NULLS LAST, u.name`,
      [examId],
    );
    res.json({
      exam: mapExam(examRows.rows[0]),
      results: rows.map((r) => ({
        attemptId: r.attempt_id,
        name: r.name,
        username: r.username,
        status: r.status,
        score: r.score === null ? null : Number(r.score),
        total: r.total === null ? null : Number(r.total),
        pendingEssays: r.pending_essays,
        startedAt: r.started_at,
        submittedAt: r.submitted_at,
        violations: r.violations,
      })),
    });
  }),
);

app.post(
  "/api/attempts/:id/reset",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    await q("DELETE FROM attempts WHERE id = $1", [id]);
    res.json({ ok: true });
  }),
);

/* -------------------------------- dashboard -------------------------------- */

app.get(
  "/api/overview",
  requireAuth,
  requireTeacher,
  wrap(async (_req, res) => {
    const [students, classes, subjects, exams, active, ongoing, todayViolations, recent] = await Promise.all([
      q("SELECT count(*)::int AS n FROM users WHERE role = 'siswa'"),
      q("SELECT count(*)::int AS n FROM classes"),
      q("SELECT count(*)::int AS n FROM subjects"),
      q("SELECT count(*)::int AS n FROM exams"),
      q("SELECT count(*)::int AS n FROM exams WHERE is_active = true"),
      q("SELECT count(*)::int AS n FROM attempts WHERE status = 'mengerjakan'"),
      q("SELECT count(*)::int AS n FROM violations WHERE created_at > now() - interval '24 hours'"),
      q(
        `SELECT v.id, v.type, v.created_at, u.name AS student_name, e.title AS exam_title, c.name AS class_name
           FROM violations v
           JOIN users u ON u.id = v.student_id
           JOIN exams e ON e.id = v.exam_id
           JOIN classes c ON c.id = e.class_id
          ORDER BY v.id DESC LIMIT 6`,
      ),
    ]);

    const examRows = await q(`${examSelect} ORDER BY e.created_at DESC LIMIT 5`);

    res.json({
      stats: {
        students: students.rows[0].n,
        classes: classes.rows[0].n,
        subjects: subjects.rows[0].n,
        exams: exams.rows[0].n,
        activeExams: active.rows[0].n,
        ongoingAttempts: ongoing.rows[0].n,
        violations24h: todayViolations.rows[0].n,
      },
      recentViolations: recent.rows.map((r) => ({
        id: r.id,
        type: r.type,
        createdAt: r.created_at,
        studentName: r.student_name,
        examTitle: r.exam_title,
        className: r.class_name,
      })),
      exams: examRows.rows.map(mapExam),
    });
  }),
);

/* --------------------------------- student --------------------------------- */

app.get(
  "/api/student/exams",
  requireAuth,
  requireStudent,
  wrap(async (req, res) => {
    if (!req.user.classId) return res.json({ exams: [] });
    const { rows } = await q(
      `SELECT e.id, e.title, e.duration_minutes, s.name AS subject_name,
              (SELECT count(*)::int FROM questions q WHERE q.class_id = e.class_id AND q.subject_id = e.subject_id) AS question_count,
              a.id AS attempt_id, a.status AS attempt_status, a.score, a.total, a.started_at, a.submitted_at
         FROM exams e
         JOIN subjects s ON s.id = e.subject_id
         LEFT JOIN attempts a ON a.exam_id = e.id AND a.student_id = $1
        WHERE e.class_id = $2 AND e.is_active = true
        ORDER BY e.created_at DESC`,
      [req.user.id, req.user.classId],
    );
    res.json({
      exams: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subjectName: r.subject_name,
        durationMinutes: r.duration_minutes,
        questionCount: r.question_count,
        attemptId: r.attempt_id,
        status: !r.attempt_id ? "belum" : r.attempt_status === "selesai" ? "selesai" : "mengerjakan",
        score: r.score === null || r.score === undefined ? null : Number(r.score),
        total: r.total === null || r.total === undefined ? null : Number(r.total),
        startedAt: r.started_at,
        submittedAt: r.submitted_at,
      })),
    });
  }),
);

async function awardQuestions(exam) {
  const { rows } = await q(
    "SELECT id FROM questions WHERE class_id = $1 AND subject_id = $2 ORDER BY id",
    [exam.class_id, exam.subject_id],
  );
  const ids = rows.map((r) => r.id);
  if (exam.shuffle) {
    for (let i = ids.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
  }
  return ids;
}

function endsAtOf(attempt, durationMinutes) {
  return new Date(attempt.started_at).getTime() + durationMinutes * 60_000;
}

function parseOrder(attempt) {
  try {
    return JSON.parse(attempt.question_order || "[]");
  } catch {
    return [];
  }
}

function seededShuffle(list, seed) {
  const arr = [...list];
  let s = Math.abs(Number(seed) || 1) % 2147483646 || 1;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function gradeQuestion(question, answer) {
  const type = QUESTION_TYPES.has(question.type) ? question.type : "pg";
  const options = Array.isArray(question.options) ? question.options : [];
  const pairs = Array.isArray(question.pairs) ? question.pairs : [];
  const selected = Array.isArray(answer?.selected) ? answer.selected : [];
  const matches = answer?.matches && typeof answer.matches === "object" ? answer.matches : {};

  if (type === "essay") {
    const max = Number(question.weight) || 0;
    const score = answer?.graded ? Math.min(max, Number(answer.score) || 0) : 0;
    return { type, max, score: Math.round(score * 100) / 100 };
  }
  if (type === "match") {
    const max = pairs.reduce((sum, p) => sum + (Number(p.weight) || 1), 0);
    const score = pairs.reduce((sum, p) => (matches[p.id] === p.id ? sum + (Number(p.weight) || 1) : sum), 0);
    return { type, max, score: Math.round(score * 100) / 100 };
  }
  if (type === "pgk") {
    const max = options.filter((o) => o.correct).reduce((sum, o) => sum + (Number(o.weight) || 1), 0);
    const score = options
      .filter((o) => o.correct && selected.includes(o.id))
      .reduce((sum, o) => sum + (Number(o.weight) || 1), 0);
    return { type, max, score: Math.round(score * 100) / 100 };
  }
  const max = Number(question.weight) || 1;
  const correct = options.find((o) => o.correct);
  const ok = Boolean(correct) && selected.length === 1 && selected[0] === correct.id;
  return { type, max, score: ok ? max : 0 };
}

async function scoreAttempt(attemptId) {
  const { rows: attemptRows } = await q("SELECT question_order FROM attempts WHERE id = $1", [attemptId]);
  if (!attemptRows[0]) return { score: 0, total: 0, pending: 0 };
  const order = parseOrder(attemptRows[0]);
  if (!order.length) return { score: 0, total: 0, pending: 0 };

  const { rows } = await q(
    `SELECT q.id, q.type, q.weight, q.options, q.pairs,
            a.selected, a.matches, a.score AS answer_score, a.graded
       FROM questions q
       LEFT JOIN answers a ON a.question_id = q.id AND a.attempt_id = $1
      WHERE q.id = ANY($2::int[])`,
    [attemptId, order],
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  let score = 0;
  let total = 0;
  let pending = 0;
  for (const id of order) {
    const row = byId.get(id);
    if (!row) continue;
    const graded = gradeQuestion(
      {
        type: row.type,
        weight: Number(row.weight) || 0,
        options: Array.isArray(row.options) ? row.options : [],
        pairs: Array.isArray(row.pairs) ? row.pairs : [],
      },
      { selected: row.selected, matches: row.matches, score: row.answer_score, graded: row.graded },
    );
    total += graded.max;
    score += graded.score;
    if (graded.type === "essay" && !row.graded) pending += 1;
  }
  return {
    score: Math.round(score * 100) / 100,
    total: Math.round(total * 100) / 100,
    pending,
  };
}

function studentQuestion(row, attemptId) {
  const type = QUESTION_TYPES.has(row.type) ? row.type : "pg";
  const options = Array.isArray(row.options) ? row.options : [];
  const pairs = Array.isArray(row.pairs) ? row.pairs : [];
  const common = { id: row.id, type, text: row.text, weight: Number(row.weight) || 0 };

  if (type === "pgk") {
    return {
      ...common,
      options: options.map((o) => ({
        id: o.id,
        text: o.text,
        image: o.image || null,
        weight: Number(o.weight) || 1,
      })),
    };
  }
  if (type === "pg" || type === "bs") {
    return {
      ...common,
      options: options.map((o) => ({ id: o.id, text: o.text, image: o.image || null })),
    };
  }
  if (type === "match") {
    const rights = seededShuffle(
      pairs.map((p) => ({ id: p.id, text: p.right })),
      attemptId,
    );
    return {
      ...common,
      pairs: pairs.map((p) => ({ id: p.id, text: p.left })),
      rights,
      maxScore: pairs.reduce((sum, p) => sum + (Number(p.weight) || 1), 0),
    };
  }
  return { ...common };
}

async function finalizeAttempt(attemptId) {
  const { rows } = await q(
    `SELECT a.*, e.duration_minutes FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1`,
    [attemptId],
  );
  const attempt = rows[0];
  if (!attempt || attempt.status === "selesai") return attempt ?? null;

  const scored = await scoreAttempt(attemptId);

  const updated = await q(
    `UPDATE attempts SET status = 'selesai', score = $1, total = $2, submitted_at = now()
      WHERE id = $3 RETURNING id, exam_id, student_id, status, score, total, started_at, submitted_at`,
    [scored.score, scored.total, attemptId],
  );
  return updated.rows[0] ?? null;
}

async function maybeAutoSubmit(attempt) {
  if (!attempt || attempt.status === "selesai") return attempt;
  if (Date.now() > endsAtOf(attempt, attempt.duration_minutes)) {
    const done = await finalizeAttempt(attempt.id);
    return { ...attempt, ...done };
  }
  return attempt;
}

async function attemptPayload(attemptId) {
  const { rows } = await q(
    `SELECT a.id, a.exam_id, a.student_id, a.status, a.started_at, a.submitted_at, a.score, a.total,
            a.question_order, e.title, e.duration_minutes, e.token,
            s.name AS subject_name, c.name AS class_name
       FROM attempts a
       JOIN exams e ON e.id = a.exam_id
       JOIN subjects s ON s.id = e.subject_id
       JOIN classes c ON c.id = e.class_id
      WHERE a.id = $1`,
    [attemptId],
  );
  let attempt = rows[0];
  if (!attempt) return null;
  attempt = await maybeAutoSubmit(attempt);

  const order = parseOrder(attempt);

  let questions = [];
  if (order.length) {
    const qRows = await q("SELECT * FROM questions WHERE id = ANY($1::int[])", [order]);
    const byId = new Map(qRows.rows.map((r) => [r.id, r]));
    questions = order
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((row) => studentQuestion(row, attempt.id));
  }

  const answers = await q(
    "SELECT question_id, selected, matches, answer_text FROM answers WHERE attempt_id = $1",
    [attemptId],
  );
  const violations = await q(
    "SELECT id, type, detail, created_at FROM violations WHERE attempt_id = $1 ORDER BY id",
    [attemptId],
  );

  const answerMap = {};
  for (const row of answers.rows) {
    answerMap[row.question_id] = {
      selected: Array.isArray(row.selected) ? row.selected : [],
      matches: row.matches && typeof row.matches === "object" ? row.matches : {},
      text: row.answer_text ?? "",
    };
  }

  return {
    attempt: {
      id: attempt.id,
      examId: attempt.exam_id,
      title: attempt.title,
      subjectName: attempt.subject_name,
      className: attempt.class_name,
      status: attempt.status,
      startedAt: attempt.started_at,
      submittedAt: attempt.submitted_at,
      score: attempt.score === null ? null : Number(attempt.score),
      total: attempt.total === null ? null : Number(attempt.total),
      durationMinutes: attempt.duration_minutes,
      endsAt: new Date(endsAtOf(attempt, attempt.duration_minutes)).toISOString(),
    },
    questions,
    answers: answerMap,
    violations: violations.rows.map((r) => ({ id: r.id, type: r.type, detail: r.detail, createdAt: r.created_at })),
  };
}

app.post(
  "/api/student/exams/:id/start",
  requireAuth,
  requireStudent,
  wrap(async (req, res) => {
    const examId = Number(req.params.id);
    const { rows } = await q("SELECT * FROM exams WHERE id = $1", [examId]);
    const exam = rows[0];
    if (!exam) return res.status(404).json({ error: "Ujian tidak ditemukan." });
    if (!exam.is_active) return res.status(403).json({ error: "Ujian ini sedang ditutup oleh guru." });
    if (exam.class_id !== req.user.classId) return res.status(403).json({ error: "Ujian ini bukan untuk kelas Anda." });

    const existing = await q("SELECT id, status FROM attempts WHERE exam_id = $1 AND student_id = $2", [
      examId,
      req.user.id,
    ]);
    if (existing.rows[0]) {
      if (existing.rows[0].status === "selesai") {
        return res.status(409).json({ error: "Anda sudah menyelesaikan ujian ini." });
      }
      const payload = await attemptPayload(existing.rows[0].id);
      return res.json({ ...payload, resumed: true });
    }

    const supplied = String(req.body?.token || "").trim().toUpperCase();
    if (supplied !== String(exam.token).toUpperCase()) {
      return res.status(403).json({ error: "Token ujian salah. Minta token yang benar kepada guru." });
    }

    const order = await awardQuestions(exam);
    if (!order.length) return res.status(409).json({ error: "Soal untuk ujian ini belum tersedia." });

    const created = await q(
      `INSERT INTO attempts (exam_id, student_id, question_order) VALUES ($1, $2, $3) RETURNING id`,
      [examId, req.user.id, JSON.stringify(order)],
    );
    const payload = await attemptPayload(created.rows[0].id);
    res.status(201).json({ ...payload, resumed: false });
  }),
);

app.get(
  "/api/attempts/:id",
  requireAuth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const payload = await attemptPayload(id);
    if (!payload) return res.status(404).json({ error: "Ujian tidak ditemukan." });
    if (req.user.role === "siswa") {
      const attemptRows = await q("SELECT student_id FROM attempts WHERE id = $1", [id]);
      if (!attemptRows.rows[0] || attemptRows.rows[0].student_id !== req.user.id) {
        return res.status(403).json({ error: "Anda tidak berhak membuka ujian ini." });
      }
    }
    res.json(payload);
  }),
);

async function loadOwnAttempt(req) {
  const id = Number(req.params.id);
  const { rows } = await q(
    `SELECT a.*, e.duration_minutes FROM attempts a JOIN exams e ON e.id = a.exam_id WHERE a.id = $1`,
    [id],
  );
  const attempt = rows[0];
  if (!attempt) return { error: { status: 404, message: "Ujian tidak ditemukan." } };
  if (attempt.student_id !== req.user.id) {
    return { error: { status: 403, message: "Anda tidak berhak membuka ujian ini." } };
  }
  return { attempt };
}

app.post(
  "/api/attempts/:id/answer",
  requireAuth,
  requireStudent,
  wrap(async (req, res) => {
    const loaded = await loadOwnAttempt(req);
    if (loaded.error) return res.status(loaded.error.status).json({ error: loaded.error.message });
    let attempt = loaded.attempt;
    if (attempt.status === "selesai") return res.status(409).json({ error: "Ujian sudah selesai." });
    attempt = await maybeAutoSubmit(attempt);
    if (attempt.status === "selesai") return res.status(409).json({ error: "Waktu ujian sudah habis." });

    const questionId = Number(req.body?.questionId) || 0;
    if (!questionId) return res.status(400).json({ error: "Soal tidak dikenal." });

    const order = parseOrder(attempt);
    if (!order.includes(questionId)) return res.status(400).json({ error: "Soal bukan bagian dari ujian ini." });

    const questionRows = await q("SELECT type, options, pairs FROM questions WHERE id = $1", [questionId]);
    const question = questionRows.rows[0];
    if (!question) return res.status(404).json({ error: "Soal tidak ditemukan." });
    const type = QUESTION_TYPES.has(question.type) ? question.type : "pg";

    let selected = null;
    let matches = null;
    let answerText = null;

    if (type === "pg" || type === "bs" || type === "pgk") {
      const validIds = new Set((Array.isArray(question.options) ? question.options : []).map((o) => String(o.id)));
      const raw = Array.isArray(req.body?.selected) ? req.body.selected.map(String) : [];
      const unique = [...new Set(raw.filter((id) => validIds.has(id)))];
      selected = type === "pgk" ? unique.slice(0, 8) : unique.slice(0, 1);
    } else if (type === "match") {
      const pairIds = new Set((Array.isArray(question.pairs) ? question.pairs : []).map((p) => String(p.id)));
      const raw = req.body?.matches && typeof req.body.matches === "object" ? req.body.matches : {};
      const picked = {};
      for (const [pairId, choice] of Object.entries(raw)) {
        const value = String(choice ?? "");
        if (pairIds.has(String(pairId)) && pairIds.has(value)) picked[pairId] = value;
      }
      matches = picked;
    } else if (type === "essay") {
      answerText = String(req.body?.text ?? "").slice(0, 5000);
    }

    await q(
      `INSERT INTO answers (attempt_id, question_id, selected, matches, answer_text, updated_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, now())
       ON CONFLICT (attempt_id, question_id) DO UPDATE SET
         selected = EXCLUDED.selected,
         matches = EXCLUDED.matches,
         answer_text = EXCLUDED.answer_text,
         graded = CASE WHEN answers.answer_text IS DISTINCT FROM EXCLUDED.answer_text THEN false ELSE answers.graded END,
         score = CASE WHEN answers.answer_text IS DISTINCT FROM EXCLUDED.answer_text THEN NULL ELSE answers.score END,
         choice = NULL,
         updated_at = now()`,
      [
        attempt.id,
        questionId,
        selected === null ? null : JSON.stringify(selected),
        matches === null ? null : JSON.stringify(matches),
        answerText,
      ],
    );

    const answers = await q("SELECT selected, matches, answer_text FROM answers WHERE attempt_id = $1", [attempt.id]);
    const answered = answers.rows.filter(
      (r) =>
        (Array.isArray(r.selected) && r.selected.length > 0) ||
        (r.matches && Object.keys(r.matches).length > 0) ||
        String(r.answer_text || "").trim().length > 0,
    ).length;

    res.json({ ok: true, answered });
  }),
);

app.post(
  "/api/attempts/:id/violation",
  requireAuth,
  requireStudent,
  wrap(async (req, res) => {
    const loaded = await loadOwnAttempt(req);
    if (loaded.error) return res.status(loaded.error.status).json({ error: loaded.error.message });
    const attempt = loaded.attempt;

    const type = VIOLATION_TYPES.has(String(req.body?.type)) ? String(req.body.type) : "other";
    const detail = req.body?.detail ? String(req.body.detail).slice(0, 300) : null;

    await q(`INSERT INTO violations (attempt_id, exam_id, student_id, type, detail) VALUES ($1, $2, $3, $4, $5)`, [
      attempt.id,
      attempt.exam_id,
      req.user.id,
      type,
      detail,
    ]);
    const count = await q("SELECT count(*)::int AS n FROM violations WHERE attempt_id = $1", [attempt.id]);
    res.json({ ok: true, count: count.rows[0].n });
  }),
);

app.post(
  "/api/attempts/:id/submit",
  requireAuth,
  requireStudent,
  wrap(async (req, res) => {
    const loaded = await loadOwnAttempt(req);
    if (loaded.error) return res.status(loaded.error.status).json({ error: loaded.error.message });
    const result = await finalizeAttempt(loaded.attempt.id);
    const payload = await attemptPayload(loaded.attempt.id);
    res.json({ result, attempt: payload?.attempt ?? null });
  }),
);

app.get(
  "/api/attempts/:id/result",
  requireAuth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const payload = await attemptPayload(id);
    if (!payload) return res.status(404).json({ error: "Ujian tidak ditemukan." });
    if (req.user.role === "siswa") {
      const attemptRows = await q("SELECT student_id FROM attempts WHERE id = $1", [id]);
      if (!attemptRows.rows[0] || attemptRows.rows[0].student_id !== req.user.id) {
        return res.status(403).json({ error: "Anda tidak berhak membuka hasil ini." });
      }
    }
    const answered = Object.values(payload.answers).filter(
      (a) =>
        (Array.isArray(a?.selected) && a.selected.length > 0) ||
        (a?.matches && Object.keys(a.matches).length > 0) ||
        String(a?.text || "").trim().length > 0,
    ).length;

    const scored = await scoreAttempt(id);

    res.json({
      attempt: payload.attempt,
      summary: {
        answered,
        total: payload.questions.length,
        score: scored.score,
        maxScore: scored.total,
        percent: scored.total > 0 ? Math.round((scored.score / scored.total) * 100) : 0,
        pendingEssays: scored.pending,
        violations: payload.violations.length,
      },
      violations: payload.violations,
    });
  }),
);

/* ------------------------- penilaian uraian oleh guru ----------------------- */

app.get(
  "/api/attempts/:id/grading",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const attemptRows = await q("SELECT id, question_order FROM attempts WHERE id = $1", [id]);
    const attempt = attemptRows.rows[0];
    if (!attempt) return res.status(404).json({ error: "Ujian tidak ditemukan." });

    const order = parseOrder(attempt);
    const { rows } = order.length
      ? await q(
          `SELECT q.id, q.text, q.weight, q.answer_key, a.answer_text, a.score, a.graded
             FROM questions q
             LEFT JOIN answers a ON a.question_id = q.id AND a.attempt_id = $1
            WHERE q.id = ANY($2::int[]) AND q.type = 'essay'
            ORDER BY array_position($2::int[], q.id)`,
          [id, order],
        )
      : { rows: [] };

    const summary = await scoreAttempt(id);
    res.json({
      essays: rows.map((r) => ({
        questionId: r.id,
        text: r.text,
        answerKey: r.answer_key ?? "",
        answer: r.answer_text ?? "",
        score: r.score === null ? null : Number(r.score),
        graded: Boolean(r.graded),
        maxScore: Number(r.weight) || 0,
      })),
      summary,
    });
  }),
);

app.patch(
  "/api/attempts/:id/grade",
  requireAuth,
  requireTeacher,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    const attemptRows = await q("SELECT id FROM attempts WHERE id = $1", [id]);
    if (!attemptRows.rows[0]) return res.status(404).json({ error: "Ujian tidak ditemukan." });

    const grades = Array.isArray(req.body?.grades) ? req.body.grades : [];
    for (const grade of grades) {
      const questionId = Number(grade?.questionId) || 0;
      if (!questionId) continue;
      const questionRows = await q("SELECT weight FROM questions WHERE id = $1 AND type = 'essay'", [questionId]);
      if (!questionRows.rows[0]) continue;
      const max = Number(questionRows.rows[0].weight) || 0;
      const raw = Number(String(grade?.score ?? "0").replace(",", "."));
      const score = Math.max(0, Math.min(max, Number.isFinite(raw) ? raw : 0));

      await q(
        `INSERT INTO answers (attempt_id, question_id, answer_text, score, graded, updated_at)
         VALUES ($1, $2, '', $3, true, now())
         ON CONFLICT (attempt_id, question_id) DO UPDATE SET score = $3, graded = true, updated_at = now()`,
        [id, questionId, score],
      );
    }

    const summary = await scoreAttempt(id);
    await q("UPDATE attempts SET score = $1, total = $2 WHERE id = $3", [summary.score, summary.total, id]);
    res.json({ ok: true, summary });
  }),
);

/* -------------------------------- fallbacks -------------------------------- */

app.use("/api", (_req, res) => res.status(404).json({ error: "Endpoint tidak ditemukan." }));

app.use((err, _req, res, _next) => {
  console.error("[api]", err);
  const message = err?.code === "23505" ? "Data itu sudah ada." : "Terjadi kesalahan pada server.";
  res.status(500).json({ error: message });
});

async function main() {
  try {
    await migrate();
    await seed();
    await q("DELETE FROM sessions WHERE created_at < now() - interval '30 days'").catch(() => {});
  } catch (err) {
    console.error("[boot]", err.message);
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[api] listening on ${PORT}`);
  });
}

main();
