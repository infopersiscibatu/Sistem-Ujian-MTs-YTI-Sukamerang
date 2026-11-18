import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BellRing,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  MonitorPlay,
  ShieldAlert,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { playAlertTone } from "../lib/alarm";
import { SCHOOL_NAME } from "../lib/brand";
import { cn } from "../components/ui";
import { violationLabel } from "../lib/types";
import type { RecentViolation } from "../lib/types";

const NAV = [
  { to: "/guru", label: "Dashboard", short: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/guru/soal", label: "Bank Soal", short: "Soal", icon: ClipboardList },
  { to: "/guru/ujian", label: "Ujian & Token", short: "Ujian", icon: MonitorPlay },
  { to: "/guru/pantau", label: "Pemantauan", short: "Pantau", icon: ShieldAlert },
  { to: "/guru/siswa", label: "Siswa & Kelas", short: "Siswa", icon: Users },
];

export default function TeacherLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [toast, setToast] = useState<RecentViolation | null>(null);
  const lastId = useRef(-1);

  useEffect(() => {
    let active = true;
    let timer = 0;

    const tick = async () => {
      try {
        const data = await api<{ violations: RecentViolation[] }>(
          `/violations/recent?since=${Math.max(0, lastId.current)}`,
        );
        if (!active) return;
        const newest = data.violations[0];
        if (lastId.current === -1) {
          lastId.current = newest?.id ?? 0;
        } else if (newest && newest.id > lastId.current) {
          lastId.current = newest.id;
          setToast(newest);
          playAlertTone();
        }
      } catch {
        /* diam saja saat jaringan terganggu */
      }
    };

    void tick();
    timer = window.setInterval(tick, 7000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 9000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function handleLogout() {
    await logout();
    navigate("/guru-login", { replace: true });
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm shadow-emerald-900/30">
          <GraduationCap className="h-5 w-5" />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="text-[12.5px] font-bold text-white">Asesmen Sumatif Akhir</p>
          <p className="mt-0.5 text-[10.5px] text-emerald-200/70">{SCHOOL_NAME}</p>
        </div>
      </div>

      <nav className="mt-2 flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition",
                isActive
                  ? "bg-white/12 text-white ring-1 ring-white/10"
                  : "text-emerald-100/70 hover:bg-white/5 hover:text-white",
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-3 pb-3">
        <div className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-300/80">Masuk sebagai</p>
          <p className="mt-1 truncate text-[13px] font-bold text-white">{user?.name ?? "Guru"}</p>
          <p className="truncate text-[11px] text-emerald-100/60">@{user?.username}</p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5 text-[12px] font-semibold text-white transition hover:bg-rose-500/90"
          >
            <LogOut className="h-3.5 w-3.5" /> Keluar
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-gradient-to-b from-emerald-950 via-emerald-900 to-teal-950 lg:block">
        {sidebar}
      </aside>

      <div className="min-w-0 lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-600 text-white lg:hidden">
                <GraduationCap className="h-4 w-4" />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-bold text-slate-800">Panel Admin</p>
                <p className="truncate text-[11px] text-slate-500">{SCHOOL_NAME}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => navigate("/guru/pantau")}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1.5 text-[11.5px] font-semibold text-slate-600 transition hover:bg-slate-200"
                aria-label="Buka pemantauan"
              >
                <BellRing className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Notifikasi aktif</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 lg:hidden"
                aria-label="Keluar"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl px-3 pb-24 pt-4 sm:px-6 sm:pt-6 lg:pb-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[10px] font-bold transition",
                  isActive ? "text-emerald-700" : "text-slate-400",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className={cn("h-5 w-5", isActive ? "stroke-[2.4]" : "stroke-[1.8]")} />
                  <span>{item.short}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {toast ? (
        <div className="fixed bottom-20 left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 lg:bottom-6">
          <div className="alarm-shake overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-2xl shadow-rose-900/20">
            <div className="flex items-start gap-3 bg-rose-600 px-4 py-2.5 text-white">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-rose-100">Pelanggaran ujian</p>
                <p className="truncate text-[13.5px] font-bold">{toast.studentName}</p>
              </div>
              <button type="button" onClick={() => setToast(null)} aria-label="Tutup notifikasi">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-[13px] font-semibold text-slate-800">{violationLabel(toast.type)}</p>
              <p className="mt-0.5 text-[12px] text-slate-500">
                {toast.examTitle}
                {toast.className ? ` · Kelas ${toast.className}` : ""}
              </p>
              <button
                type="button"
                onClick={() => {
                  setToast(null);
                  navigate(`/guru/pantau?exam=${toast.examId ?? ""}`);
                }}
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[12px] font-bold text-rose-700 ring-1 ring-rose-100 transition hover:bg-rose-100"
              >
                <MonitorPlay className="h-3.5 w-3.5" /> Buka pemantauan
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2.5 sm:mb-5 sm:gap-3">
      <div className="min-w-0">
        <h1 className="text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-slate-500 sm:text-[13px]">{description}</p>
        ) : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}
