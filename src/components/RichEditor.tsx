import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const Impl = lazy(() => import("./rich/RichEditorImpl"));

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  height?: number;
}

/**
 * Editor teks kaya (Jodit) untuk menulis soal dan mengunggah gambar.
 * Dimuat terpisah supaya halaman siswa tetap ringan.
 */
export default function RichEditor(props: Props) {
  return (
    <Suspense
      fallback={
        <div className="flex h-40 items-center justify-center rounded-xl bg-slate-50 text-[12.5px] text-slate-400 ring-1 ring-slate-200">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyiapkan editor…
        </div>
      }
    >
      <Impl {...props} />
    </Suspense>
  );
}
