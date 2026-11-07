import { TodayCalendar } from "./personal/TodayCalendar";
import { ListsPage, PeoplePage, SiriGuide, BichoAdvancedSettings } from "./personal/Bicho";
import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useSession } from "./hooks/session";
import { SpaceShell } from "./personal/Shell";
import { HomePage, CollectionPage, SpaceSettings } from "./personal/Pages";
import { LoginPage } from "./pages/LoginPage";
import { ChatPage } from "./pages/ChatPage";
import { Spinner, ErrorNotice } from "./components/ui";
import { Logo } from "./components/Logo";
import { useI18n } from "./lib/i18n";

const MemoryPage = lazy(() => import("./pages/MemoryPage"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const NotesPage = lazy(() => import("./pages/NotesPage"));
const AutomationsPage = lazy(() => import("./pages/AutomationsPage"));
const McpOAuthCallback = lazy(() => import("./components/McpServersCard").then((m) => ({ default: m.McpOAuthCallback })));

function FullScreen({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-full flex-col items-center justify-center gap-6 p-6">{children}</div>;
}

export function App() {
  const { t } = useI18n();
  const { session, loading, error, refresh } = useSession();

  if (loading) {
    return (
      <FullScreen>
        <Logo className="h-10 w-10" />
        <Spinner />
      </FullScreen>
    );
  }
  if (error || !session) {
    return (
      <FullScreen>
        <Logo className="h-10 w-10" />
        <div className="w-full max-w-sm">
          <ErrorNotice error={error ?? new Error(t("common.unreachable"))} onRetry={() => void refresh()} />
        </div>
      </FullScreen>
    );
  }
  if (!session.authenticated) return <LoginPage configured={session.configured} enrollmentAvailable={session.enrollment_available} />;

  return (
    <Routes>
      <Route element={<SpaceShell />}>
        <Route index element={<HomePage />} />
        <Route path="today" element={<TodayCalendar />} />
        <Route path="people" element={<PeoplePage />} />
        <Route path="saved" element={<CollectionPage key="saved" section="saved" />} />
        <Route path="lists" element={<ListsPage />} />
        <Route path="ideas" element={<CollectionPage key="ideas" section="ideas" />} />
        <Route path="chat/:conversationId?" element={<ChatPage />} />
        <Route path="memory" element={<Lazy><MemoryPage /></Lazy>} />
        <Route path="tasks" element={<Lazy><TasksPage /></Lazy>} />
        <Route path="notes/:noteId?" element={<Lazy><NotesPage /></Lazy>} />
        <Route path="automations" element={<Lazy><AutomationsPage /></Lazy>} />
        <Route path="settings" element={<SpaceSettings />} />
        <Route path="settings/siri" element={<SiriGuide />} />
        <Route path="settings/advanced" element={<BichoAdvancedSettings />} />
        <Route path="settings/mcp-oauth" element={<Lazy><McpOAuthCallback /></Lazy>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function Lazy({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-16">
          <Spinner />
        </div>
      }
    >
      {children}
    </Suspense>
  );
}
