import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlarmClock,
  ArrowRight,
  BellOff,
  BookOpen,
  CheckCircle2,
  Clock,
  GraduationCap,
  KeyRound,
  Loader2,
  LogOut,
  Maximize,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  Trophy,
} from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { ensureAudio } from "../../lib/alarm";
import { SCHOOL_NAME, SCHOOL_TAGLINE } from "../../lib/brand";
import { Alert, Badge, Button, Card, CardHeader, EmptyState, Input, Modal, Spinner } from "../../components/ui";
import type { AttemptPayload, StudentExam } from "../../lib/types";

export default function StudentHome() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState<StudentExam[] | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<StudentExam | null>(null);
  const [token, setToken] = useState("");
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api<{ exams: StudentExam[] }>("/student/exams");
      setExams(data.exams);
      setError("");
    } catch (err) {
      setExams([]);
      setError(err instanceof ApiError ? err.message : "Gagal memuat daftar ujian.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  async function startExam(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || starting) return;
    setStarting(true);
    setError("");
    try {
      ensureAudio();
      const payload = await api<AttemptPayload>(`/student/exams/${selected.id}/start`, {
        method: "POST",
        body: { token: token.trim().toUpperCase() },
      });
      navigate(`/siswa/ujian/${payload.attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memulai ujian.");
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-600/30">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13.5px] font-bold text-slate-800">{SCHOOL_NAME}</p>
              <p className="truncate text-[11px] text-slate-500">{SCHOOL_TAGLINE}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden text-right sm:block">
              <p className="text-[13px] font-bold text-slate-800">{user?.name}</p>
              <p className="text-[11px] text-slate-500">
                {user?.className ? `Kelas ${user.className}` : "Belum ada kelas"}
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleLogout} aria-label="Keluar">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Keluar</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-800 p-5 text-white shadow-lg shadow-emerald-900/15 sm:p-6">
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-emerald-200">Ruang asesmen siswa</p>
          <h1 className="mt-1 text-xl font-extrabold sm:text-2xl">Assalamualaikum, {user?.name?.split(" ")[0]}</h1>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-emerald-100/85">
            Ujian yang sedang dibuka guru untuk kelas Anda. Tekan Lanjutkan untuk kembali ke layar ujian — jawaban yang
            sudah dipilih tetap tersimpan.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-[11.5px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
              <Maximize className="h-3.5 w-3.5" /> Layar penuh wajib
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
              <BellOff className="h-3.5 w-3.5" /> Alarm bila keluar layar
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 ring-1 ring-white/15">
              <ShieldCheck className="h-3.5 w-3.5" /> Salin-tempel diblokir
            </span>
          </div>
        </div>

        {error ? <Alert tone="danger" className="mt-4">{error}</Alert> : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_300px]">
          <Card>
            <CardHeader
              title="Ujian tersedia"
              description="Ujian untuk kelas Anda yang sedang dibuka guru."
              icon={<BookOpen className="h-4 w-4" />}
              action={<Badge tone="info">{exams?.length ?? 0} ujian</Badge>}
            />
            {exams === null ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat ujian…
              </div>
            ) : exams.length === 0 ? (
              <EmptyState
                icon={<Clock className="h-5 w-5" />}
                title="Belum ada ujian yang dibuka"
                description="Tunggu guru membuka ujian untuk kelas Anda. Halaman ini bisa dimuat ulang kapan saja."
                action={
                  <Button size="sm" variant="secondary" onClick={() => void load()}>
                    Muat ulang
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-slate-100">
                {exams.map((exam) => (
                  <li key={exam.id} className="px-4 py-4 sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[14px] font-bold text-slate-800">{exam.subjectName}</p>
                          {exam.status === "belum" ? (
                            <Badge tone="info">Siap dikerjakan</Badge>
                          ) : exam.status === "mengerjakan" ? (
                            <Badge tone="warning">Sedang mengerjakan</Badge>
                          ) : (
                            <Badge tone="success">Selesai</Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-slate-500">{exam.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" /> {exam.durationMinutes} menit
                          </span>
                          <span className="text-slate-300">•</span>
                          <span>{exam.questionCount} soal</span>
                          {exam.status === "selesai" ? (
                            <>
                              <span className="text-slate-300">•</span>
                              <span className="font-semibold text-emerald-700">
                                Nilai {exam.score ?? 0}/{exam.total ?? 0}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {exam.status === "belum" ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelected(exam);
                              setToken("");
                              setError("");
                              ensureAudio();
                            }}
                          >
                            <PlayCircle className="h-4 w-4" /> Mulai ujian
                          </Button>
                        ) : exam.status === "mengerjakan" && exam.attemptId ? (
                          <Button size="sm" onClick={() => navigate(`/siswa/ujian/${exam.attemptId}`)}>
                            <ArrowRight className="h-4 w-4" /> Lanjutkan
                          </Button>
                        ) : exam.attemptId ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => navigate(`/siswa/hasil/${exam.attemptId}`)}
                          >
                            <Trophy className="h-4 w-4" /> Lihat hasil
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="h-fit">
            <CardHeader title="Tata tertib ujian" icon={<ShieldAlert className="h-4 w-4" />} />
            <ul className="space-y-3 px-4 py-4 text-[12.5px] leading-relaxed text-slate-600">
              {[
                "Masukkan token dari guru sebelum mulai. Token hanya berlaku untuk ujian ini.",
                "Ujian berjalan dalam mode layar penuh. Jangan keluar dari layar penuh.",
                "Jika layar ditutup, berpindah aplikasi, atau jendela ujian tidak aktif, alarm akan berbunyi.",
                "Setiap pelanggaran dicatat dan langsung tampil di panel pemantauan guru Anda.",
                "Jawaban tersimpan otomatis setiap kali Anda memilih opsi.",
                "Waktu berjalan terus walaupun layar tertutup. Kirim jawaban sebelum waktu habis.",
              ].map((rule) => (
                <li key={rule} className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </main>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="Masukkan token ujian"
        description={selected ? `${selected.subjectName} · ${selected.title}` : undefined}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
              Batal
            </Button>
            <Button size="sm" type="submit" form="token-form" disabled={starting}>
              {starting ? <Spinner /> : <KeyRound className="h-4 w-4" />} Masuk ujian
            </Button>
          </>
        }
      >
        <form id="token-form" onSubmit={startExam} className="space-y-3.5">
          <Alert tone="warning" title="Sebelum mulai">
            Ujian akan terbuka dalam layar penuh. Jika Anda menutup layar atau keluar dari ujian, alarm berbunyi dan guru
            menerima peringatan.
          </Alert>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Token dari guru</span>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="Contoh: MTK7A1"
              autoFocus
              autoCapitalize="characters"
              className="text-center font-mono text-lg font-bold tracking-[0.35em]"
              maxLength={12}
              required
            />
          </label>
          <div className="grid grid-cols-2 gap-2 text-[12px] text-slate-600">
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
              <AlarmClock className="h-3.5 w-3.5 text-slate-400" /> {selected?.durationMinutes ?? 0} menit
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-2 ring-1 ring-slate-100">
              <BookOpen className="h-3.5 w-3.5 text-slate-400" /> {selected?.questionCount ?? 0} soal
            </div>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </form>
      </Modal>
    </div>
  );
}
