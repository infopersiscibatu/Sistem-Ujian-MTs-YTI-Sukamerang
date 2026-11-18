import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ClipboardCopy,
  Copy,
  Eye,
  KeyRound,
  Loader2,
  MonitorPlay,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Trophy,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeading } from "../../components/TeacherLayout";
import { useConfirm } from "../../components/ConfirmDialog";
import RichText, { plainText } from "../../components/RichText";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  cn,
} from "../../components/ui";
import { formatDateTime } from "../../lib/format";
import type { ClassRow, Exam, SubjectRow } from "../../lib/types";

interface ResultsPayload {
  exam: Exam;
  results: Array<{
    attemptId: number;
    name: string;
    username: string;
    status: string;
    score: number | null;
    total: number | null;
    startedAt: string | null;
    submittedAt: string | null;
    violations: number;
    pendingEssays: number;
  }>;
}

interface EssayRow {
  questionId: number;
  text: string;
  answerKey: string;
  answer: string;
  score: number | null;
  graded: boolean;
  maxScore: number;
}

interface GradingState {
  attemptId: number;
  name: string;
  examId: number;
  essays: EssayRow[];
}

const EXAM_TITLES = ["ASAS Ganjil", "ASAT Genap"] as const;

/** Semester Ganjil (Juli–Desember) memakai ASAS, semester Genap (Januari–Juni) memakai ASAT. */
function defaultExamTitle(): string {
  const month = new Date().getMonth() + 1;
  return month >= 7 ? "ASAS Ganjil" : "ASAT Genap";
}

export default function TeacherExams() {
  const { confirm, dialog } = useConfirm();
  const [exams, setExams] = useState<Exam[] | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [grading, setGrading] = useState<GradingState | null>(null);
  const [gradeDraft, setGradeDraft] = useState<Record<number, string>>({});
  const [gradingBusy, setGradingBusy] = useState(false);

  const [form, setForm] = useState({
    title: defaultExamTitle(),
    classId: "" as number | "",
    subjectId: "" as number | "",
    durationMinutes: 60,
    shuffle: true,
  });

  const loadExams = useCallback(async () => {
    try {
      const data = await api<{ exams: Exam[] }>("/exams");
      setExams(data.exams);
      setError("");
    } catch (err) {
      setExams([]);
      setError(err instanceof ApiError ? err.message : "Gagal memuat daftar ujian.");
    }
  }, []);

  useEffect(() => {
    void loadExams();
    const load = async () => {
      try {
        const [classData, subjectData] = await Promise.all([
          api<{ classes: ClassRow[] }>("/classes"),
          api<{ subjects: SubjectRow[] }>("/subjects"),
        ]);
        setClasses(classData.classes);
        setSubjects(subjectData.subjects);
      } catch {
        /* sudah ditangani di pemuatan ujian */
      }
    };
    void load();
  }, [loadExams]);

  function openCreate() {
    setForm({
      title: defaultExamTitle(),
      classId: classes[0]?.id ?? "",
      subjectId: subjects[0]?.id ?? "",
      durationMinutes: 60,
      shuffle: true,
    });
    setCreateOpen(true);
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const data = await api<{ exam: Exam }>("/exams", {
        method: "POST",
        body: {
          title: form.title,
          classId: form.classId,
          subjectId: form.subjectId,
          durationMinutes: form.durationMinutes,
          shuffle: form.shuffle,
        },
      });
      setCreateOpen(false);
      setFeedback(`Ujian "${data.exam.title}" dibuat. Token: ${data.exam.token}`);
      await loadExams();
      window.setTimeout(() => setFeedback(""), 6000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal membuat ujian.");
    } finally {
      setSaving(false);
    }
  }

  async function patchExam(id: number, body: Record<string, unknown>, message: string) {
    try {
      await api(`/exams/${id}`, { method: "PATCH", body });
      await loadExams();
      setFeedback(message);
      window.setTimeout(() => setFeedback(""), 5000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memperbarui ujian.");
    }
  }

  async function handleDelete(exam: Exam) {
    confirm(
      {
        title: "Hapus asesmen?",
        subject: `${exam.title} · Kelas ${exam.className} · ${exam.subjectName}`,
        note: "Jawaban siswa dan catatan pelanggaran untuk asesmen ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
        confirmLabel: "Hapus asesmen",
      },
      async () => {
        try {
          await api(`/exams/${exam.id}`, { method: "DELETE" });
          setFeedback("Asesmen dihapus.");
          await loadExams();
          window.setTimeout(() => setFeedback(""), 4000);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Gagal menghapus asesmen.");
        }
      },
    );
  }

  async function copyToken(exam: Exam) {
    try {
      await navigator.clipboard.writeText(exam.token);
      setCopied(exam.id);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Browser tidak mengizinkan menyalin otomatis. Salin token secara manual.");
    }
  }

  async function openGrading(row: ResultsPayload["results"][number], examId: number) {
    try {
      const data = await api<{ essays: EssayRow[] }>(`/attempts/${row.attemptId}/grading`);
      setGrading({ attemptId: row.attemptId, name: row.name, examId, essays: data.essays });
      setGradeDraft(
        Object.fromEntries(data.essays.map((essay) => [essay.questionId, essay.score === null ? "" : String(essay.score)])),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat jawaban uraian.");
    }
  }

  async function saveGrades() {
    if (!grading) return;
    setGradingBusy(true);
    try {
      const grades = grading.essays
        .map((essay) => ({ questionId: essay.questionId, score: gradeDraft[essay.questionId] ?? "" }))
        .filter((grade) => String(grade.score).trim() !== "");
      await api(`/attempts/${grading.attemptId}/grade`, { method: "PATCH", body: { grades } });
      const fresh = await api<{ essays: EssayRow[] }>(`/attempts/${grading.attemptId}/grading`);
      setGrading({ ...grading, essays: fresh.essays });
      setGradeDraft(
        Object.fromEntries(fresh.essays.map((essay) => [essay.questionId, essay.score === null ? "" : String(essay.score)])),
      );
      const refreshed = await api<ResultsPayload>(`/exams/${grading.examId}/results`);
      setResults(refreshed);
      setFeedback("Nilai uraian disimpan.");
      window.setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan nilai uraian.");
    } finally {
      setGradingBusy(false);
    }
  }

  async function openResults(exam: Exam) {
    setResultsLoading(true);
    setResults(null);
    setError("");
    try {
      const data = await api<ResultsPayload>(`/exams/${exam.id}/results`);
      setResults(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat hasil ujian.");
    } finally {
      setResultsLoading(false);
    }
  }

  return (
    <div>
      <PageHeading
        title="Ujian & Token"
        description="Setiap ujian punya token sendiri untuk satu kelas dan satu mata pelajaran. Bagikan token saat ujian dimulai."
        action={
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Buat ujian
          </Button>
        }
      />

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      {feedback ? <Alert tone="success" className="mb-4">{feedback}</Alert> : null}

      {exams === null ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat ujian…
        </Card>
      ) : exams.length === 0 ? (
        <Card>
          <EmptyState
            icon={<MonitorPlay className="h-5 w-5" />}
            title="Belum ada ujian"
            description="Buat ujian: pilih kelas, mata pelajaran, dan durasi. Token dibuat otomatis."
            action={
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" /> Buat ujian
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {exams.map((exam) => (
            <Card key={exam.id} className="overflow-hidden">
              <div className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-start gap-x-2 gap-y-1.5">
                  <h3 className="min-w-0 basis-full text-[14.5px] font-bold leading-snug text-slate-800 sm:flex-1 sm:basis-auto sm:truncate">
                    {exam.title}
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {exam.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Ditutup</Badge>}
                    {exam.questionCount === 0 ? (
                      <Badge tone="warning">Soal belum ada</Badge>
                    ) : (
                      <Badge tone="info">{exam.questionCount} soal</Badge>
                    )}
                  </div>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-slate-500">
                  <span className="font-semibold text-slate-600">Kelas {exam.className}</span>
                  <span className="text-slate-300">•</span>
                  <span>{exam.subjectName}</span>
                  <span className="text-slate-300">•</span>
                  <span>{exam.durationMinutes} menit</span>
                  <span className="text-slate-300">•</span>
                  <span>{exam.attemptCount} siswa mengerjakan</span>
                </p>
              </div>

              <div className="border-y border-slate-100 bg-slate-50/70 px-4 py-3 sm:px-5">
                <p className="mb-1.5 flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
                  <KeyRound className="h-3 w-3" /> Token ujian
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyToken(exam)}
                    aria-label={`Salin token ${exam.token}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-left ring-1 ring-slate-200 transition active:scale-[0.99] hover:ring-emerald-300"
                  >
                    <span className="truncate font-mono text-[20px] font-extrabold tracking-[0.18em] text-slate-800 sm:text-[22px]">
                      {exam.token}
                    </span>
                    <span
                      className={cn(
                        "flex shrink-0 items-center gap-1 text-[11.5px] font-bold",
                        copied === exam.id ? "text-emerald-700" : "text-slate-400",
                      )}
                    >
                      {copied === exam.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied === exam.id ? "Tersalin" : "Salin"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      confirm(
                        {
                          title: "Buat token baru?",
                          subject: `${exam.title} · Kelas ${exam.className}`,
                          note: "Token lama langsung tidak berlaku. Siswa yang belum masuk harus memakai token baru ini.",
                          confirmLabel: "Buat token",
                          tone: "primary",
                        },
                        () => patchExam(exam.id, { regenerateToken: true }, "Token baru dibuat."),
                      )
                    }
                    aria-label="Buat token baru"
                    title="Buat token baru"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 ring-1 ring-slate-200 transition hover:text-emerald-700 hover:ring-emerald-300"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 sm:px-5">
                <Link to={`/guru/pantau/${exam.id}`}>
                  <Button size="sm" variant="subtle">
                    <MonitorPlay className="h-3.5 w-3.5" /> Pantau
                  </Button>
                </Link>
                <Button size="sm" variant="secondary" onClick={() => openResults(exam)}>
                  <Trophy className="h-3.5 w-3.5" /> Hasil
                </Button>
                <Link to="/guru/soal" className="hidden sm:inline-flex">
                  <Button size="sm" variant="ghost">
                    <ClipboardCopy className="h-3.5 w-3.5" /> Soal
                  </Button>
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  onClick={() =>
                    patchExam(
                      exam.id,
                      { isActive: !exam.isActive },
                      exam.isActive ? "Ujian ditutup untuk siswa." : "Ujian dibuka untuk siswa.",
                    )
                  }
                >
                  <Power className="h-3.5 w-3.5" /> {exam.isActive ? "Tutup" : "Buka"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-rose-600 hover:bg-rose-50"
                  onClick={() => handleDelete(exam)}
                  aria-label={`Hapus ujian ${exam.title}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-400 sm:px-5">
                Dibuat {formatDateTime(exam.createdAt)}
              </p>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat ujian baru"
        description="Pilih jenis asesmen, kelas, dan mapel. Token dibuat otomatis."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button size="sm" type="submit" form="exam-form" disabled={saving}>
              {saving ? <Spinner /> : <Plus className="h-4 w-4" />} Buat ujian
            </Button>
          </>
        }
      >
        <form id="exam-form" className="space-y-3.5" onSubmit={handleCreate}>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Jenis asesmen</span>
            <div className="grid grid-cols-2 gap-2">
              {EXAM_TITLES.map((option) => {
                const active = form.title === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setForm({ ...form, title: option })}
                    aria-pressed={active}
                    className={cn(
                      "rounded-xl px-3 py-2.5 text-[13px] font-bold ring-1 transition",
                      active
                        ? "bg-emerald-600 text-white ring-emerald-600 shadow-sm shadow-emerald-600/20"
                        : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
            <span className="mt-1 block text-[11.5px] text-slate-500">
              Nama asesmen terisi otomatis — tidak perlu mengetik.
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Kelas">
              <Select
                value={form.classId}
                onChange={(e) => setForm({ ...form, classId: Number(e.target.value) || "" })}
                required
              >
                <option value="">Pilih kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Kelas {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mata pelajaran">
              <Select
                value={form.subjectId}
                onChange={(e) => setForm({ ...form, subjectId: Number(e.target.value) || "" })}
                required
              >
                <option value="">Pilih mapel</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Durasi (menit)" hint="Antara 5 sampai 240 menit.">
              <Input
                type="number"
                min={5}
                max={240}
                value={form.durationMinutes}
                onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
                required
              />
            </Field>
            <Field label="Urutan soal">
              <button
                type="button"
                onClick={() => setForm({ ...form, shuffle: !form.shuffle })}
                className={cn(
                  "flex h-[42px] w-full items-center justify-between rounded-xl px-3 text-[13px] font-semibold ring-1 transition",
                  form.shuffle
                    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : "bg-white text-slate-600 ring-slate-200",
                )}
                aria-pressed={form.shuffle}
              >
                Acak urutan soal
                <span
                  className={cn(
                    "flex h-5 w-9 items-center rounded-full p-0.5 transition",
                    form.shuffle ? "bg-emerald-600" : "bg-slate-300",
                  )}
                >
                  <span
                    className={cn(
                      "h-4 w-4 rounded-full bg-white shadow transition",
                      form.shuffle ? "translate-x-4" : "translate-x-0",
                    )}
                  />
                </span>
              </button>
            </Field>
          </div>
        </form>
      </Modal>

      <Modal
        open={resultsLoading || results !== null}
        onClose={() => setResults(null)}
        wide
        title="Hasil ujian"
        description={results?.exam.title ?? "Memuat hasil…"}
      >
        {resultsLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Memuat hasil…
          </div>
        ) : results ? (
          results.results.length === 0 ? (
            <EmptyState
              icon={<Eye className="h-5 w-5" />}
              title="Belum ada siswa yang mengerjakan"
              description="Hasil muncul setelah siswa mengirim jawaban."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-2 font-semibold">Siswa</th>
                    <th className="pb-2 px-2 font-semibold">Status</th>
                    <th className="pb-2 px-2 font-semibold">Nilai</th>
                    <th className="pb-2 px-2 font-semibold">Uraian</th>
                    <th className="pb-2 px-2 font-semibold">Pelanggaran</th>
                    <th className="pb-2 pl-2 font-semibold">Dikirim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.results.map((row) => (
                    <tr key={row.attemptId}>
                      <td className="py-2.5 pr-2 font-semibold text-slate-800">{row.name}</td>
                      <td className="py-2.5 px-2">
                        {row.status === "selesai" ? <Badge tone="success">Selesai</Badge> : <Badge tone="warning">Mengerjakan</Badge>}
                      </td>
                      <td className="py-2.5 px-2 font-bold text-slate-800">
                        {row.status === "selesai" ? `${row.score ?? 0}/${row.total ?? 0}` : "—"}
                      </td>
                      <td className="py-2.5 px-2">
                        {row.pendingEssays > 0 ? (
                          <Button size="sm" variant="subtle" onClick={() => void openGrading(row, results.exam.id)}>
                            Nilai {row.pendingEssays} uraian
                          </Button>
                        ) : (
                          <Badge tone="success">Beres</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-2">
                        {row.violations > 0 ? <Badge tone="danger">{row.violations}×</Badge> : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="py-2.5 pl-2 text-[12px] text-slate-500">{formatDateTime(row.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </Modal>

      <Modal
        open={grading !== null}
        onClose={() => setGrading(null)}
        wide
        title="Nilai jawaban uraian"
        description={grading ? `Siswa: ${grading.name}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setGrading(null)}>
              Tutup
            </Button>
            <Button size="sm" onClick={() => void saveGrades()} disabled={gradingBusy}>
              {gradingBusy ? <Spinner /> : null} Simpan nilai
            </Button>
          </>
        }
      >
        {grading && grading.essays.length === 0 ? (
          <EmptyState
            icon={<Eye className="h-5 w-5" />}
            title="Tidak ada soal uraian"
            description="Asesmen ini tidak memuat soal uraian yang perlu dinilai manual."
          />
        ) : (
          <div className="space-y-3">
            {grading?.essays.map((essay, essayIndex) => (
              <div key={essay.questionId} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    Uraian {essayIndex + 1} · maks {essay.maxScore}
                  </p>
                  {essay.graded ? <Badge tone="success">Sudah dinilai</Badge> : <Badge tone="warning">Belum dinilai</Badge>}
                </div>
                <RichText html={essay.text} className="mt-1.5 text-[13px] text-slate-700" />
                {essay.answerKey ? (
                  <p className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-emerald-800">
                    <span className="font-bold">Rambu-rambu:</span> {plainText(essay.answerKey)}
                  </p>
                ) : null}
                <div className="mt-2 whitespace-pre-wrap rounded-xl bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-700 ring-1 ring-slate-200">
                  {essay.answer?.trim() ? essay.answer : <span className="text-slate-400">(tidak dijawab)</span>}
                </div>
                <label className="mt-2 flex items-center gap-2 text-[12px] font-semibold text-slate-600">
                  Nilai
                  <input
                    type="number"
                    min={0}
                    max={essay.maxScore}
                    step={0.5}
                    value={gradeDraft[essay.questionId] ?? ""}
                    onChange={(e) => setGradeDraft((current) => ({ ...current, [essay.questionId]: e.target.value }))}
                    placeholder="0"
                    className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-[13px] focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-slate-400">dari {essay.maxScore}</span>
                </label>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
