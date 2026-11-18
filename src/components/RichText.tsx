import { useMemo } from "react";
import DOMPurify from "dompurify";
import { cn } from "./ui";

/** Menampilkan teks soal (HTML dari editor) dengan aman. */
export default function RichText({ html, className }: { html: string; className?: string }) {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html ?? "", {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["style", "script", "iframe", "form"],
        FORBID_ATTR: ["style", "onerror", "onclick"],
      }),
    [html],
  );

  return <div className={cn("rich-text", className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}

/** Teks polos dari HTML — untuk ringkasan daftar soal. */
export function plainText(html: string): string {
  return String(html || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}
