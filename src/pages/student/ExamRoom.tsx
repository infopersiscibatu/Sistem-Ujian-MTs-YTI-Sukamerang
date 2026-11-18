import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Maximize,
  Minus,
  Send,
  ShieldAlert,
  ShieldCheck,
  Siren,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { ensureAudio, playSiren } from "../../lib/alarm";
import { formatClock } from "../../lib/format";
import {
  Alert,
  Badge,
  Button,
  Card,
  Modal,
  Spinner,
  cn,
} from "../../components/ui";
import RichText, { plainText } from "../../components/RichText";
import type {
  AttemptPayload,
  ExamQuestion,
  QuestionAnswer,
} from "../../lib/types";
import { QUESTION_TYPE_LABELS, violationLabel } from "../../lib/types";

function emptyAnswer(): QuestionAnswer {
  return { selected: [], matches: {}, text: "" };
}

function hasAnswer(answer?: QuestionAnswer): boolean {
  if (!answer) return false;
  return (
    (answer.selected?.length ?? 0) > 0 ||
    Object.keys(answer.matches ?? {}).length > 0 ||
    String(answer.text ?? "").trim().length > 0
  );
}

export default function ExamRoom() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState<AttemptPayload | null>(null);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [armed, setArmed] = useState(false);
  const [alarm, setAlarm] = useState<{ type: string; count: number } | null>(
    null,
  );
  const [violationCount, setViolationCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveError, setSaveError] = useState("");
  const essayTimer = useRef<number | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const lastViolationAt = useRef(0);
  const submittingRef = useRef(false);
  const finishedRef = useRef(false);
  const alarmTimer = useRef(0);
  const submitRef = useRef<(auto?: boolean) => void>(() => undefined);
  const remainingRef = useRef(0);

  /* ------------------------------ muat ujian ------------------------------ */

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const payload = await api<AttemptPayload>(`/attempts/${attemptId}`);
        if (!active) return;
        if (payload.attempt.status === "selesai") {
          navigate(`/siswa/hasil/${attemptId}`, { replace: true });
          return;
        }
        setData(payload);
        setViolationCount(payload.violations.length);
        const endsAt = new Date(payload.attempt.endsAt).getTime();
        const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
        setRemaining(left);
        remainingRef.current = left;
      } catch (err) {
        if (active)
          setError(
            err instanceof ApiError ? err.message : "Gagal memuat ujian.",
          );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [attemptId, navigate]);

  /* -------------------------------- submit -------------------------------- */

  const submit = useCallback(
    async (auto = false) => {
      if (!attemptId || submittingRef.current) return;
      submittingRef.current = true;
      finishedRef.current = true;
      setSubmitting(true);
      setConfirmOpen(false);
      try {
        await api(`/attempts/${attemptId}/submit`, { method: "POST" });
        if (document.fullscreenElement) {
          await document.exitFullscreen().catch(() => undefined);
        }
        navigate(`/siswa/hasil/${attemptId}`, { replace: true });
      } catch (err) {
        submittingRef.current = false;
        finishedRef.current = false;
        setSubmitting(false);
        if (!auto)
          setError(
            err instanceof ApiError ? err.message : "Gagal mengirim jawaban.",
          );
      }
    },
    [attemptId, navigate],
  );

  useEffect(() => {
    submitRef.current = (auto = false) => {
      void submit(auto);
    };
  }, [submit]);

  /* --------------------------------- timer -------------------------------- */

  useEffect(() => {
    if (!data || !armed) return;
    const timer = window.setInterval(() => {
      const endsAt = new Date(data.attempt.endsAt).getTime();
      const left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      remainingRef.current = left;
      setRemaining(left);
      if (left <= 0) {
        window.clearInterval(timer);
        submitRef.current(true);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [data, armed]);

  /* ---------------------------- lapor pelanggaran -------------------------- */

  const reportViolation = useCallback(
    async (type: string, detail?: string) => {
      if (!attemptId || finishedRef.current) return;
      const now = Date.now();
      if (now - lastViolationAt.current < 2200) return;
      lastViolationAt.current = now;

      setAlarm({ type, count: violationCount + 1 });
      playSiren(6);
      window.clearTimeout(alarmTimer.current);
      alarmTimer.current = window.setTimeout(() => setAlarm(null), 12000);

      try {
        const result = await api<{ count: number }>(
          `/attempts/${attemptId}/violation`,
          {
            method: "POST",
            body: { type, detail },
          },
        );
        setViolationCount(result.count);
        setAlarm({ type, count: result.count });
      } catch {
        /* alarm tetap berbunyi walau jaringan terputus */
      }
    },
    [attemptId, violationCount],
  );

  /* ------------------------- proteksi layar ujian -------------------------- */

  useEffect(() => {
    if (!armed || !data || finishedRef.current) return;

    const onVisibility = () => {
      if (document.hidden) {
        void reportViolation(
          "tab_hidden",
          "Siswa menutup layar atau berpindah tab/aplikasi.",
        );
      }
    };
    const onBlur = () => {
      void reportViolation("window_blur", "Jendela ujian tidak lagi aktif.");
    };
    const onFullscreen = () => {
      if (!document.fullscreenElement) {
        void reportViolation(
          "fullscreen_exit",
          "Siswa keluar dari mode layar penuh.",
        );
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const mod = event.ctrlKey || event.metaKey;
      if (mod && ["c", "v", "x", "a", "p", "s", "u"].includes(key)) {
        event.preventDefault();
      }
      if (
        key === "f12" ||
        (mod && event.shiftKey && ["i", "j", "c"].includes(key))
      ) {
        event.preventDefault();
        void reportViolation("other", "Mencoba membuka alat pengembang.");
      }
    };
    const block = (event: Event) => event.preventDefault();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    document.addEventListener("fullscreenchange", onFullscreen);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    document.addEventListener("contextmenu", block);
    document.addEventListener("copy", block);
    document.addEventListener("cut", block);
    document.addEventListener("paste", block);
    document.addEventListener("selectstart", block);
    document.addEventListener("dragstart", block);
    document.body.classList.add("exam-lock");

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (finishedRef.current) return;
      event.preventDefault();
      event.returnValue = "";
      void reportViolation("page_exit", "Mencoba menutup halaman ujian.");
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    let wakeLock: { release: () => Promise<void> } | null = null;
    const lock = (
      navigator as unknown as {
        wakeLock?: {
          request: (t: string) => Promise<{ release: () => Promise<void> }>;
        };
      }
    ).wakeLock;
    if (lock) {
      lock
        .request("screen")
        .then((sentinel) => {
          wakeLock = sentinel;
        })
        .catch(() => undefined);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("fullscreenchange", onFullscreen);
      window.removeEventListener("keydown", onKeyDown, {
        capture: true,
      } as EventListenerOptions);
      document.removeEventListener("contextmenu", block);
      document.removeEventListener("copy", block);
      document.removeEventListener("cut", block);
      document.removeEventListener("paste", block);
      document.removeEventListener("selectstart", block);
      document.removeEventListener("dragstart", block);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.body.classList.remove("exam-lock");
      wakeLock?.release().catch(() => undefined);
    };
  }, [armed, data, reportViolation]);

  /* --------------------------------- aksi --------------------------------- */

  async function armExam() {
    ensureAudio();
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* sebagian browser HP tidak mengizinkan layar penuh */
    }
    setArmed(true);
  }

  async function continueExam() {
    setAlarm(null);
    try {
      if (!document.fullscreenElement)
        await document.documentElement.requestFullscreen();
    } catch {
      /* abaikan */
    }
  }

  async function postAnswer(
    questionId: number,
    patch: Partial<QuestionAnswer>,
  ) {
    try {
      await api(`/attempts/${attemptId}/answer`, {
        method: "POST",
        body: { questionId, ...patch },
      });
      setSavedAt(Date.now());
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        void submit(true);
        return;
      }
      setSaveError(
        err instanceof ApiError
          ? err.message
          : "Jawaban gagal disimpan. Coba lagi.",
      );
    }
  }

  async function saveAnswer(
    questionId: number,
    patch: Partial<QuestionAnswer>,
  ) {
    if (!data) return;
    setSaveError("");
    setData((current) => {
      if (!current) return current;
      const prev = current.answers[String(questionId)] ?? emptyAnswer();
      return {
        ...current,
        answers: {
          ...current.answers,
          [String(questionId)]: { ...prev, ...patch },
        },
      };
    });
    await postAnswer(questionId, patch);
  }

  function updateEssay(questionId: number, text: string) {
    setData((current) => {
      if (!current) return current;
      const prev = current.answers[String(questionId)] ?? emptyAnswer();
      return {
        ...current,
        answers: {
          ...current.answers,
          [String(questionId)]: { ...prev, text },
        },
      };
    });
    if (essayTimer.current) window.clearTimeout(essayTimer.current);
    essayTimer.current = window.setTimeout(() => {
      void postAnswer(questionId, { text });
    }, 700);
  }

  const answeredCount = useMemo(
    () =>
      data
        ? data.questions.filter((q) => hasAnswer(data.answers[String(q.id)]))
            .length
        : 0,
    [data],
  );

  function renderAnswerArea(item: ExamQuestion) {
    const answer = data?.answers[String(item.id)] ?? emptyAnswer();
    const type = item.type ?? "pg";
    const options = item.options ?? [];

    if (type === "essay") {
      return (
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-slate-500">
            Tulis jawaban Anda. Jawaban ini dinilai oleh guru.
          </p>
          <textarea
            value={answer.text ?? ""}
            onChange={(e) => updateEssay(item.id, e.target.value)}
            rows={7}
            maxLength={5000}
            placeholder="Tulis jawaban di sini…"
            aria-label={`Jawaban uraian soal ${index + 1}`}
            className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[14px] leading-relaxed text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
          />
          <p className="mt-1 text-[11px] text-slate-400">
            {(answer.text ?? "").length} karakter · tersimpan otomatis
          </p>
        </div>
      );
    }

    if (type === "match") {
      const rights = item.rights ?? [];
      return (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-slate-500">
            Pilih pasangan yang tepat untuk setiap pernyataan.
          </p>
          {(item.pairs ?? []).map((pair, pairIndex) => (
            <div
              key={pair.id}
              className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
            >
              <div className="flex items-start gap-2">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[11px] font-bold text-slate-600">
                  {pairIndex + 1}
                </span>
                <RichText
                  html={pair.text}
                  className="text-[13.5px] font-semibold"
                />
              </div>
              <select
                value={answer.matches?.[pair.id] ?? ""}
                onChange={(e) =>
                  void saveAnswer(item.id, {
                    matches: {
                      ...(answer.matches ?? {}),
                      [pair.id]: e.target.value,
                    },
                  })
                }
                aria-label={`Pasangan untuk pernyataan ${pairIndex + 1}`}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Pilih pasangan…</option>
                {rights.map((right) => (
                  <option key={right.id} value={right.id}>
                    {plainText(right.text)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }

    const multi = type === "pgk";
    const selectedIds = answer.selected ?? [];

    return (
      <div>
        <p className="mb-2 text-[12px] font-semibold text-slate-500">
          {multi
            ? "Pilih semua jawaban yang benar (bisa lebih dari satu)."
            : type === "bs"
              ? "Pilih Benar atau Salah."
              : "Pilih satu jawaban."}
        </p>
        <div
          className={cn(
            type === "bs" ? "grid grid-cols-2 items-start gap-2" : "space-y-2",
          )}
        >
          {options.map((option, optionIndex) => {
            const selected = selectedIds.includes(option.id);
            const label =
              type === "bs"
                ? option.id === "benar"
                  ? "B"
                  : "S"
                : String.fromCharCode(65 + optionIndex);
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  if (!multi) {
                    void saveAnswer(item.id, { selected: [option.id] });
                    return;
                  }
                  const next = selected
                    ? selectedIds.filter((id) => id !== option.id)
                    : [...selectedIds, option.id];
                  void saveAnswer(item.id, { selected: next });
                }}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-start gap-3 rounded-xl px-3.5 py-3 text-left transition ring-1",
                  selected
                    ? "bg-emerald-50 ring-emerald-300 shadow-sm"
                    : "bg-white ring-slate-200 hover:bg-slate-50 hover:ring-slate-300",
                  type === "bs" &&
                    "flex-col items-center gap-1 py-4 text-center",
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center text-[12px] font-bold",
                    type === "pgk" ? "rounded-md" : "rounded-lg",
                    selected
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-100 text-slate-500",
                    type === "bs" && "h-8 w-8 text-[14px]",
                  )}
                >
                  {label}
                </span>
                <span className="min-w-0 flex-1">
                  <RichText
                    html={option.text}
                    className={cn(
                      "text-[14px] leading-relaxed",
                      selected ? "text-emerald-900" : "text-slate-700",
                      type === "bs" && "text-center font-bold",
                    )}
                  />
                  {option.image ? (
                    <img
                      src={option.image}
                      alt=""
                      className="mt-2 max-h-52 w-auto rounded-lg ring-1 ring-slate-200"
                    />
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  /* -------------------------------- render -------------------------------- */

  if (error && !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-rose-500" />
          <h1 className="mt-3 text-base font-bold text-slate-800">
            Ujian tidak bisa dibuka
          </h1>
          <p className="mt-1 text-[13px] text-slate-500">{error}</p>
          <Button
            className="mt-4 w-full"
            onClick={() => navigate("/siswa", { replace: true })}
          >
            Kembali ke daftar ujian
          </Button>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Menyiapkan ujian…
      </div>
    );
  }

  const question = data.questions[index];
  const total = data.questions.length;
  const danger = remaining <= 300;

  if (!armed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 p-4">
        <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                Mode ujian terkunci
              </p>
              <p className="text-[15px] font-extrabold text-slate-900">
                {data.attempt.subjectName}
              </p>
            </div>
          </div>

          <h1 className="mt-4 text-lg font-bold text-slate-800">
            {data.attempt.title}
          </h1>
          <p className="mt-1 text-[12.5px] text-slate-500">
            Kelas {data.attempt.className} · {data.attempt.durationMinutes}{" "}
            menit · {total} soal
          </p>

          <ul className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3.5 text-[12.5px] text-slate-600 ring-1 ring-slate-100">
            <li className="flex items-start gap-2">
              <Maximize className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              Ujian terbuka dalam layar penuh dan layar tetap menyala.
            </li>
            <li className="flex items-start gap-2">
              <Siren className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
              Menutup layar atau keluar dari layar penuh membunyikan alarm.
            </li>
            <li className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
              Guru menerima notifikasi setiap pelanggaran secara langsung.
            </li>
          </ul>

          <Button
            size="lg"
            className="mt-5 w-full"
            onClick={() => void armExam()}
          >
            <Maximize className="h-4 w-4" /> Mulai & aktifkan layar penuh
          </Button>
          <p className="mt-2 text-center text-[11px] text-slate-400">
            Suara alarm memakai perangkat ini. Pastikan volume tidak nol.
          </p>
          <button
            type="button"
            onClick={() => navigate("/siswa")}
            className="mt-3 block w-full text-center text-[12px] font-semibold text-slate-500 hover:text-slate-700"
          >
            Batalkan dan kembali
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 pb-24">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2.5 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-extrabold text-slate-800">
              {data.attempt.subjectName}
            </p>
            <p className="truncate text-[11.5px] text-slate-500">
              {data.attempt.title} · Kelas {data.attempt.className}
            </p>
          </div>
          <div
            className={cn(
              "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono text-[15px] font-extrabold tabular-nums ring-1",
              danger
                ? "bg-rose-50 text-rose-700 ring-rose-200"
                : "bg-slate-100 text-slate-800 ring-slate-200",
            )}
            aria-label="Sisa waktu"
          >
            <Clock className="h-4 w-4" />
            {formatClock(remaining)}
          </div>
          {violationCount > 0 ? (
            <Badge tone="danger" className="hidden sm:inline-flex">
              <ShieldAlert className="h-3 w-3" /> {violationCount} pelanggaran
            </Badge>
          ) : null}
          <Button
            size="sm"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
          >
            {submitting ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Kirim jawaban</span>
          </Button>
        </div>

        <div className="mx-auto flex max-w-5xl gap-1.5 overflow-x-auto px-3 pb-2 lg:hidden">
          {data.questions.map((item, itemIndex) => {
            const answered = hasAnswer(data.answers[String(item.id)]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setIndex(itemIndex)}
                aria-label={`Soal ${itemIndex + 1}`}
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[12px] font-bold ring-1 transition",
                  itemIndex === index
                    ? "bg-slate-900 text-white ring-slate-900"
                    : answered
                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                      : "bg-white text-slate-500 ring-slate-200",
                )}
              >
                {itemIndex + 1}
              </button>
            );
          })}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-4 sm:px-6 sm:py-6">
        {saveError ? (
          <Alert tone="danger" className="mb-3">
            {saveError}
          </Alert>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_250px]">
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
              <span className="text-[12px] font-bold uppercase tracking-wide text-slate-500">
                Soal {index + 1} dari {total}
              </span>
              <span className="flex items-center gap-1.5 text-[11.5px] text-slate-400">
                {savedAt ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{" "}
                    Tersimpan otomatis
                  </>
                ) : (
                  <>
                    <BookOpen className="h-3.5 w-3.5" />{" "}
                    {QUESTION_TYPE_LABELS[question?.type ?? "pg"]}
                  </>
                )}
              </span>
            </div>

            <div className="px-4 py-5 sm:px-5">
              {question ? (
                <>
                  <RichText
                    html={question.text}
                    className="text-[15px] font-medium"
                  />
                  <div className="mt-4">{renderAnswerArea(question)}</div>
                </>
              ) : (
                <p className="text-[14px] text-slate-500">
                  Soal ini tidak tersedia.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setIndex((i) => Math.max(0, i - 1))}
                disabled={index === 0}
              >
                <ArrowLeft className="h-4 w-4" /> Sebelumnya
              </Button>
              <div className="flex items-center gap-1.5 whitespace-nowrap text-[12px] text-slate-500">
                <span className="font-bold text-emerald-700">
                  {answeredCount}
                </span>
                /{total} terjawab
              </div>
              {index < total - 1 ? (
                <Button
                  size="sm"
                  onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
                >
                  Berikutnya <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button size="sm" onClick={() => setConfirmOpen(true)}>
                  Selesai <CheckCircle2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </Card>

          <div className="hidden lg:block">
            <Card className="sticky top-20 p-3.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                Navigasi soal
              </p>
              <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                {data.questions.map((item, itemIndex) => {
                  const answered = hasAnswer(data.answers[String(item.id)]);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setIndex(itemIndex)}
                      aria-label={`Soal ${itemIndex + 1}`}
                      className={cn(
                        "flex h-8 items-center justify-center rounded-lg text-[12px] font-bold ring-1 transition",
                        itemIndex === index
                          ? "bg-slate-900 text-white ring-slate-900"
                          : answered
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-white text-slate-500 ring-slate-200 hover:bg-slate-50",
                      )}
                    >
                      {itemIndex + 1}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3 text-[11.5px] text-slate-500">
                <p className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded bg-emerald-500" /> Sudah
                  dijawab
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded bg-slate-200" /> Belum
                  dijawab
                </p>
                <p className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded bg-slate-900" /> Soal
                  aktif
                </p>
              </div>
              <Button
                className="mt-3 w-full"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={submitting}
              >
                <Send className="h-3.5 w-3.5" /> Kirim jawaban
              </Button>
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Sisa waktu {formatClock(remaining)}
              </p>
            </Card>
          </div>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-2 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
          >
            <Minus className="h-4 w-4" /> Kembali
          </Button>
          <span className="text-[12px] font-semibold text-slate-500">
            {answeredCount}/{total} terjawab
          </span>
          {index < total - 1 ? (
            <Button
              size="sm"
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
            >
              Lanjut <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => setConfirmOpen(true)}>
              Kirim <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Kirim jawaban dan selesaikan ujian?"
        description="Setelah dikirim, jawaban tidak bisa diubah lagi."
        footer={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setConfirmOpen(false)}
            >
              Periksa lagi
            </Button>
            <Button
              size="sm"
              onClick={() => void submit(false)}
              disabled={submitting}
            >
              {submitting ? <Spinner /> : <Send className="h-4 w-4" />} Ya,
              kirim jawaban
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-2 text-[13px]">
          <div className="rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Terjawab
            </p>
            <p className="text-xl font-extrabold text-emerald-800">
              {answeredCount}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Belum dijawab
            </p>
            <p className="text-xl font-extrabold text-slate-700">
              {total - answeredCount}
            </p>
          </div>
        </div>
        {violationCount > 0 ? (
          <Alert tone="warning" className="mt-3">
            Tercatat {violationCount} pelanggaran pada ujian ini dan sudah
            dikirim ke guru Anda.
          </Alert>
        ) : null}
      </Modal>

      {alarm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/90 p-4 backdrop-blur-sm">
          <div className="alarm-shake w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
            <span className="alarm-ring mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-600 text-white">
              <AlertTriangle className="h-8 w-8" />
            </span>
            <h2 className="mt-4 text-lg font-extrabold text-rose-700">
              Layar ujian terdeteksi ditutup!
            </h2>
            <p className="mt-1 text-[13px] text-slate-600">
              {violationLabel(alarm.type)}
            </p>
            <p className="mt-2 text-[12.5px] text-slate-500">
              Alarm dibunyikan dan guru Anda sudah menerima notifikasi
              pelanggaran ke-{alarm.count}. Kembali ke layar penuh untuk
              melanjutkan ujian.
            </p>
            <Button
              size="lg"
              className="mt-4 w-full"
              onClick={() => void continueExam()}
            >
              <Maximize className="h-4 w-4" /> Kembali ke ujian
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
