import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import TeacherLogin from "./pages/TeacherLogin";
import TeacherLayout from "./components/TeacherLayout";
import TeacherDashboard from "./pages/teacher/TeacherDashboard";
import TeacherQuestions from "./pages/teacher/TeacherQuestions";
import TeacherExams from "./pages/teacher/TeacherExams";
import TeacherMonitor from "./pages/teacher/TeacherMonitor";
import TeacherStudents from "./pages/teacher/TeacherStudents";
import StudentHome from "./pages/student/StudentHome";
import ExamRoom from "./pages/student/ExamRoom";
import StudentResult from "./pages/student/StudentResult";
import type { Role } from "./lib/types";
import type { ReactNode } from "react";

function Splash({ label = "Menyiapkan asesmen…" }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
        <GraduationCap className="h-6 w-6" />
      </span>
      <p className="text-[13px] font-medium text-slate-500">{label}</p>
    </div>
  );
}

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === "guru" ? "/guru" : "/siswa"} replace />;
  return <>{children}</>;
}

function Landing() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "guru" ? "/guru" : "/siswa"} replace />;
}

function LoginRoute() {
  const { user, loading, lastAttempt } = useAuth();
  if (loading) return <Splash />;
  if (user) {
    if (user.role === "guru") return <Navigate to="/guru" replace />;
    if (lastAttempt) {
      return (
        <Navigate
          to={lastAttempt.status === "selesai" ? `/siswa/hasil/${lastAttempt.id}` : `/siswa/ujian/${lastAttempt.id}`}
          replace
        />
      );
    }
    return <Navigate to="/siswa" replace />;
  }
  return <Login />;
}

function TeacherLoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (user) return <Navigate to={user.role === "guru" ? "/guru" : "/siswa"} replace />;
  return <TeacherLogin />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/guru-login" element={<TeacherLoginRoute />} />

        <Route
          element={
            <Guard role="guru">
              <TeacherLayout />
            </Guard>
          }
        >
          <Route path="/guru" element={<TeacherDashboard />} />
          <Route path="/guru/soal" element={<TeacherQuestions />} />
          <Route path="/guru/ujian" element={<TeacherExams />} />
          <Route path="/guru/pantau" element={<TeacherMonitor />} />
          <Route path="/guru/pantau/:examId" element={<TeacherMonitor />} />
          <Route path="/guru/siswa" element={<TeacherStudents />} />
        </Route>

        <Route
          path="/siswa"
          element={
            <Guard role="siswa">
              <StudentHome />
            </Guard>
          }
        />
        <Route
          path="/siswa/ujian/:attemptId"
          element={
            <Guard role="siswa">
              <ExamRoom />
            </Guard>
          }
        />
        <Route
          path="/siswa/hasil/:attemptId"
          element={
            <Guard role="siswa">
              <StudentResult />
            </Guard>
          }
        />

        <Route path="*" element={<Landing />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
