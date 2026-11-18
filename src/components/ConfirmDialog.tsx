import { useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button, Modal } from "./ui";

export interface ConfirmOptions {
  /** Pertanyaan singkat, mis. "Hapus asesmen?" */
  title: string;
  /** Nama konten yang akan dihapus, ditampilkan tebal. */
  subject?: string;
  /** Akibat dari tindakan ini. */
  note?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Label tombol untuk tindakan yang bukan menghapus, mis. "Reset". */
  tone?: "danger" | "primary";
}

/**
 * Popup konfirmasi untuk tindakan yang merusak (hapus, reset, timpa).
 * Pakai: const { confirm, dialog } = useConfirm(); lalu render {dialog} di halaman.
 */
export function useConfirm() {
  const [state, setState] = useState<{ opts: ConfirmOptions; run: () => Promise<void> | void } | null>(null);
  const [busy, setBusy] = useState(false);

  function confirm(opts: ConfirmOptions, run: () => Promise<void> | void) {
    setState({ opts, run });
  }

  function close() {
    if (busy) return;
    setState(null);
  }

  async function handleConfirm() {
    if (!state) return;
    setBusy(true);
    try {
      await state.run();
      setState(null);
    } finally {
      setBusy(false);
    }
  }

  const opts = state?.opts;
  const danger = (opts?.tone ?? "danger") === "danger";

  const dialog = (
    <Modal
      open={state !== null}
      onClose={close}
      title={opts?.title ?? ""}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={close} disabled={busy}>
            {opts?.cancelLabel ?? "Batal"}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            size="sm"
            onClick={handleConfirm}
            disabled={busy}
            autoFocus
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : danger ? (
              <Trash2 className="h-3.5 w-3.5" />
            ) : null}
            {busy ? "Memproses…" : (opts?.confirmLabel ?? "Hapus")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {opts?.subject ? (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-[13.5px] font-bold text-slate-800 ring-1 ring-slate-200">
            {opts.subject}
          </p>
        ) : null}
        <div
          className={
            danger
              ? "flex items-start gap-2.5 rounded-xl bg-rose-50 p-3 ring-1 ring-rose-100"
              : "flex items-start gap-2.5 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-100"
          }
        >
          <AlertTriangle className={danger ? "mt-0.5 h-4 w-4 shrink-0 text-rose-600" : "mt-0.5 h-4 w-4 shrink-0 text-amber-600"} />
          <p className={danger ? "text-[12.5px] leading-relaxed text-rose-800" : "text-[12.5px] leading-relaxed text-amber-900"}>
            {opts?.note ?? "Tindakan ini tidak bisa dibatalkan."}
          </p>
        </div>
      </div>
    </Modal>
  );

  return { confirm, dialog };
}
