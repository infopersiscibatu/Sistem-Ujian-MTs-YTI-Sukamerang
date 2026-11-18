import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, Loader2, ShieldAlert, Trophy, XCircle } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { Alert, Badge, Button, Card, EmptyState } from "../../components/ui";
import { formatDateTime, formatTime } from "../../lib/format";
import type { AttemptInfo, Violation } from "../../lib/types";
import { violationLabel } from "../../lib/types";

interface ResultPayload {
  attempt: AttemptInfo;
  summary: {
    answered: number;
    total: number;
    score: number;
    maxScore: number;
    percent: number;
    pendingEssays: number;
    violations: number;
  };
  violations: Violation[];
}

export default function StudentResult() {
  const { attemptId } = useParams();
  const navigate = useNavigate();
  const [payload, setPayload] = useState<ResultPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await api<ResultPayload>(`/attempts/${attemptId}/result`);
        if (active) setPayload(data);
      } catch (err) {
        if (active) setError(err instanceof ApiError ? err.message : "Gagal memuat hasil ujian.");
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [attemptId]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <Card className="w-full max-w-md p-6 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-rose-500" />
          <h1 className="mt-3 text-base font-bold text-slate-800">Hasil tidak bisa dibuka</h1>
          <p className="mt-1 text-[13px] text-slate-500">{error}</p>
          <Button className="mt-4 w-full" onClick={() => navigate("/siswa")}>
            Kembali
          </Button>
        </Card>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-slate-50 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" /> Memuat hasil…
      </div>
    );
  }

  const { attempt, summary } = payload;
  const percent = summary.percent ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4 sm:px-6">
          <Button size="sm" variant="ghost" onClick={() => navigate("/siswa")}>
            <ArrowLeft className="h-4 w-4" /> Daftar ujian
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-800 via-emerald-700 to-teal-800 px-5 py-6 text-center text-white sm:px-7">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
              <Trophy className="h-6 w-6" />
            </span>
            <p className="mt-3 text-[11.5px] font-semibold uppercase tracking-wide text-emerald-200">
              Ujian selesai · {attempt.subjectName}
            </p>
            <h1 className="mt-0.5 text-lg font-extrabold sm:text-xl">{attempt.title}</h1>
            <p className="mt-1 text-[12px] text-emerald-100/80">Kelas {attempt.className}</p>

            <div className="mx-auto mt-4 w-fit rounded-2xl bg-white/10 px-6 py-3 ring-1 ring-white/20">
              <p className="font-mono text-4xl font-extrabold tabular-nums">
                {summary.score}
                <span className="text-lg font-bold text-emerald-200">/{summary.maxScore}</span>
              </p>
              <p className="mt-0.5 text-[11.5px] font-semibold text-emerald-100">Nilai {percent}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
            <div className="rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                <CheckCircle2 className="h-3 w-3" /> Skor
              </p>
              <p className="text-xl font-extrabold text-emerald-800">{summary.score}</p>
            </div>
            <div className="rounded-xl bg-rose-50 px-3 py-2.5 ring-1 ring-rose-100">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-rose-700">
                <XCircle className="h-3 w-3" /> Belum dinilai
              </p>
              <p className="text-xl font-extrabold text-rose-800">{summary.pendingEssays}</p>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Terjawab</p>
              <p className="text-xl font-extrabold text-slate-800">
                {summary.answered}
                <span className="text-[12px] font-semibold text-slate-400">/{summary.total}</span>
              </p>
            </div>
            <div className="rounded-xl bg-amber-50 px-3 py-2.5 ring-1 ring-amber-100">
              <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                <ShieldAlert className="h-3 w-3" /> Pelanggaran
              </p>
              <p className="text-xl font-extrabold text-amber-800">{summary.violations}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-3 text-[12px] text-slate-500 sm:px-5">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Mulai {formatTime(attempt.startedAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Dikirim {formatDateTime(attempt.submittedAt)}
            </span>
            <span className="ml-auto">
              {summary.violations > 0 ? (
                <Badge tone="warning">Catatan pelanggaran dikirim ke guru</Badge>
              ) : (
                <Badge tone="success">Ujian dikerjakan tanpa pelanggaran</Badge>
              )}
            </span>
          </div>
        </Card>

        <Card className="mt-4">
          <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
            <h2 className="text-[14px] font-bold text-slate-800">Catatan selama ujian</h2>
          </div>
          {payload.violations.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 className="h-5 w-5" />}
              title="Tidak ada pelanggaran"
              description="Layar ujian tidak pernah ditutup selama pengerjaan. Pertahankan!"
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {payload.violations.map((violation, i) => (
                <li key={violation.id ?? i} className="flex items-start gap-2.5 px-4 py-2.5 sm:px-5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-rose-500" />
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">{violationLabel(violation.type)}</p>
                    <p className="text-[11.5px] text-slate-400">
                      {formatTime(violation.createdAt)}
                      {violation.detail ? ` · ${violation.detail}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {payload.violations.length > 0 ? (
          <Alert tone="warning" className="mt-4">
            Guru Anda melihat catatan pelanggaran ini di panel pemantauan. Hubungi guru jika ada kendala teknis saat
            ujian.
          </Alert>
        ) : null}

        <Button className="mt-5 w-full sm:w-auto" onClick={() => navigate("/siswa")}>
          <ArrowLeft className="h-4 w-4" /> Kembali ke daftar ujian
        </Button>
      </main>
    </div>
  );
}
