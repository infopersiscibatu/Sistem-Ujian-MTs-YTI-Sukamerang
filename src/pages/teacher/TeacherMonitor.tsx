import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  CheckCircle2,
  Clock,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  UserX,
  Users,
  Wifi,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeading } from "../../components/TeacherLayout";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Select,
  StatCard,
  cn,
} from "../../components/ui";
import { formatClock, formatTime, relativeTime } from "../../lib/format";
import type { Exam, MonitorStudent, RecentViolation } from "../../lib/types";
import { violationLabel } from "../../lib/types";

interface MonitorPayload {
  exam: Exam & { questionCount: number };
  students: MonitorStudent[];
  violations: RecentViolation[];
  serverTime: string;
}

const STATUS_LABEL: Record<string, string> = {
  belum: "Belum mulai",
  mengerjakan: "Mengerjakan",
  selesai: "Selesai",
};

function remainingSeconds(student: MonitorStudent, durationMinutes: number, now: number): number | null {
  if (student.status !== "mengerjakan" || !student.startedAt) return null;
  return Math.max(0, (new Date(student.startedAt).getTime() + durationMinutes * 60_000 - now) / 1000);
}

function StatusBadge({ status }: { status: MonitorStudent["status"] }) {
  if (status === "mengerjakan") {
    return (
      <Badge tone="warning">
        <Activity className="h-3 w-3" /> Mengerjakan
      </Badge>
    );
  }
  if (status === "selesai") {
    return (
      <Badge tone="success">
        <CheckCircle2 className="h-3 w-3" /> Selesai
      </Badge>
    );
  }
  return <Badge tone="neutral">{STATUS_LABEL[status]}</Badge>;
}

export default function TeacherMonitor() {
  const { confirm, dialog } = useConfirm();
  const { examId } = useParams();
  const [searchParams] = useSearchParams();
  const [exams, setExams] = useState<Exam[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<RecentViolation | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastViolationId = useRef(0);

  useEffect(() => {
    const load = async () => {
      try {
        const result = await api<{ exams: Exam[] }>("/exams");
        setExams(result.exams);
        const fromUrl = Number(examId || searchParams.get("exam")) || 0;
        const initial = result.exams.find((e) => e.id === fromUrl)?.id ?? result.exams[0]?.id ?? null;
        setSelected((current) => current ?? initial);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Gagal memuat daftar ujian.");
      }
    };
    void load();
  }, [examId, searchParams]);

  const fetchMonitor = useCallback(async (id: number) => {
    const payload = await api<MonitorPayload>(`/exams/${id}/monitor`);
    setData(payload);
    const newest = payload.violations[0];
    if (lastViolationId.current === 0) {
      lastViolationId.current = newest?.id ?? 0;
    } else if (newest && newest.id > lastViolationId.current) {
      lastViolationId.current = newest.id;
      setBanner(newest);
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    lastViolationId.current = 0;
    setLoading(true);
    const tick = async () => {
      try {
        await fetchMonitor(selected);
        if (active) setError("");
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "Gagal memuat pemantauan.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void tick();
    const timer = window.setInterval(tick, 3000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [selected, fetchMonitor]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!banner) return;
    const timer = window.setTimeout(() => setBanner(null), 12000);
    return () => window.clearTimeout(timer);
  }, [banner]);

  function handleReset(student: MonitorStudent) {
    if (!student.attemptId) return;
    const attemptId = student.attemptId;
    confirm(
      {
        title: "Reset asesmen siswa?",
        subject: student.name,
        note: "Jawaban siswa akan dihapus dan ia bisa mengulang asesmen dengan token yang sama. Tindakan ini tidak bisa dibatalkan.",
        confirmLabel: "Reset asesmen",
        tone: "danger",
      },
      async () => {
        try {
          await api(`/attempts/${attemptId}/reset`, { method: "POST" });
          if (selected) await fetchMonitor(selected);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Gagal mereset asesmen siswa.");
        }
      },
    );
  }

  const stats = data
    ? {
        total: data.students.length,
        working: data.students.filter((s) => s.status === "mengerjakan").length,
        done: data.students.filter((s) => s.status === "selesai").length,
        notStarted: data.students.filter((s) => s.status === "belum").length,
        violations: data.students.reduce((sum, s) => sum + s.violations, 0),
      }
    : null;

  const examQuestions = data?.exam.questionCount ?? 0;

  return (
    <div>
      <PageHeading
        title="Pemantauan Ujian"
        description="Data diperbarui setiap 3 detik. Alarm di layar siswa dan peringatan di panel ini tercatat otomatis."
        action={
          <div className="flex items-center gap-2">
            <Badge tone="success" className="h-7 px-3">
              <Wifi className="h-3 w-3" /> Langsung
            </Badge>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => selected && fetchMonitor(selected)}
              disabled={!selected}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Muat ulang
            </Button>
          </div>
        }
      />

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}

      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[240px] flex-1">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Pilih ujian yang dipantau</span>
            <Select
              value={selected ?? ""}
              onChange={(e) => {
                const id = Number(e.target.value) || null;
                setSelected(id);
                setData(null);
              }}
            >
              <option value="">Pilih ujian</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} · Kelas {exam.className} · {exam.subjectName}
                </option>
              ))}
            </Select>
          </label>
          {data ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">Kelas {data.exam.className}</Badge>
              <Badge tone="violet">{data.exam.subjectName}</Badge>
              <Badge tone="neutral">{data.exam.durationMinutes} menit</Badge>
              <Badge tone="neutral">{examQuestions} soal</Badge>
              <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[12px] font-bold tracking-[0.2em] text-slate-700">
                {data.exam.token}
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      {banner ? (
        <div className="alarm-shake mb-4 overflow-hidden rounded-xl border border-rose-200 bg-rose-50">
          <div className="flex items-start gap-3 px-4 py-3">
            <span className="alarm-ring mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white">
              <ShieldAlert className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-extrabold text-rose-900">
                {banner.studentName} · {violationLabel(banner.type)}
              </p>
              <p className="text-[12.5px] text-rose-700">
                {formatTime(banner.createdAt)} · {banner.detail || "Siswa keluar dari layar ujian."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {exams.length === 0 && !loading ? (
        <Card>
          <EmptyState
            icon={<ShieldAlert className="h-5 w-5" />}
            title="Belum ada ujian untuk dipantau"
            description="Buat ujian terlebih dahulu di menu Ujian & Token."
          />
        </Card>
      ) : !data ? (
        <Card className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Memuat pemantauan…
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Total siswa" value={stats?.total ?? 0} icon={<Users className="h-5 w-5" />} tone="sky" />
            <StatCard
              label="Mengerjakan"
              value={stats?.working ?? 0}
              icon={<Activity className="h-5 w-5" />}
              tone="amber"
            />
            <StatCard
              label="Selesai"
              value={stats?.done ?? 0}
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone="emerald"
            />
            <StatCard label="Belum mulai" value={stats?.notStarted ?? 0} icon={<UserX className="h-5 w-5" />} tone="violet" />
            <StatCard
              label="Pelanggaran"
              value={stats?.violations ?? 0}
              icon={<ShieldAlert className="h-5 w-5" />}
              tone="rose"
              hint="layar tertutup / keluar ujian"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
            <Card className="overflow-hidden">
              <CardHeader
                title="Status siswa"
                description={`Kelas ${data.exam.className} · ${data.exam.subjectName}`}
                icon={<Users className="h-4 w-4" />}
              />
              {data.students.length === 0 ? (
                <EmptyState
                  icon={<Users className="h-5 w-5" />}
                  title="Belum ada siswa di kelas ini"
                  description="Tambahkan siswa di menu Siswa & Kelas."
                />
              ) : (
                <>
                  <ul className="divide-y divide-slate-100 lg:hidden">
                    {data.students.map((student) => {
                      const remaining = remainingSeconds(student, data.exam.durationMinutes, now);
                      const percent = examQuestions ? Math.min(100, (student.answered / examQuestions) * 100) : 0;
                      return (
                        <li
                          key={student.studentId}
                          className={cn(
                            "px-4 py-3",
                            student.violations > 0 && student.status === "mengerjakan" && "bg-rose-50/40",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-bold text-slate-800">{student.name}</p>
                              <p className="mt-0.5 text-[11px] text-slate-400">
                                {student.status === "belum"
                                  ? "Belum mulai"
                                  : `Mulai ${formatTime(student.startedAt)}`}
                                {remaining !== null ? ` · sisa ${formatClock(remaining)}` : ""}
                              </p>
                            </div>
                            <StatusBadge status={student.status} />
                          </div>

                          <div className="mt-2 flex items-center gap-2">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
                            </div>
                            <span className="shrink-0 text-[11px] font-semibold text-slate-500">
                              {student.answered}/{examQuestions}
                            </span>
                            {student.violations > 0 ? (
                              <Badge tone="danger">
                                <ShieldAlert className="h-3 w-3" /> {student.violations}×
                              </Badge>
                            ) : null}
                            {student.status === "selesai" ? (
                              <span className="shrink-0 text-[12px] font-bold text-slate-800">
                                {student.score ?? 0}
                                <span className="text-[10px] font-medium text-slate-400">/{student.total ?? 0}</span>
                              </span>
                            ) : null}
                            {student.attemptId ? (
                              <button
                                type="button"
                                onClick={() => handleReset(student)}
                                aria-label={`Reset ujian ${student.name}`}
                                className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="hidden overflow-x-auto lg:block">
                    <table className="w-full text-left text-[13px]">
                      <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">Siswa</th>
                          <th className="px-3 py-2.5 font-semibold">Status</th>
                          <th className="px-3 py-2.5 font-semibold">Progres</th>
                          <th className="px-3 py-2.5 font-semibold">Pelanggaran</th>
                          <th className="px-3 py-2.5 font-semibold">Mulai</th>
                          <th className="px-3 py-2.5 font-semibold">Nilai</th>
                          <th className="px-4 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.students.map((student) => {
                          const remaining = remainingSeconds(student, data.exam.durationMinutes, now);
                          return (
                            <tr
                              key={student.studentId}
                              className={cn(
                                "transition",
                                student.violations > 0 && student.status === "mengerjakan" && "bg-rose-50/40",
                              )}
                            >
                              <td className="px-4 py-2.5">
                                <p className="whitespace-nowrap font-semibold text-slate-800">{student.name}</p>
                                <p className="text-[11.5px] text-slate-400">@{student.username}</p>
                              </td>
                              <td className="whitespace-nowrap px-3 py-2.5">
                                <StatusBadge status={student.status} />
                                {remaining !== null ? (
                                  <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                                    <Clock className="h-3 w-3" /> sisa {formatClock(remaining)}
                                  </p>
                                ) : null}
                              </td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className="h-full rounded-full bg-emerald-500 transition-all"
                                      style={{
                                        width: `${examQuestions ? Math.min(100, (student.answered / examQuestions) * 100) : 0}%`,
                                      }}
                                    />
                                  </div>
                                  <span className="text-[11.5px] font-semibold text-slate-500">
                                    {student.answered}/{examQuestions}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-2.5">
                                {student.violations > 0 ? (
                                  <div>
                                    <Badge tone="danger">
                                      <ShieldAlert className="h-3 w-3" /> {student.violations}×
                                    </Badge>
                                    <p className="mt-1 text-[11px] text-slate-400">
                                      {relativeTime(student.lastViolationAt)}
                                    </p>
                                  </div>
                                ) : (
                                  <span className="text-[12px] text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-[12px] text-slate-500">
                                {formatTime(student.startedAt)}
                              </td>
                              <td className="px-3 py-2.5">
                                {student.status === "selesai" ? (
                                  <span className="font-bold text-slate-800">
                                    {student.score ?? 0}
                                    <span className="text-[11px] font-medium text-slate-400">
                                      /{student.total ?? 0}
                                    </span>
                                  </span>
                                ) : (
                                  <span className="text-[12px] text-slate-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                {student.attemptId ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleReset(student)}
                                    aria-label={`Reset ujian ${student.name}`}
                                    title="Reset ujian siswa"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Card>

            <Card className="h-fit">
              <CardHeader
                title="Riwayat pelanggaran"
                description="Alarm berbunyi di perangkat siswa setiap kali tercatat."
                icon={<ShieldAlert className="h-4 w-4" />}
              />
              {data.violations.length === 0 ? (
                <EmptyState
                  icon={<ShieldAlert className="h-5 w-5" />}
                  title="Belum ada pelanggaran"
                  description="Siswa yang menutup layar atau keluar dari mode layar penuh akan muncul di sini."
                />
              ) : (
                <ul className="max-h-[520px] divide-y divide-slate-100 overflow-y-auto">
                  {data.violations.map((v) => (
                    <li key={v.id} className="flex items-start gap-2.5 px-4 py-2.5">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-bold text-slate-800">{v.studentName}</p>
                        <p className="text-[12px] text-slate-600">{violationLabel(v.type)}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatTime(v.createdAt)} · {relativeTime(v.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {dialog}
    </div>
  );
}
