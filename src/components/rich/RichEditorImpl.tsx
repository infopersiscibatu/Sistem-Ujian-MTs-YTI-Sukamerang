import { useEffect, useMemo, useRef, useState } from "react";
import JoditEditor from "jodit-react";
import "jodit/es2021/jodit.min.css";
import { pickImage, uploadImage } from "../../lib/media";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  height?: number;
}

export default function RichEditorImpl({ value, onChange, placeholder, height = 180 }: Props) {
  const editor = useRef(null);
  const [inner, setInner] = useState(value);
  const lastValue = useRef(value);

  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setInner(value);
    }
  }, [value]);

  const config = useMemo(() => {
    type EditorLike = {
      selection: { insertHTML: (html: string) => void };
    };

    const insertImage = async (editor: EditorLike) => {
      const file = await pickImage();
      if (!file) return;
      try {
        const url = await uploadImage(file);
        editor.selection.insertHTML(`<img src="${url}" alt="" />`);
      } catch (error) {
        window.alert((error as Error)?.message ?? "Gagal mengunggah gambar.");
      }
    };

    return {
      readonly: false,
      height,
      minHeight: 120,
      placeholder: placeholder ?? "Tulis di sini…",
      spellcheck: false,
      language: "auto",
      toolbarAdaptive: false,
      showCharsCounter: false,
      showWordsCounter: false,
      showXPathInStatusbar: false,
      askBeforePasteHTML: false,
      askBeforePasteFromWord: false,
      defaultActionOnPaste: "insert_clear_html",
      controls: {
        unggahGambar: {
          text: "Gambar",
          tooltip: "Sisipkan gambar dari perangkat",
          exec: (editor: EditorLike) => {
            void insertImage(editor);
          },
        },
      },
      buttons: ["bold", "italic", "underline", "|", "ul", "ol", "|", "unggahGambar", "link", "|", "eraser", "undo", "redo"],
      style: { font: "14px" },
    };
  }, [height, placeholder]);

  return (
    <div className="rich-editor overflow-hidden rounded-xl ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500/40">
      <JoditEditor
        ref={editor}
        value={inner}
        config={config as never}
        tabIndex={1}
        onBlur={(html: string) => {
          lastValue.current = html;
          onChange(html);
        }}
        onChange={() => {}}
      />
    </div>
  );
}
