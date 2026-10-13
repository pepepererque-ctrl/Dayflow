import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { ConfirmProvider } from '@/components/ui/Confirm'
import { ToastProvider } from '@/components/ui/Toast'
import { Button } from '@/components/ui/Button'
import { useRoute, useScrollReset } from '@/lib/router'
import { STORAGE_KEY } from '@/lib/constants'
import { AppProvider, useApp } from '@/store/AppStore'
import { SyncProvider } from '@/store/SyncProvider'
import { useThemeEffect } from '@/store/theme'
import { I18nProvider } from '@/i18n/I18nProvider'
import { es } from '@/i18n/es'
import { AnalyticsPage } from '@/features/analytics/AnalyticsPage'
import { ExamsPage } from '@/features/exams/ExamsPage'
import { FocusPage } from '@/features/focus/FocusPage'
import { GoalDetailPage, GoalsPage } from '@/features/goals/GoalsPage'
import { HabitDetailPage, HabitsPage } from '@/features/habits/HabitsPage'
import { Onboarding } from '@/features/onboarding/Onboarding'
import { CommandPalette } from '@/features/palette/CommandPalette'
import { NotificationScheduler } from '@/features/notifications/NotificationScheduler'
import { PlannerPage } from '@/features/planner/PlannerPage'
import { SettingsPage } from '@/features/settings/SettingsPage'
import { SubjectDetailPage, SubjectsPage } from '@/features/subjects/SubjectsPage'
import { TasksPage } from '@/features/tasks/TasksPage'
import { TimetablePage } from '@/features/timetable/TimetablePage'
import { TodayPage } from '@/features/today/TodayPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('DayFlow crashed while rendering.', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    // El límite vive fuera de todos los proveedores, así que lee el
    // diccionario directamente en vez de usar el hook de i18n.
    const copy = es
    return (
      <div className="flex min-h-dvh items-center justify-center bg-canvas p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
          <h1 className="text-lg font-semibold tracking-tight text-ink">{copy['app.crashTitle']}</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{copy['app.crashBody']}</p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-lg bg-surface-2 p-3 text-left text-2xs text-ink-3">
            {this.state.error.message}
          </pre>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {copy['app.reload']}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY)
                window.location.reload()
              }}
            >
              {copy['app.clearAndReload']}
            </Button>
          </div>
        </div>
      </div>
    )
  }
}

function Routes() {
  const { state } = useApp()
  const route = useRoute()
  useThemeEffect(state.settings.theme)
  useScrollReset(`${route.name}/${route.param ?? ''}`)

  if (!state.onboardingComplete) return <Onboarding />

  const page = (() => {
    switch (route.name) {
      case 'tasks':
        return <TasksPage />
      case 'subjects':
        return route.param ? <SubjectDetailPage subjectId={route.param} /> : <SubjectsPage />
      case 'habits':
        return route.param ? <HabitDetailPage habitId={route.param} /> : <HabitsPage />
      case 'goals':
        return route.param ? <GoalDetailPage goalId={route.param} /> : <GoalsPage />
      case 'planner':
        return <PlannerPage />
      case 'exams':
        return <ExamsPage />
      case 'timetable':
        return <TimetablePage />
      case 'focus':
        return <FocusPage />
      case 'analytics':
        return <AnalyticsPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <TodayPage />
    }
  })()

  return (
    <>
      <AppShell route={route.name} param={route.param}>
        {/*
          Fades only. A transform here would linger via animation-fill-mode and
          turn this wrapper into the containing block for any fixed child.
        */}
        <div key={`${route.name}/${route.param ?? ''}`} className="animate-[fade_0.22s_ease-out]">
          {page}
        </div>
      </AppShell>
      <CommandPalette />
      <NotificationScheduler />
    </>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>
              <SyncProvider>
                <Routes />
              </SyncProvider>
            </ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      </AppProvider>
    </ErrorBoundary>
  )
}
