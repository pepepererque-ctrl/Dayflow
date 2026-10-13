import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Check,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Square,
  Timer as TimerIcon,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Select } from '@/components/ui/Field'
import { ProgressRing } from '@/components/ui/Progress'
import { useToast } from '@/components/ui/Toast'
import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import { formatDuration } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { useRelativeDay } from '@/i18n/useRelativeDay'
import { uid } from '@/lib/id'
import { useRoute } from '@/lib/router'
import { isOpenSubject, subjectShort } from '@/lib/subjects'
import { useApp } from '@/store/AppStore'

type Status = 'idle' | 'running' | 'paused' | 'complete'

/** Short, gentle two-tone chime built with WebAudio so no asset is needed. */
function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const now = ctx.currentTime
    ;[880, 1174.7].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0, now + i * 0.18)
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.18 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.18 + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(now + i * 0.18)
      osc.stop(now + i * 0.18 + 0.55)
    })
    window.setTimeout(() => ctx.close(), 1500)
  } catch {
    // Audio is a nicety; never let it break the timer.
  }
}

function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function FocusPage() {
  const { state, dispatch, today } = useApp()
  const { toast } = useToast()
  const route = useRoute()
  const t = useT()
  const relDay = useRelativeDay()

  const presets = state.settings.focusPresets
  const [minutes, setMinutes] = useState(presets[0] ?? 25)
  const [status, setStatus] = useState<Status>('idle')
  const [remaining, setRemaining] = useState((presets[0] ?? 25) * 60_000)
  const [linkTaskId, setLinkTaskId] = useState<string>(route.query.task ?? '')
  const [linkGoalId, setLinkGoalId] = useState<string>(route.query.goal ?? '')
  // Si se llega desde una tarea, hereda su asignatura sin que haya que elegirla otra vez.
  const [linkSubjectId, setLinkSubjectId] = useState<string>(
    route.query.subject ?? state.tasks.find((x) => x.id === route.query.task)?.subjectId ?? '',
  )
  const [immersive, setImmersive] = useState(false)

  // Deadline-based so the countdown stays accurate when the tab is throttled.
  const deadline = useRef<number>(0)
  const startedAt = useRef<string>('')

  const openTasks = useMemo(
    () => state.tasks.filter((t) => t.status !== 'done').slice(0, 60),
    [state.tasks],
  )
  const activeGoals = useMemo(() => state.goals.filter((g) => g.status === 'active'), [state.goals])
  const subjectChoices = useMemo(
    () => state.subjects.filter((s) => isOpenSubject(s) || s.id === linkSubjectId),
    [state.subjects, linkSubjectId],
  )

  const todaySessions = state.sessions.filter((s) => s.date === today)
  const todayMinutes = todaySessions.reduce((sum, s) => sum + s.actualMinutes, 0)
  const recent = state.sessions.slice(0, 6)

  const record = useCallback(
    (actualMinutes: number, completed: boolean) => {
      if (actualMinutes < 1) return
      dispatch({
        type: 'addSession',
        session: {
          id: uid('foc'),
          startedAt: startedAt.current || new Date().toISOString(),
          date: today,
          plannedMinutes: minutes,
          actualMinutes: Math.round(actualMinutes),
          completed,
          taskId: linkTaskId || null,
          goalId: linkGoalId || null,
          subjectId: linkSubjectId || null,
          label: completed ? t('focus.sessionLabel') : t('focus.sessionLabelEarly'),
        },
      })
    },
    [dispatch, today, minutes, linkTaskId, linkGoalId, linkSubjectId, t],
  )

  // Countdown loop.
  useEffect(() => {
    if (status !== 'running') return
    const tick = () => {
      const left = deadline.current - Date.now()
      if (left <= 0) {
        setRemaining(0)
        setStatus('complete')
        playChime()
        record(minutes, true)
        return
      }
      setRemaining(left)
    }
    tick()
    const handle = window.setInterval(tick, 250)
    return () => window.clearInterval(handle)
  }, [status, minutes, record])

  // Navigating away mid-session should bank the time already spent rather than
  // throwing it away, so keep the latest run in a ref for the unmount handler.
  const runRef = useRef({ status, minutes, remaining, record })
  useEffect(() => {
    runRef.current = { status, minutes, remaining, record }
  })
  useEffect(
    () => () => {
      const run = runRef.current
      if (run.status !== 'running' && run.status !== 'paused') return
      const elapsedMin = (run.minutes * 60_000 - Math.max(0, run.remaining)) / 60_000
      run.record(elapsedMin, false)
    },
    [],
  )

  // Keep the tab title useful while a session runs.
  useEffect(() => {
    document.title =
      status === 'running' || status === 'paused' ? `${clockText(remaining)} · DayFlow` : 'DayFlow'
    return () => {
      document.title = 'DayFlow'
    }
  }, [status, remaining])

  const start = () => {
    startedAt.current = new Date().toISOString()
    deadline.current = Date.now() + minutes * 60_000
    setRemaining(minutes * 60_000)
    setStatus('running')
  }

  const pause = () => {
    setRemaining(Math.max(0, deadline.current - Date.now()))
    setStatus('paused')
  }

  const resume = () => {
    deadline.current = Date.now() + remaining
    setStatus('running')
  }

  const stop = () => {
    const elapsedMs = minutes * 60_000 - Math.max(0, remaining)
    const elapsedMin = elapsedMs / 60_000
    record(elapsedMin, false)
    setStatus('idle')
    setRemaining(minutes * 60_000)
    setImmersive(false)
    if (elapsedMin >= 1) toast(t('focus.logged', { duration: formatDuration(elapsedMin) }), { tone: 'info' })
  }

  const reset = () => {
    setStatus('idle')
    setRemaining(minutes * 60_000)
  }

  const pickPreset = (value: number) => {
    setMinutes(value)
    if (status === 'idle' || status === 'complete') {
      setRemaining(value * 60_000)
      setStatus('idle')
    }
  }

  const acknowledgeComplete = () => {
    setStatus('idle')
    setRemaining(minutes * 60_000)
    setImmersive(false)
    if (linkTaskId) {
      const task = state.tasks.find((t) => t.id === linkTaskId)
      if (task && task.status !== 'done') {
        toast(t('focus.savedAsk'), {
          actionLabel: t('focus.markDone'),
          onAction: () => dispatch({ type: 'toggleTask', id: task.id }),
        })
        return
      }
    }
    toast(t('focus.saved'))
  }

  // Escape leaves the distraction-free view.
  useEffect(() => {
    if (!immersive) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setImmersive(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [immersive])

  // The immersive view has no controls, so surface the finished session by
  // dropping back to the full screen where Done and the summary live.
  useEffect(() => {
    if (immersive && status === 'complete') setImmersive(false)
  }, [immersive, status])

  /** Entering with an idle timer would strand the user with no way to start. */
  const enterImmersive = () => {
    if (status === 'idle' || status === 'complete') start()
    setImmersive(true)
  }

  const progress = 1 - remaining / Math.max(1, minutes * 60_000)
  const linkedTask = state.tasks.find((t) => t.id === linkTaskId)
  const linkedGoal = state.goals.find((g) => g.id === linkGoalId)

  const timerFace = (
    <div className="flex flex-col items-center">
      <ProgressRing value={status === 'idle' ? 0 : progress} size={240} thickness={12} color="brand">
        <span className="tnum text-[50px] font-semibold tracking-tight text-ink">
          {clockText(remaining)}
        </span>
        <span className="mt-1 text-xs font-medium text-ink-3">
          {status === 'running'
            ? t('focus.focusing')
            : status === 'paused'
              ? t('focus.paused')
              : status === 'complete'
                ? t('focus.complete')
                : t('focus.sessionOf', { n: minutes })}
        </span>
      </ProgressRing>

      {linkedTask || linkedGoal ? (
        <p className="mt-5 max-w-xs text-center text-sm text-ink-2">
          {t('focus.workingOn')}{' '}
          <span className="font-semibold text-ink">{linkedTask?.title ?? linkedGoal?.title}</span>
        </p>
      ) : null}

      <div className="mt-7 flex items-center gap-2">
        {status === 'idle' ? (
          <Button variant="primary" size="lg" onClick={start}>
            <Play size={17} />
            {t('focus.start')}
          </Button>
        ) : null}

        {status === 'running' ? (
          <>
            <Button variant="secondary" size="lg" onClick={pause}>
              <Pause size={17} />
              {t('focus.pause')}
            </Button>
            <Button variant="secondary" size="lg" onClick={stop}>
              <Square size={15} />
              Stop
            </Button>
          </>
        ) : null}

        {status === 'paused' ? (
          <>
            <Button variant="primary" size="lg" onClick={resume}>
              <Play size={17} />
              {t('focus.resume')}
            </Button>
            <Button variant="secondary" size="lg" onClick={reset}>
              <RotateCcw size={15} />
              {t('focus.reset')}
            </Button>
            <Button variant="secondary" size="lg" onClick={stop}>
              <Square size={15} />
              Stop
            </Button>
          </>
        ) : null}

        {status === 'complete' ? (
          <Button variant="primary" size="lg" onClick={acknowledgeComplete}>
            <Check size={17} />
            {t('focus.done')}
          </Button>
        ) : null}
      </div>
    </div>
  )

  if (immersive) {
    // Rendered through a portal: the page-transition wrapper keeps a transform,
    // which would otherwise make this fixed overlay position against that box
    // instead of the viewport.
    return createPortal(
      <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-canvas p-6 animate-[fade_0.25s_ease-out_both]">
        <button
          type="button"
          onClick={() => setImmersive(false)}
          aria-label={t('focus.exitImmersive')}
          className="absolute right-5 top-5 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <Minimize2 size={15} />
          {t('focus.exit')}
        </button>

        {/* Nothing but the countdown — that is the whole point of the mode. */}
        <ProgressRing value={progress} size={320} thickness={14} color="brand">
          <span className="tnum text-[76px] font-semibold leading-[1.1] tracking-tight text-ink">
            {clockText(remaining)}
          </span>
        </ProgressRing>
      </div>,
      document.body,
    )
  }

  return (
    <>
      <PageHeader
        title={t('focus.title')}
        subtitle={
          todayMinutes
            ? t('focus.subtitle', {
                duration: formatDuration(todayMinutes),
                n: todaySessions.length,
              })
            : t('focus.subtitleEmpty')
        }
        actions={
          <Button variant="secondary" onClick={enterImmersive}>
            <Maximize2 size={15} />
            {t('focus.immersive')}
          </Button>
        }
      />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex flex-col items-center px-5 py-8 sm:py-10">
            <div className="mb-8 flex flex-wrap justify-center gap-2">
              {presets.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => pickPreset(value)}
                  aria-pressed={minutes === value}
                  disabled={status === 'running' || status === 'paused'}
                  className={cn(
                    'rounded-xl border px-4 py-2 text-sm font-semibold transition-all',
                    minutes === value
                      ? 'border-brand bg-brand-soft text-brand-ink'
                      : 'border-line-strong text-ink-2 hover:border-ink-3 hover:text-ink',
                    (status === 'running' || status === 'paused') && 'opacity-50',
                  )}
                >
                  {t('focus.minutes', { n: value })}
                </button>
              ))}
            </div>

            {timerFace}
          </div>

          <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
            {subjectChoices.length ? (
              <div className="space-y-1.5 sm:col-span-2">
                <label htmlFor="focus-subject" className="text-sm font-medium text-ink-2">
                  {t('focus.linkSubject')}
                </label>
                <Select
                  id="focus-subject"
                  value={linkSubjectId}
                  onChange={(e) => setLinkSubjectId(e.target.value)}
                  disabled={status === 'running'}
                >
                  <option value="">{t('focus.noSubject')}</option>
                  {subjectChoices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <label htmlFor="focus-task" className="text-sm font-medium text-ink-2">
                {t('focus.linkTask')}
              </label>
              <Select
                id="focus-task"
                value={linkTaskId}
                onChange={(e) => {
                  setLinkTaskId(e.target.value)
                  if (e.target.value) setLinkGoalId('')
                  const subjectOfTask = state.tasks.find((x) => x.id === e.target.value)?.subjectId
                  if (subjectOfTask) setLinkSubjectId(subjectOfTask)
                }}
                disabled={status === 'running'}
              >
                <option value="">{t('focus.noTask')}</option>
                {openTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="focus-goal" className="text-sm font-medium text-ink-2">
                {t('focus.linkGoal')}
              </label>
              <Select
                id="focus-goal"
                value={linkGoalId}
                onChange={(e) => {
                  setLinkGoalId(e.target.value)
                  if (e.target.value) setLinkTaskId('')
                }}
                disabled={status === 'running'}
              >
                <option value="">{t('focus.noGoal')}</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title={t('focus.todayCard')} icon={<TimerIcon size={16} />} />
            <div className="p-5 pt-3">
              <p className="tnum text-3xl font-semibold leading-[1.1] tracking-tight text-ink">
                {formatDuration(todayMinutes)}
              </p>
              <p className="mt-1.5 text-sm text-ink-3">
                {t('focus.target', { duration: formatDuration(state.settings.dailyFocusTargetMin) })}
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-brand transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, (todayMinutes / Math.max(1, state.settings.dailyFocusTargetMin)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title={t('focus.recent')} subtitle={t('focus.recentSub', { n: state.sessions.length })} />
            <div className="p-4 pt-2">
              {recent.length ? (
                <ul className="space-y-2">
                  {recent.map((s) => {
                    const task = s.taskId ? state.tasks.find((t) => t.id === s.taskId) : null
                    const goal = s.goalId ? state.goals.find((g) => g.id === s.goalId) : null
                    const subject = s.subjectId ? state.subjects.find((x) => x.id === s.subjectId) : null
                    return (
                      <li
                        key={s.id}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-2"
                      >
                        <span
                          className={cn(
                            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                            s.completed ? 'bg-brand-soft text-brand-ink' : 'bg-surface-3 text-ink-3',
                          )}
                        >
                          {s.completed ? <Check size={13} strokeWidth={3} /> : <Square size={11} />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">
                            {task?.title ?? goal?.title ?? subject?.name ?? t('focus.sessionLabel')}
                          </p>
                          <p className="truncate text-2xs text-ink-3">
                            {relDay(s.date, today)}
                            {subject && (task || goal) ? ` · ${subjectShort(subject)}` : ''}
                          </p>
                        </div>
                        <span
                          className="tnum shrink-0 text-xs font-semibold"
                          style={{ color: s.completed ? colorVar('emerald') : 'var(--ink-3)' }}
                        >
                          {s.actualMinutes}m
                        </span>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <EmptyState
                  compact
                  icon={<TimerIcon size={18} />}
                  title={t('focus.noSessionsTitle')}
                  description={t('focus.noSessionsBody')}
                />
              )}
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
