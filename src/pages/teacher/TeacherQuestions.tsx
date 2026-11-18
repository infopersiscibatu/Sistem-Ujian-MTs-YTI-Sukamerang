import { useCallback, useEffect, useState } from "react";
import { ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeading } from "../../components/TeacherLayout";
import { useConfirm } from "../../components/ConfirmDialog";
import RichEditor from "../../components/RichEditor";
import RichText, { plainText } from "../../components/RichText";
import { pickImage, uploadImage } from "../../lib/media";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
  Textarea,
  cn,
} from "../../components/ui";
import { QUESTION_TYPE_HINTS, QUESTION_TYPE_LABELS } from "../../lib/types";
import type { ClassRow, MatchPair, Question, QuestionOption, QuestionType, SubjectRow } from "../../lib/types";

interface FormState {
  type: QuestionType;
  text: string;
  weight: string;
  options: QuestionOption[];
  pairs: MatchPair[];
  bsAnswer: "benar" | "salah";
  answerKey: string;
}

const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 7)}`;

function defaultOptions(count = 4): QuestionOption[] {
  return Array.from({ length: count }, () => ({
    id: newId("o"),
    text: "",
    image: null,
    correct: false,
    weight: 1,
  }));
}

function emptyForm(type: QuestionType = "pg"): FormState {
  return {
    type,
    text: "",
    weight: "1",
    options: type === "pg" || type === "pgk" ? defaultOptions(4) : defaultOptions(4),
    pairs: [
      { id: newId("p"), left: "", right: "", weight: 1 },
      { id: newId("p"), left: "", right: "", weight: 1 },
    ],
    bsAnswer: "benar",
    answerKey: "",
  };
}

function formFromQuestion(question: Question): FormState {
  return {
    type: question.type,
    text: question.text,
    weight: String(question.weight ?? 1),
    options:
      question.options && question.options.length
        ? question.options.map((o) => ({ ...o, weight: o.weight ?? 1 }))
        : defaultOptions(4),
    pairs:
      question.pairs && question.pairs.length
        ? question.pairs.map((p) => ({ ...p, weight: p.weight ?? 1 }))
        : [
            { id: newId("p"), left: "", right: "", weight: 1 },
            { id: newId("p"), left: "", right: "", weight: 1 },
          ],
    bsAnswer: question.options?.find((o) => o.correct)?.id === "salah" ? "salah" : "benar",
    answerKey: question.answerKey ?? "",
  };
}

const sum = (list: Array<{ weight?: number }>) => list.reduce((total, item) => total + (Number(item.weight) || 0), 0);

export default function TeacherQuestions() {
  const { confirm, dialog } = useConfirm();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [subjectId, setSubjectId] = useState<number | "">("");
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Question | null>(null);
  const [step, setStep] = useState<"type" | "form">("type");
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [classData, subjectData, examData] = await Promise.all([
          api<{ classes: ClassRow[] }>("/classes"),
          api<{ subjects: SubjectRow[] }>("/subjects"),
          api<{ exams: Array<{ classId: number; subjectId: number }> }>("/exams"),
        ]);
        setClasses(classData.classes);
        setSubjects(subjectData.subjects);

        let last: { classId?: number; subjectId?: number } = {};
        try {
          last = JSON.parse(localStorage.getItem("guru.soal.filter") ?? "{}") as {
            classId?: number;
            subjectId?: number;
          };
        } catch {
          last = {};
        }

        const newest = examData.exams[0];
        const nextClass =
          (last.classId && classData.classes.some((c) => c.id === last.classId) ? last.classId : 0) ||
          newest?.classId ||
          classData.classes[0]?.id;
        const nextSubject =
          (last.subjectId && subjectData.subjects.some((s) => s.id === last.subjectId) ? last.subjectId : 0) ||
          newest?.subjectId ||
          subjectData.subjects[0]?.id;

        if (nextClass) setClassId(nextClass);
        if (nextSubject) setSubjectId(nextSubject);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Gagal memuat data kelas dan mapel.");
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (classId && subjectId) {
      localStorage.setItem("guru.soal.filter", JSON.stringify({ classId, subjectId }));
    }
  }, [classId, subjectId]);

  const loadQuestions = useCallback(async () => {
    if (!classId || !subjectId) return;
    setQuestions(null);
    try {
      const data = await api<{ questions: Question[] }>(`/questions?classId=${classId}&subjectId=${subjectId}`);
      setQuestions(data.questions);
      setError("");
    } catch (err) {
      setQuestions([]);
      setError(err instanceof ApiError ? err.message : "Gagal memuat soal.");
    }
  }, [classId, subjectId]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setStep("type");
    setEditOpen(true);
  }

  function openEdit(question: Question) {
    setEditing(question);
    setForm(formFromQuestion(question));
    setStep("form");
    setEditOpen(true);
  }

  function patch(next: Partial<FormState>) {
    setForm((current) => ({ ...current, ...next }));
  }

  function patchOption(index: number, next: Partial<QuestionOption>) {
    setForm((current) => ({
      ...current,
      options: current.options.map((option, i) => (i === index ? { ...option, ...next } : option)),
    }));
  }

  function patchPair(index: number, next: Partial<MatchPair>) {
    setForm((current) => ({
      ...current,
      pairs: current.pairs.map((pair, i) => (i === index ? { ...pair, ...next } : pair)),
    }));
  }

  async function chooseOptionImage(index: number) {
    const file = await pickImage();
    if (!file) return;
    setUploadingIndex(index);
    setError("");
    try {
      const url = await uploadImage(file);
      patchOption(index, { image: url });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal mengunggah gambar.");
    } finally {
      setUploadingIndex(null);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !classId || !subjectId) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        type: form.type,
        text: form.text,
        weight: Number(String(form.weight).replace(",", ".")) || 1,
        options: form.options,
        pairs: form.pairs,
        bsAnswer: form.bsAnswer,
        answerKey: form.answerKey,
      };
      if (editing) {
        await api(`/questions/${editing.id}`, { method: "PATCH", body });
        setFeedback("Soal berhasil diperbarui.");
      } else {
        await api("/questions", { method: "POST", body: { ...body, classId, subjectId } });
        setFeedback("Soal baru ditambahkan.");
      }
      setEditOpen(false);
      await loadQuestions();
      window.setTimeout(() => setFeedback(""), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menyimpan soal.");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(question: Question) {
    const preview = plainText(question.text).slice(0, 90) || "Soal bergambar";
    confirm(
      {
        title: "Hapus soal?",
        subject: preview,
        note: "Soal ini dihapus dari bank soal dan tidak bisa dikembalikan.",
        confirmLabel: "Hapus soal",
      },
      async () => {
        try {
          await api(`/questions/${question.id}`, { method: "DELETE" });
          setFeedback("Soal dihapus.");
          await loadQuestions();
          window.setTimeout(() => setFeedback(""), 4000);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Gagal menghapus soal.");
        }
      },
    );
  }

  const selectedClass = classes.find((c) => c.id === classId);
  const selectedSubject = subjects.find((s) => s.id === subjectId);
  const totalWeight = form.type === "pgk" ? sum(form.options.filter((o) => o.correct)) : form.type === "match" ? sum(form.pairs) : Number(form.weight) || 0;

  return (
    <div>
      <PageHeading
        title="Bank Soal"
        description="Soal disusun per kelas dan per mata pelajaran, dengan lima jenis soal, gambar, dan bobot nilai."
        action={
          <Button size="sm" onClick={openCreate} disabled={!classId || !subjectId}>
            <Plus className="h-4 w-4" /> Buat soal
          </Button>
        }
      />

      {error && !editOpen ? (
        <Alert tone="danger" className="mb-4">
          {error}
        </Alert>
      ) : null}
      {feedback ? (
        <Alert tone="success" className="mb-4">
          {feedback}
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Filter" description="Pilih kelas dan mata pelajaran." />
          <div className="space-y-3 p-4">
            <Field label="Kelas">
              <Select value={classId} onChange={(e) => setClassId(Number(e.target.value) || "")}>
                <option value="">Pilih kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Kelas {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Mata pelajaran">
              <Select value={subjectId} onChange={(e) => setSubjectId(Number(e.target.value) || "")}>
                <option value="">Pilih mapel</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="rounded-xl bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-500 ring-1 ring-slate-100">
              {questions && selectedClass && selectedSubject
                ? `${questions.length} soal untuk Kelas ${selectedClass.name} · ${selectedSubject.name}`
                : "Pilih kelas dan mapel untuk melihat daftar soal."}
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Daftar soal"
            description={selectedClass && selectedSubject ? `Kelas ${selectedClass.name} · ${selectedSubject.name}` : undefined}
          />
          {questions === null ? (
            <div className="flex items-center justify-center py-16 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : questions.length === 0 ? (
            <EmptyState
              icon={<Plus className="h-5 w-5" />}
              title="Belum ada soal"
              description="Buat soal pertama: pilih jenis soal, tulis pertanyaan, atur bobot, dan simpan."
              action={
                <Button size="sm" onClick={openCreate} disabled={!classId || !subjectId}>
                  <Plus className="h-4 w-4" /> Buat soal
                </Button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {questions.map((question, index) => {
                const correct = question.options?.filter((o) => o.correct) ?? [];
                return (
                  <li key={question.id} className="px-4 py-3.5 sm:px-5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-slate-100 text-[11.5px] font-bold text-slate-600">
                          {index + 1}
                        </span>
                        <Badge tone="violet">{QUESTION_TYPE_LABELS[question.type]}</Badge>
                        <Badge tone="info">Bobot {question.maxScore}</Badge>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(question)}
                          aria-label="Ubah soal"
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(question)}
                          aria-label="Hapus soal"
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 max-h-28 overflow-hidden">
                      <RichText html={question.text} className="text-[13px]" />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500">
                      {(question.type === "pg" || question.type === "pgk") && correct.length ? (
                        <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          Kunci: {correct.map((o) => plainText(o.text) || "gambar").join(", ").slice(0, 60)}
                        </span>
                      ) : null}
                      {question.type === "bs" ? (
                        <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          Kunci: {correct[0]?.id === "salah" ? "Salah" : "Benar"}
                        </span>
                      ) : null}
                      {question.type === "match" ? (
                        <span className="rounded-lg bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          {question.pairs.length} pasangan
                        </span>
                      ) : null}
                      {question.type === "essay" ? (
                        <span className="rounded-lg bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 ring-1 ring-amber-100">
                          Dinilai manual
                        </span>
                      ) : null}
                      {(question.type === "pg" || question.type === "pgk") && (
                        <span>{question.options.length} pilihan</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        wide
        title={editing ? "Ubah soal" : step === "type" ? "Pilih jenis soal" : `Soal ${QUESTION_TYPE_LABELS[form.type]}`}
        description={
          step === "type"
            ? "Lima jenis soal tersedia. Pilih satu, lalu isi pertanyaannya."
            : QUESTION_TYPE_HINTS[form.type]
        }
        footer={
          step === "form" ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => (editing ? setEditOpen(false) : setStep("type"))}>
                {editing ? "Batal" : "Ganti jenis"}
              </Button>
              <Button size="sm" type="submit" form="question-form" disabled={saving}>
                {saving ? <Spinner /> : <Plus className="h-4 w-4" />} {editing ? "Simpan perubahan" : "Simpan soal"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => setEditOpen(false)}>
              Batal
            </Button>
          )
        }
      >
        {step === "type" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => {
                  setForm(emptyForm(type));
                  setStep("form");
                }}
                className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
              >
                <p className="text-[13.5px] font-bold text-slate-800">{QUESTION_TYPE_LABELS[type]}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-slate-500">{QUESTION_TYPE_HINTS[type]}</p>
              </button>
            ))}
          </div>
        ) : (
          <form id="question-form" className="space-y-4" onSubmit={handleSave}>
            {error ? <Alert tone="danger">{error}</Alert> : null}

            <div>
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Pertanyaan</span>
              <RichEditor
                value={form.text}
                onChange={(html) => patch({ text: html })}
                placeholder="Tulis soal di sini. Gunakan tombol gambar untuk menyisipkan foto."
              />
            </div>

            {(form.type === "pg" || form.type === "pgk") && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-slate-700">Pilihan jawaban</span>
                  <span className="text-[11.5px] text-slate-500">
                    {form.type === "pg" ? "Pilih satu kunci jawaban" : "Pilih minimal dua kunci jawaban"}
                  </span>
                </div>
                <div className="space-y-2">
                  {form.options.map((option, index) => (
                    <div
                      key={option.id}
                      className={cn(
                        "rounded-xl border p-2.5 transition",
                        option.correct ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              options: current.options.map((o, i) =>
                                i === index
                                  ? { ...o, correct: current.type === "pg" ? !o.correct : !o.correct }
                                  : current.type === "pg"
                                    ? { ...o, correct: false }
                                    : o,
                              ),
                            }))
                          }
                          aria-label={`Tandai kunci jawaban ${index + 1}`}
                          aria-pressed={option.correct}
                          className={cn(
                            "mt-1 flex h-5 w-5 shrink-0 items-center justify-center transition",
                            form.type === "pg" ? "rounded-full" : "rounded-md",
                            option.correct
                              ? "bg-emerald-600 text-white ring-emerald-600"
                              : "bg-white ring-1 ring-slate-300 hover:ring-emerald-400",
                          )}
                        >
                          {option.correct ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
                        </button>

                        <div className="min-w-0 flex-1 space-y-2">
                          <Input
                            value={option.text}
                            onChange={(e) => patchOption(index, { text: e.target.value })}
                            placeholder={`Pilihan ${String.fromCharCode(65 + index)}`}
                            className="h-9 py-1 text-[13px]"
                          />

                          {option.image ? (
                            <div className="relative inline-flex">
                              <img
                                src={option.image}
                                alt={`Gambar pilihan ${index + 1}`}
                                className="h-16 w-auto rounded-lg ring-1 ring-slate-200"
                              />
                              <button
                                type="button"
                                onClick={() => patchOption(index, { image: null })}
                                aria-label="Hapus gambar pilihan"
                                className="absolute -right-2 -top-2 rounded-full bg-white p-0.5 text-rose-600 shadow ring-1 ring-slate-200"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : null}

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void chooseOptionImage(index)}
                              disabled={uploadingIndex === index}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-[11.5px] font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-60"
                            >
                              {uploadingIndex === index ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <ImagePlus className="h-3.5 w-3.5" />
                              )}
                              {option.image ? "Ganti gambar" : "Gambar"}
                            </button>

                            {form.type === "pgk" ? (
                              <label className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
                                Bobot
                                <input
                                  type="number"
                                  min={0.5}
                                  step={0.5}
                                  value={option.weight ?? 1}
                                  onChange={(e) => patchOption(index, { weight: Number(e.target.value) })}
                                  className="h-7 w-16 rounded-lg border border-slate-200 px-2 text-[12px] focus:border-emerald-500 focus:outline-none"
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>

                        {form.options.length > 2 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                options: current.options.filter((_, i) => i !== index),
                              }))
                            }
                            aria-label={`Hapus pilihan ${index + 1}`}
                            className="mt-1 rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setForm((current) =>
                        current.options.length >= 8
                          ? current
                          : {
                              ...current,
                              options: [
                                ...current.options,
                                { id: newId("o"), text: "", image: null, correct: false, weight: 1 },
                              ],
                            },
                      )
                    }
                    disabled={form.options.length >= 8}
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah pilihan
                  </Button>
                  <span className="text-[11.5px] text-slate-500">Maksimal 8 pilihan</span>
                </div>
              </div>
            )}

            {form.type === "bs" && (
              <div>
                <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Kunci jawaban</span>
                <div className="grid grid-cols-2 gap-2">
                  {(["benar", "salah"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => patch({ bsAnswer: value })}
                      aria-pressed={form.bsAnswer === value}
                      className={cn(
                        "rounded-xl px-3 py-2.5 text-[13px] font-bold capitalize ring-1 transition",
                        form.bsAnswer === value
                          ? "bg-emerald-600 text-white ring-emerald-600"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                      )}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.type === "match" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[13px] font-semibold text-slate-700">Pasangan</span>
                  <span className="text-[11.5px] text-slate-500">Kolom kanan diacak saat ujian</span>
                </div>
                <div className="space-y-2">
                  {form.pairs.map((pair, index) => (
                    <div key={pair.id} className="flex items-start gap-2 rounded-xl border border-slate-200 p-2.5">
                      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                        <Input
                          value={pair.left}
                          onChange={(e) => patchPair(index, { left: e.target.value })}
                          placeholder={`Kiri ${index + 1}`}
                          className="h-9 py-1 text-[13px]"
                        />
                        <Input
                          value={pair.right}
                          onChange={(e) => patchPair(index, { right: e.target.value })}
                          placeholder={`Pasangan kanan ${index + 1}`}
                          className="h-9 py-1 text-[13px]"
                        />
                      </div>
                      <label className="mt-1.5 flex shrink-0 items-center gap-1 text-[11.5px] font-semibold text-slate-600">
                        Bobot
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={pair.weight ?? 1}
                          onChange={(e) => patchPair(index, { weight: Number(e.target.value) })}
                          className="h-7 w-14 rounded-lg border border-slate-200 px-1.5 text-[12px] focus:border-emerald-500 focus:outline-none"
                        />
                      </label>
                      {form.pairs.length > 2 ? (
                        <button
                          type="button"
                          onClick={() =>
                            setForm((current) => ({ ...current, pairs: current.pairs.filter((_, i) => i !== index) }))
                          }
                          aria-label={`Hapus pasangan ${index + 1}`}
                          className="mt-1 rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mt-2"
                  onClick={() =>
                    setForm((current) =>
                      current.pairs.length >= 8
                        ? current
                        : { ...current, pairs: [...current.pairs, { id: newId("p"), left: "", right: "", weight: 1 }] },
                    )
                  }
                  disabled={form.pairs.length >= 8}
                >
                  <Plus className="h-3.5 w-3.5" /> Tambah pasangan
                </Button>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {form.type === "pgk" || form.type === "match" ? (
                <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Bobot soal</p>
                  <p className="mt-0.5 text-[15px] font-extrabold text-slate-800">{Math.round(totalWeight * 100) / 100}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-slate-500">
                    {form.type === "pgk" ? "Jumlah bobot kunci jawaban." : "Jumlah bobot semua pasangan."}
                  </p>
                </div>
              ) : (
                <Field label="Bobot nilai" hint="Nilai maksimal untuk soal ini.">
                  <Input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={form.weight}
                    onChange={(e) => patch({ weight: e.target.value })}
                    required
                  />
                </Field>
              )}

              {form.type === "essay" ? (
                <Field label="Rambu-rambu penilaian" hint="Hanya dilihat guru saat menilai.">
                  <Textarea
                    value={form.answerKey}
                    onChange={(e) => patch({ answerKey: e.target.value })}
                    placeholder="Contoh: jawaban benar memuat 3 poin utama…"
                    rows={3}
                  />
                </Field>
              ) : (
                <div className="hidden sm:block" />
              )}
            </div>
          </form>
        )}
      </Modal>

      {dialog}
    </div>
  );
}
