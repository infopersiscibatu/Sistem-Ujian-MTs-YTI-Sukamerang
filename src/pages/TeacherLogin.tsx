import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, GraduationCap, KeyRound, Loader2, ShieldCheck, User } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import { SCHOOL_NAME } from "../lib/brand";
import { Alert, Button } from "../components/ui";

export default function TeacherLogin() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const user = await login(username.trim(), password, "guru");
      if (user.role !== "guru") {
        setError("Akun ini bukan akun guru.");
        setBusy(false);
        return;
      }
      navigate("/guru", { replace: true });
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
              <ShieldCheck className="h-6 w-6" />
            </span>
            <h1 className="mt-3 text-[22px] font-extrabold leading-tight tracking-tight text-slate-900 sm:text-[24px]">
              Panel Admin
            </h1>
            <p className="mt-1 text-[12.5px] font-semibold text-emerald-700">{SCHOOL_NAME}</p>
          </div>

          <div className="my-4 h-px bg-slate-100" />

          <form className="space-y-3.5" onSubmit={handleSubmit}>
            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Username</span>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoCapitalize="none"
                  autoComplete="username"
                  placeholder="username guru"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[13px] font-semibold text-slate-700">Password</span>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error ? <Alert tone="danger">{error}</Alert> : null}

            <Button type="submit" size="lg" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Memeriksa akun…" : "Masuk panel admin"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-[12px] text-slate-500">
          <Link to="/login" className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800">
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke login siswa
          </Link>
        </p>
        <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-slate-400">
          <GraduationCap className="h-3.5 w-3.5" /> {SCHOOL_NAME}
        </p>
      </div>
    </div>
  );
}
