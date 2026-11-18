import { useCallback, useEffect, useState } from "react";
import { BookOpen, GraduationCap, Loader2, Plus, Trash2, UserPlus, Users } from "lucide-react";
import { api, ApiError } from "../../lib/api";
import { PageHeading } from "../../components/TeacherLayout";
import { useConfirm } from "../../components/ConfirmDialog";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from "../../components/ui";
import type { ClassRow, Student, SubjectRow } from "../../lib/types";

export default function TeacherStudents() {
  const { confirm, dialog } = useConfirm();
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [subjects, setSubjects] = useState<SubjectRow[]>([]);
  const [students, setStudents] = useState<Student[] | null>(null);
  const [classFilter, setClassFilter] = useState<number | "">("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", classId: "" as number | "" });

  const [newClass, setNewClass] = useState("");
  const [newSubject, setNewSubject] = useState("");

  const flash = (message: string) => {
    setFeedback(message);
    window.setTimeout(() => setFeedback(""), 5000);
  };

  const loadMaster = useCallback(async () => {
    try {
      const [classData, subjectData] = await Promise.all([
        api<{ classes: ClassRow[] }>("/classes"),
        api<{ subjects: SubjectRow[] }>("/subjects"),
      ]);
      setClasses(classData.classes);
      setSubjects(subjectData.subjects);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal memuat kelas dan mapel.");
    }
  }, []);

  const loadStudents = useCallback(async () => {
    setStudents(null);
    try {
      const query = classFilter ? `?classId=${classFilter}` : "";
      const data = await api<{ students: Student[] }>(`/students${query}`);
      setStudents(data.students);
      setError("");
    } catch (err) {
      setStudents([]);
      setError(err instanceof ApiError ? err.message : "Gagal memuat siswa.");
    }
  }, [classFilter]);

  useEffect(() => {
    void loadMaster();
  }, [loadMaster]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  function openAdd() {
    setForm({ name: "", classId: classFilter || classes[0]?.id || "" });
    setAddOpen(true);
  }

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api("/students", {
        method: "POST",
        body: {
          name: form.name,
          classId: form.classId,
        },
      });
      setAddOpen(false);
      flash("Siswa baru ditambahkan.");
      await Promise.all([loadStudents(), loadMaster()]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah siswa.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(student: Student) {
    confirm(
      {
        title: "Hapus siswa?",
        subject: student.name,
        note: "Riwayat asesmen dan catatan pelanggaran siswa ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
        confirmLabel: "Hapus siswa",
      },
      async () => {
        try {
          await api(`/students/${student.id}`, { method: "DELETE" });
          flash("Data siswa dihapus.");
          await Promise.all([loadStudents(), loadMaster()]);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Gagal menghapus siswa.");
        }
      },
    );
  }

  async function addClass(event: React.FormEvent) {
    event.preventDefault();
    if (!newClass.trim()) return;
    try {
      await api("/classes", { method: "POST", body: { name: newClass } });
      setNewClass("");
      await loadMaster();
      flash("Kelas ditambahkan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah kelas.");
    }
  }

  async function addSubject(event: React.FormEvent) {
    event.preventDefault();
    if (!newSubject.trim()) return;
    try {
      await api("/subjects", { method: "POST", body: { name: newSubject } });
      setNewSubject("");
      await loadMaster();
      flash("Mata pelajaran ditambahkan.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Gagal menambah mata pelajaran.");
    }
  }

  async function removeClass(row: ClassRow) {
    confirm(
      {
        title: "Hapus kelas?",
        subject: `Kelas ${row.name}`,
        note: "Semua soal dan asesmen untuk kelas ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
        confirmLabel: "Hapus kelas",
      },
      async () => {
        try {
          await api(`/classes/${row.id}`, { method: "DELETE" });
          await Promise.all([loadMaster(), loadStudents()]);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Gagal menghapus kelas.");
        }
      },
    );
  }

  async function removeSubject(row: SubjectRow) {
    confirm(
      {
        title: "Hapus mata pelajaran?",
        subject: row.name,
        note: "Semua soal dan asesmen untuk mata pelajaran ini ikut terhapus. Tindakan ini tidak bisa dibatalkan.",
        confirmLabel: "Hapus mapel",
      },
      async () => {
        try {
          await api(`/subjects/${row.id}`, { method: "DELETE" });
          await Promise.all([loadMaster(), loadStudents()]);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Gagal menghapus mata pelajaran.");
        }
      },
    );
  }

  return (
    <div>
      <PageHeading
        title="Siswa & Kelas"
        description="Buat akun siswa, atur kelasnya, dan siapkan daftar kelas serta mata pelajaran."
        action={
          <Button size="sm" onClick={openAdd}>
            <UserPlus className="h-4 w-4" /> Tambah siswa
          </Button>
        }
      />

      {error ? <Alert tone="danger" className="mb-4">{error}</Alert> : null}
      {feedback ? <Alert tone="success" className="mb-4">{feedback}</Alert> : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Daftar siswa"
            description="Siswa memilih kelas dan namanya di halaman login."
            icon={<Users className="h-4 w-4" />}
            action={
              <Select
                value={classFilter}
                onChange={(e) => setClassFilter(Number(e.target.value) || "")}
                className="h-9 w-40 py-1 text-[12.5px]"
              >
                <option value="">Semua kelas</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    Kelas {c.name}
                  </option>
                ))}
              </Select>
            }
          />
          {students === null ? (
            <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat siswa…
            </div>
          ) : students.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-5 w-5" />}
              title="Belum ada siswa"
              description="Tambahkan akun siswa agar mereka bisa mengikuti ujian."
              action={
                <Button size="sm" onClick={openAdd}>
                  <Plus className="h-4 w-4" /> Tambah siswa
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-[13px]">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Nama</th>
                    <th className="px-3 py-2.5 font-semibold">Kelas</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.map((student) => (
                    <tr key={student.id}>
                      <td className="px-4 py-2.5 font-semibold text-slate-800">{student.name}</td>
                      <td className="px-3 py-2.5">
                        {student.className ? <Badge tone="info">{student.className}</Badge> : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:bg-rose-50"
                            onClick={() => handleDelete(student)}
                            aria-label={`Hapus ${student.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Kelas" description="Daftar kelas madrasah." icon={<GraduationCap className="h-4 w-4" />} />
            <form onSubmit={addClass} className="flex gap-2 border-b border-slate-100 px-4 py-3">
              <Input
                value={newClass}
                onChange={(e) => setNewClass(e.target.value)}
                placeholder="Contoh: 7C"
                className="h-9 py-1 text-[13px]"
                aria-label="Nama kelas baru"
              />
              <Button size="sm" type="submit" aria-label="Tambah kelas">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {classes.map((row) => (
                <li key={row.id} className="flex items-center justify-between px-4 py-2">
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">Kelas {row.name}</p>
                    <p className="text-[11px] text-slate-400">{row.studentCount} siswa</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeClass(row)}
                    aria-label={`Hapus kelas ${row.name}`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Mata pelajaran" description="Mapel yang diujikan." icon={<BookOpen className="h-4 w-4" />} />
            <form onSubmit={addSubject} className="flex gap-2 border-b border-slate-100 px-4 py-3">
              <Input
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                placeholder="Contoh: Fikih"
                className="h-9 py-1 text-[13px]"
                aria-label="Nama mata pelajaran baru"
              />
              <Button size="sm" type="submit" aria-label="Tambah mata pelajaran">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto">
              {subjects.map((row) => (
                <li key={row.id} className="flex items-center justify-between px-4 py-2">
                  <p className="text-[13px] font-semibold text-slate-800">{row.name}</p>
                  <button
                    type="button"
                    onClick={() => removeSubject(row)}
                    aria-label={`Hapus ${row.name}`}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Tambah siswa"
        description="Nama ini yang nanti dipilih siswa di halaman login."
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button size="sm" type="submit" form="student-form" disabled={saving}>
              {saving ? <Spinner /> : <UserPlus className="h-4 w-4" />} Simpan
            </Button>
          </>
        }
      >
        <form id="student-form" className="space-y-3.5" onSubmit={handleAdd}>
          <Field label="Nama lengkap">
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Contoh: Muhammad Rizki"
              required
            />
          </Field>
          <Field label="Kelas">
            <Select
              value={form.classId}
              onChange={(e) => setForm({ ...form, classId: Number(e.target.value) || "" })}
              required
            >
              <option value="">Pilih kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  Kelas {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>

      {dialog}
    </div>
  );
}
