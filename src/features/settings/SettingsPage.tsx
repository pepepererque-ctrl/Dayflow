import { useRef, useState } from 'react'
import {
  Download,
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  User,
} from 'lucide-react'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { Select, TextInput } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { ENERGY_PATTERNS } from '@/lib/constants'
import { isValidClock, minutesFromClock, todayISO } from '@/lib/date'
import { sanitizeState, serializeState } from '@/lib/storage'
import { useApp } from '@/store/AppStore'
import type { EnergyPattern, ThemeMode } from '@/types'
import { useT } from '@/i18n/I18nProvider'
import { AppCard } from './AppCard'
import { CloudCard } from './CloudCard'
import { Row } from './Row'

export function SettingsPage() {
  const { state, dispatch, replaceState, resetDemoData, hardReset } = useApp()
  const confirm = useConfirm()
  const { toast } = useToast()
  const t = useT()
  const fileRef = useRef<HTMLInputElement>(null)

  const [hoursError, setHoursError] = useState<string | null>(null)

  const patchProfile = (patch: Partial<typeof state.profile>) =>
    dispatch({ type: 'patchProfile', patch })

  const setHours = (key: 'workStart' | 'workEnd', value: string) => {
    const nextProfile = { ...state.profile, [key]: value }
    if (
      isValidClock(nextProfile.workStart) &&
      isValidClock(nextProfile.workEnd) &&
      minutesFromClock(nextProfile.workEnd) <= minutesFromClock(nextProfile.workStart)
    ) {
      setHoursError(t('settings.hoursOrder'))
    } else {
      setHoursError(null)
    }
    patchProfile({ [key]: value })
  }

  const exportData = () => {
    try {
      const blob = new Blob([serializeState(state)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `dayflow-backup-${todayISO()}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast(t('settings.exported'))
    } catch {
      toast(t('settings.exportFailed'), { tone: 'error' })
    }
  }

  const importData = async (file: File) => {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown
      // sanitizeState is forgiving by design, so check the shape first —
      // otherwise any stray JSON object would import as an empty workspace.
      const looksLikeBackup =
        typeof parsed === 'object' &&
        parsed !== null &&
        ['tasks', 'habits', 'goals', 'blocks', 'sessions', 'profile', 'settings'].some(
          (key) => key in (parsed as Record<string, unknown>),
        )
      const clean = looksLikeBackup ? sanitizeState(parsed) : null
      if (!clean) {
        toast(t('settings.importNotBackup'), { tone: 'error' })
        return
      }
      const ok = await confirm({
        title: t('settings.importConfirmTitle'),
        message: t('settings.importConfirmBody', {
          tasks: clean.tasks.length,
          habits: clean.habits.length,
          goals: clean.goals.length,
          subjects: clean.subjects.length,
          blocks: clean.blocks.length,
          sessions: clean.sessions.length,
        }),
        confirmLabel: t('common.import'),
        destructive: true,
      })
      if (!ok) return
      replaceState({ ...clean, onboardingComplete: true })
      toast(t('settings.imported'))
    } catch {
      toast(t('settings.importBadJson'), { tone: 'error' })
    }
  }

  const confirmResetDemo = async () => {
    const ok = await confirm({
      title: t('settings.resetDemoTitle'),
      message: t('settings.resetDemoBody'),
      confirmLabel: t('common.reset'),
      destructive: true,
    })
    if (!ok) return
    resetDemoData()
    toast(t('settings.demoRestored'))
  }

  const confirmHardReset = async () => {
    const ok = await confirm({
      title: t('settings.eraseTitle'),
      message: t('settings.eraseBody'),
      confirmLabel: t('settings.erase'),
      destructive: true,
    })
    if (!ok) return
    hardReset()
    window.location.hash = '#/today'
  }

  const restartOnboarding = async () => {
    const ok = await confirm({
      title: t('settings.restartObTitle'),
      message: t('settings.restartObBody'),
      confirmLabel: t('common.restart'),
    })
    if (!ok) return
    dispatch({ type: 'restartOnboarding' })
  }

  return (
    <>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <CloudCard />
        <AppCard />

        {/* ---------------------------- appearance --------------------------- */}
        <Card>
          <CardHeader title={t('settings.appearance')} icon={<Sun size={16} />} />
          <div className="mt-2">
            <Row title={t('settings.theme')} description={t('settings.themeHint')}>
              <Segmented
                ariaLabel={t('settings.theme')}
                value={state.settings.theme}
                onChange={(theme: ThemeMode) => dispatch({ type: 'patchSettings', patch: { theme } })}
                options={[
                  { value: 'light', label: t('settings.light'), icon: <Sun size={14} /> },
                  { value: 'dark', label: t('settings.dark'), icon: <Moon size={14} /> },
                  { value: 'system', label: t('settings.system'), icon: <Monitor size={14} /> },
                ]}
              />
            </Row>
            <Row title={t('settings.weekStart')}>
              <Segmented
                ariaLabel={t('settings.weekStart')}
                value={String(state.settings.weekStartsOn) as '0' | '1'}
                onChange={(v) =>
                  dispatch({ type: 'patchSettings', patch: { weekStartsOn: v === '0' ? 0 : 1 } })
                }
                options={[
                  { value: '1', label: t('settings.monday') },
                  { value: '0', label: t('settings.sunday') },
                ]}
              />
            </Row>
          </div>
        </Card>

        {/* ----------------------------- profile ----------------------------- */}
        <Card>
          <CardHeader title={t('settings.profile')} icon={<User size={16} />} />
          <div className="mt-2">
            <Row title={t('settings.name')}>
              <TextInput
                value={state.profile.name}
                onChange={(e) => patchProfile({ name: e.target.value })}
                placeholder={t('settings.namePlaceholder')}
                aria-label={t('settings.name')}
              />
            </Row>
            <Row title={t('settings.primaryGoal')} description={t('settings.primaryGoalHint')}>
              <TextInput
                value={state.profile.primaryGoal}
                onChange={(e) => patchProfile({ primaryGoal: e.target.value })}
                placeholder={t('settings.primaryGoalPlaceholder')}
                aria-label={t('settings.primaryGoal')}
              />
            </Row>
            <Row title={t('settings.workingHours')} description={t('settings.workingHoursHint')}>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <TextInput
                    type="time"
                    value={state.profile.workStart}
                    onChange={(e) => setHours('workStart', e.target.value)}
                    aria-label={t('settings.workStart')}
                    aria-invalid={Boolean(hoursError)}
                  />
                  <span className="text-ink-3">-</span>
                  <TextInput
                    type="time"
                    value={state.profile.workEnd}
                    onChange={(e) => setHours('workEnd', e.target.value)}
                    aria-label={t('settings.workEnd')}
                    aria-invalid={Boolean(hoursError)}
                  />
                </div>
                {hoursError ? (
                  <p className="text-xs font-medium text-bad" role="alert">
                    {hoursError}
                  </p>
                ) : null}
              </div>
            </Row>
            <Row title={t('settings.energy')} description={t('settings.energyHint')}>
              <Select
                value={state.profile.energyPattern}
                onChange={(e) => patchProfile({ energyPattern: e.target.value as EnergyPattern })}
                aria-label={t('settings.energy')}
              >
                {ENERGY_PATTERNS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {t(p.labelKey)}
                  </option>
                ))}
              </Select>
            </Row>
          </div>
        </Card>

        {/* ----------------------------- targets ----------------------------- */}
        <Card>
          <CardHeader title={t('settings.targets')} subtitle={t('settings.targetsSub')} />
          <div className="mt-2">
            <Row title={t('settings.taskTarget')} description={t('settings.taskTargetHint')}>
              <TextInput
                type="number"
                min={1}
                max={50}
                value={state.settings.dailyTaskTarget}
                onChange={(e) =>
                  dispatch({
                    type: 'patchSettings',
                    patch: { dailyTaskTarget: Math.max(1, Math.min(50, Number(e.target.value) || 1)) },
                  })
                }
                aria-label={t('settings.taskTarget')}
              />
            </Row>
            <Row title={t('settings.focusTarget')}>
              <TextInput
                type="number"
                min={5}
                max={720}
                step={5}
                value={state.settings.dailyFocusTargetMin}
                onChange={(e) =>
                  dispatch({
                    type: 'patchSettings',
                    patch: {
                      dailyFocusTargetMin: Math.max(5, Math.min(720, Number(e.target.value) || 5)),
                    },
                  })
                }
                aria-label={t('settings.focusTarget')}
              />
            </Row>
            <Row title={t('settings.presets')} description={t('settings.presetsHint')}>
              <TextInput
                defaultValue={state.settings.focusPresets.join(', ')}
                onBlur={(e) => {
                  const presets = e.target.value
                    .split(',')
                    .map((p) => Math.round(Number(p.trim())))
                    .filter((p) => Number.isFinite(p) && p > 0 && p <= 240)
                  if (!presets.length) {
                    toast(t('settings.presetsInvalid'), { tone: 'error' })
                    e.target.value = state.settings.focusPresets.join(', ')
                    return
                  }
                  const unique = Array.from(new Set(presets)).sort((a, b) => a - b)
                  dispatch({ type: 'patchSettings', patch: { focusPresets: unique } })
                  e.target.value = unique.join(', ')
                  toast(t('settings.presetsUpdated'))
                }}
                aria-label={t('settings.presets')}
              />
            </Row>
          </div>
        </Card>

        {/* ------------------------------- data ------------------------------ */}
        <Card>
          <CardHeader title={t('settings.data')} icon={<Download size={16} />} />
          <div className="mt-2">
            <Row
              title={t('settings.exportTitle')}
              description={t('settings.exportSub', {
                tasks: state.tasks.length,
                habits: state.habits.length,
                goals: state.goals.length,
                subjects: state.subjects.length,
                sessions: state.sessions.length,
              })}
            >
              <Button variant="secondary" onClick={exportData}>
                <Download size={15} />
                {t('common.export')}
              </Button>
            </Row>

            <Row title={t('settings.importTitle')} description={t('settings.importSub')}>
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void importData(file)
                    e.target.value = ''
                  }}
                />
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Upload size={15} />
                  {t('settings.chooseFile')}
                </Button>
              </>
            </Row>

            <Row title={t('settings.restartOb')} description={t('settings.restartObSub')}>
              <Button variant="secondary" onClick={restartOnboarding}>
                <RefreshCw size={15} />
                {t('common.restart')}
              </Button>
            </Row>

            <Row title={t('settings.resetDemo')} description={t('settings.resetDemoSub')}>
              <Button variant="secondary" onClick={confirmResetDemo}>
                <RotateCcw size={15} />
                {t('common.reset')}
              </Button>
            </Row>

            <Row title={t('settings.erase')} description={t('settings.eraseSub')}>
              <Button variant="danger" onClick={confirmHardReset}>
                <Trash2 size={15} />
                {t('settings.eraseAction')}
              </Button>
            </Row>
          </div>
        </Card>
      </div>

      <p className="mt-6 text-center text-xs text-ink-3">
        {t('settings.footer')}
      </p>
    </>
  )
}
