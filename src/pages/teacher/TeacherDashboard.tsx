import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Loader2,
  MonitorPlay,
  Plus,
  ShieldAlert,
  Users,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PageHeading } from "../../components/TeacherLayout";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, StatCard } from "../../components/ui";
import { formatDateTime, relativeTime } from "../../lib/format";
import type { Exam, RecentViolation } from "../../lib/types";
import { violationLabel } from "../../lib/types";

interface Overview {
  stats: {
    students: number;
    classes: number;
    subjects: number;
    exams: number;
    activeExams: number;
    ongoingAttempts: number;
    violations24h: number;
  };
  recentViolations: RecentViolation[];
  exams: Exam[];
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const result = await api<Overview>("/overview");
        if (active) {
          setData(result);
          setError("");
        }
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "Gagal memuat dashboard.");
      }
    };
    void load();
    const timer = window.setInterval(load, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const today = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <PageHeading
        title="Assalamualaikum"
        description={`${user?.name ?? "Ustadz"} · ${today}`}
        action={
          <>
            <Link to="/guru/ujian">
              <Button size="sm">
                <Plus className="h-4 w-4" /> Buat ujian
              </Button>
            </Link>
            <Link to="/guru/pantau">
              <Button size="sm" variant="secondary">
                <ShieldAlert className="h-4 w-4" /> Pemantauan
              </Button>
            </Link>
          </>
        }
      />

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}

      {!data ? (
        <Card className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Siswa" value={data.stats.students} icon={<Users className="h-5 w-5" />} tone="emerald" />
            <StatCard
              label="Kelas"
              value={data.stats.classes}
              icon={<GraduationCap className="h-5 w-5" />}
              tone="sky"
              hint={`${data.stats.subjects} mata pelajaran`}
            />
            <StatCard
              label="Ujian aktif"
              value={data.stats.activeExams}
              icon={<MonitorPlay className="h-5 w-5" />}
              tone="violet"
              hint={`${data.stats.exams} ujian total`}
            />
            <StatCard
              label="Mengerjakan"
              value={data.stats.ongoingAttempts}
              icon={<Activity className="h-5 w-5" />}
              tone="amber"
              hint={`${data.stats.violations24h} pelanggaran 24 jam`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader
                title="Ujian terbaru"
                description="Token ini dipakai siswa saat masuk ujian."
                icon={<FileText className="h-4 w-4" />}
                action={
                  <Link to="/guru/ujian" className="text-[12.5px] font-bold text-emerald-700 hover:text-emerald-800">
                    Kelola ujian
                  </Link>
                }
              />
              {data.exams.length === 0 ? (
                <EmptyState
                  icon={<ClipboardList className="h-5 w-5" />}
                  title="Belum ada ujian"
                  description="Buat ujian pertama Anda: pilih kelas, mata pelajaran, dan durasi."
                  action={
                    <Link to="/guru/ujian">
                      <Button size="sm">
                        <Plus className="h-4 w-4" /> Buat ujian
                      </Button>
                    </Link>
                  }
                />
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.exams.map((exam) => (
                    <div key={exam.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-bold text-slate-800" title={exam.title}>
                            {exam.title}
                          </p>
                          <p className="mt-0.5 truncate text-[11.5px] text-slate-500">
                            Kelas {exam.className} · {exam.subjectName} · {exam.questionCount} soal ·{" "}
                            {exam.durationMinutes} menit
                          </p>
                        </div>
                        {exam.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Ditutup</Badge>}
                      </div>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-[12px] font-bold tracking-[0.18em] text-slate-700">
                          {exam.token}
                        </span>
                        <Link
                          to={`/guru/pantau/${exam.id}`}
                          className="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700 hover:text-emerald-800"
                        >
                          Pantau <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Pelanggaran terbaru"
                description="Siswa yang keluar dari layar ujian."
                icon={<ShieldAlert className="h-4 w-4" />}
                action={
                  <Link to="/guru/pantau" className="text-[12.5px] font-bold text-emerald-700 hover:text-emerald-800">
                    Lihat
                  </Link>
                }
              />
              {data.recentViolations.length === 0 ? (
                <EmptyState
                  icon={<ShieldAlert className="h-5 w-5" />}
                  title="Belum ada pelanggaran"
                  description="Sistem akan mencatat dan memberi tahu Anda saat siswa meninggalkan layar ujian."
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentViolations.map((v) => (
                    <li key={v.id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                        <ShieldAlert className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-bold text-slate-800">{v.studentName}</p>
                        <p className="truncate text-[12px] text-slate-500">{violationLabel(v.type)}</p>
                        <p className="mt-0.5 truncate text-[11.5px] text-slate-400">
                          {v.examTitle} · {relativeTime(v.createdAt)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Langkah cepat"
              description="Alur singkat menyiapkan ujian sampai dipantau."
              icon={<BookOpen className="h-4 w-4" />}
            />
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 sm:p-5">
              {[
                { to: "/guru/soal", icon: ClipboardList, title: "1. Siapkan soal", text: "Tulis soal per kelas dan mata pelajaran." },
                { to: "/guru/ujian", icon: MonitorPlay, title: "2. Buat ujian + token", text: "Tentukan durasi dan bagikan token ke siswa." },
                { to: "/guru/pantau", icon: ShieldAlert, title: "3. Pantau langsung", text: "Lihat progres, alarm, dan pelanggaran siswa." },
              ].map((step) => (
                <Link
                  key={step.to}
                  to={step.to}
                  className="group rounded-xl border border-slate-200 p-3.5 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <step.icon className="h-5 w-5 text-emerald-600" />
                  <p className="mt-2 text-[13px] font-bold text-slate-800">{step.title}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{step.text}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-emerald-700">
                    Buka <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </Card>

          <p className="flex items-center gap-1.5 px-1 text-[11.5px] text-slate-400">
            <CalendarDays className="h-3.5 w-3.5" /> Terakhir diperbarui {formatDateTime(new Date().toISOString())} ·
            data diperbarui otomatis setiap 15 detik.
          </p>
        </div>
      )}
    </div>
  );
}
