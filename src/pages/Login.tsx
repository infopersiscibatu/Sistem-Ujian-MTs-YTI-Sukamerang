import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { GraduationCap, KeyRound, Loader2, Users } from "lucide-react";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import { APP_NAME, SCHOOL_NAME } from "../lib/brand";
import { Alert, Button, Spinner, cn } from "../components/ui";

interface ClassOption {
  id: number;
  name: string;
}

interface StudentOption {
  id: number;
  name: string;
}

const selectClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-[15px] text-slate-800 shadow-sm transition focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10 disabled:bg-slate-50 disabled:text-slate-400";

export default function Login() {
  const navigate = useNavigate();
  const { studentLogin } = useAuth();

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [students, setStudents] = useState<StudentOption[]>([]);
  const [classId, setClassId] = useState<number | "">("");
  const [studentId, setStudentId] = useState<number | "">("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<{ classes: ClassOption[] }>("/public/classes");
        setClasses(data.classes);
      } catch {
        setError("Gagal memuat daftar kelas. Muat ulang halaman ini.");
      }
    };
    void load();
  }, []);

  useEffect(() => {
    if (!classId) {
      setStudents([]);
      setStudentId("");
      return;
    }
    let active = true;
    setLoadingStudents(true);
    setStudentId("");
    const load = async () => {
      try {
        const data = await api<{ students: StudentOption[] }>(`/public/students?classId=${classId}`);
        if (active) setStudents(data.students);
      } catch {
        if (active) setError("Gagal memuat daftar nama siswa.");
      } finally {
        if (active) setLoadingStudents(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [classId]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!classId || !studentId) {
      setError("Pilih kelas dan nama Anda terlebih dahulu.");
      return;
    }
    if (!token.trim()) {
      setError("Token ujian wajib diisi.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await studentLogin(classId, studentId, token.trim().toUpperCase());
      navigate(
        result.status === "selesai" ? `/siswa/hasil/${result.attemptId}` : `/siswa/ujian/${result.attemptId}`,
        { replace: true },
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal masuk. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-100 px-4 py-8">
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-emerald-200/40 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-28 -right-20 h-80 w-80 rounded-full bg-teal-200/40 blur-3xl"
        aria-hidden
      />

      <div className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl shadow-slate-900/5 sm:p-6">
          <div className="text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/25">
              <GraduationCap className="h-6 w-6" />
            </span>
            <h1 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[24px]">
              {APP_NAME}
            </h1>
            <p className="mt-1 text-[12.5px] font-semibold text-emerald-700">{SCHOOL_NAME}</p>
          </div>

          <div className="my-4 h-px bg-slate-100" />

          <form className="space-y-3.5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Kelas</span>
              <select
                value={classId}
                onChange={(e) => {
                  setClassId(Number(e.target.value) || "");
                  setError("");
                }}
                className={selectClass}
                aria-label="Pilih kelas"
                required
              >
                <option value="">Pilih kelas</option>
                {classes.map((kelas) => (
                  <option key={kelas.id} value={kelas.id}>
                    Kelas {kelas.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Nama</span>
              <div className="relative">
                <select
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(Number(e.target.value) || "");
                    setError("");
                  }}
                  className={cn(selectClass, "appearance-none pr-9")}
                  aria-label="Pilih nama"
                  disabled={!classId || loadingStudents}
                  required
                >
                  <option value="">
                    {!classId
                      ? "Pilih kelas dulu"
                      : loadingStudents
                        ? "Memuat nama…"
                        : students.length === 0
                          ? "Belum ada siswa di kelas ini"
                          : "Pilih nama Anda"}
                  </option>
                  {students.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.name}
                    </option>
                  ))}
                </select>
                <Users className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Token ujian</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={token}
                  onChange={(e) => {
                    setToken(e.target.value.toUpperCase());
                    setError("");
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={12}
                  placeholder="Contoh: MTK7A1"
                  required
                  aria-label="Token ujian"
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-3 text-center font-mono text-[15px] font-bold tracking-[0.25em] text-slate-800 uppercase shadow-sm transition placeholder:font-sans placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
              <span className="mt-1 block text-[11.5px] text-slate-400">Token diberikan guru saat ujian dimulai.</span>
            </label>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Membuka ujian…" : "Masuk ujian"}
            </Button>

            {busy ? (
              <p className="flex items-center justify-center gap-1.5 text-center text-[11.5px] text-slate-400">
                <Spinner className="h-3 w-3" /> Menyiapkan layar ujian
              </p>
            ) : null}
          </form>
        </div>

        <p className="mt-4 text-center text-[12px] text-slate-500">
          Admin madrasah?{" "}
          <Link to="/guru-login" className="font-bold text-emerald-700 hover:text-emerald-800">
            Masuk di sini
          </Link>
        </p>
      </div>
    </div>
  );
}
