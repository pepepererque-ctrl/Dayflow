import { useState } from 'react'
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Wordmark } from '@/components/layout/Logo'
import { cn } from '@/lib/cn'
import { ENERGY_PATTERNS, colorVar, habitIcon } from '@/lib/constants'
import { isValidClock, minutesFromClock } from '@/lib/date'
import { defaultSeedOptions, habitPresets, type SeedOptions } from '@/lib/seed'
import { useT } from '@/i18n/I18nProvider'
import type { TranslationKey } from '@/i18n/es'
import { useApp, type OnboardingMode } from '@/store/AppStore'
import type { EnergyPattern } from '@/types'

const STEPS = ['Welcome', 'You', 'Focus', 'Hours', 'Energy', 'Habits', 'Ready'] as const

const DATA_MODES: Array<{ value: OnboardingMode; labelKey: TranslationKey; hintKey: TranslationKey }> = [
  { value: 'keep', labelKey: 'ob.modeKeep', hintKey: 'ob.modeKeepHint' },
  { value: 'demo', labelKey: 'ob.modeDemo', hintKey: 'ob.modeDemoHint' },
  { value: 'empty', labelKey: 'ob.modeEmpty', hintKey: 'ob.modeEmptyHint' },
]

export function Onboarding() {
  const { state, dispatch } = useApp()
  const t = useT()
  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)


  // On a first run the store already holds seeded placeholder values; only a
  // returning user (re-running setup) should see their answers pre-filled.
  const returning = state.profile.onboardedAt !== null

  // Returning users default to keeping what they already have.
  const [dataMode, setDataMode] = useState<OnboardingMode>(returning ? 'keep' : 'demo')

  const [draft, setDraft] = useState<SeedOptions>({
    name: returning ? state.profile.name : '',
    primaryGoal: returning ? state.profile.primaryGoal : '',
    workStart: state.profile.workStart || '09:00',
    workEnd: state.profile.workEnd || '17:30',
    energyPattern: state.profile.energyPattern || 'morning',
    habitKeys: ['move', 'read', 'deepwork'],
    language: 'es',
  })

  const finish = (options: SeedOptions, mode: OnboardingMode) => {
    dispatch({ type: 'finishOnboarding', options, mode })
    window.location.hash = '#/today'
  }

  // Skipping must never destroy an existing workspace.
  const skip = () =>
    returning
      ? finish({ ...draft, language: 'es', name: draft.name.trim() || state.profile.name }, 'keep')
      : finish({ ...defaultSeedOptions('es') }, 'demo')

  const next = () => {
    setError(null)
    if (step === 1 && !draft.name.trim()) {
      setError(t('ob.nameError'))
      return
    }
    if (step === 3) {
      if (!isValidClock(draft.workStart) || !isValidClock(draft.workEnd)) {
        setError(t('ob.hoursInvalid'))
        return
      }
      if (minutesFromClock(draft.workEnd) <= minutesFromClock(draft.workStart)) {
        setError(t('ob.hoursOrder'))
        return
      }
    }
    if (step === STEPS.length - 1) {
      finish({ ...draft, language: 'es' }, dataMode)
      return
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }

  const back = () => {
    setError(null)
    setStep((s) => Math.max(0, s - 1))
  }

  const toggleHabit = (key: string) =>
    setDraft((d) => ({
      ...d,
      habitKeys: d.habitKeys.includes(key)
        ? d.habitKeys.filter((k) => k !== key)
        : [...d.habitKeys, key],
    }))

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex items-center justify-between px-5 py-5 sm:px-8">
        <Wordmark />
        <Button variant="ghost" size="sm" onClick={skip}>
          {t('ob.skip')}
        </Button>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
        <div className="w-full max-w-lg">
          {/* progress */}
          {step > 0 ? (
            <div className="mb-7 flex items-center gap-1.5" aria-hidden="true">
              {STEPS.slice(1).map((label, i) => (
                <div
                  key={label}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors duration-300',
                    i + 1 <= step ? 'bg-brand' : 'bg-surface-3',
                  )}
                />
              ))}
            </div>
          ) : null}

          <div key={step} className="animate-[rise_0.32s_cubic-bezier(0.22,1,0.36,1)_both]">
            {step === 0 ? (
              <div className="text-center">
                <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-soft">
                  <Sparkles size={28} className="text-brand-ink" />
                </div>
                <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-4xl">
                  {t('ob.welcomeTitle')}
                </h1>
                <p className="mx-auto mt-3 max-w-md text-md leading-relaxed text-ink-2">
                  {t('ob.welcomeBody')}
                </p>
                <p className="mt-6 text-sm text-ink-3">{t('ob.welcomeNote')}</p>
              </div>
            ) : null}

            {step === 1 ? (
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
                  {t('ob.nameTitle')}
                </h1>
                <p className="mt-2 text-base text-ink-2">
                  {t('ob.nameBody')}
                </p>
                <div className="mt-6">
                  <Field label={t('ob.nameLabel')} htmlFor="ob-name" error={error} required>
                    <TextInput
                      id="ob-name"
                      value={draft.name}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, name: e.target.value }))
                        setError(null)
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && next()}
                      placeholder={t('ob.namePlaceholder')}
                      autoFocus
                      autoComplete="given-name"
                      aria-invalid={Boolean(error)}
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
                  {t('ob.goalTitle')}
                </h1>
                <p className="mt-2 text-base text-ink-2">
                  {t('ob.goalBody')}
                </p>
                <div className="mt-6">
                  <Field
                    label={t('ob.goalLabel')}
                    htmlFor="ob-goal"
                    hint={t('ob.goalHint')}
                  >
                    <TextInput
                      id="ob-goal"
                      value={draft.primaryGoal}
                      onChange={(e) => setDraft((d) => ({ ...d, primaryGoal: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && next()}
                      placeholder={t('ob.goalPlaceholder')}
                      autoFocus
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
                  {t('ob.hoursTitle')}
                </h1>
                <p className="mt-2 text-base text-ink-2">
                  {t('ob.hoursBody')}
                </p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Field label={t('ob.hoursStart')} htmlFor="ob-start">
                    <TextInput
                      id="ob-start"
                      type="time"
                      value={draft.workStart}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, workStart: e.target.value }))
                        setError(null)
                      }}
                    />
                  </Field>
                  <Field label={t('ob.hoursEnd')} htmlFor="ob-end" error={error}>
                    <TextInput
                      id="ob-end"
                      type="time"
                      value={draft.workEnd}
                      onChange={(e) => {
                        setDraft((d) => ({ ...d, workEnd: e.target.value }))
                        setError(null)
                      }}
                      aria-invalid={Boolean(error)}
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {step === 4 ? (
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
                  {t('ob.energyTitle')}
                </h1>
                <p className="mt-2 text-base text-ink-2">
                  {t('ob.energyBody')}
                </p>
                <div className="mt-6 space-y-2">
                  {ENERGY_PATTERNS.map((option) => {
                    const active = draft.energyPattern === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({ ...d, energyPattern: option.value as EnergyPattern }))
                        }
                        aria-pressed={active}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-all duration-150',
                          active
                            ? 'border-brand bg-brand-soft'
                            : 'border-line bg-surface hover:border-line-strong',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              'block text-base font-semibold',
                              active ? 'text-brand-ink' : 'text-ink',
                            )}
                          >
                            {t(option.labelKey)}
                          </span>
                          <span className="mt-0.5 block text-sm text-ink-3">
                            {t(option.hintKey)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                            active ? 'border-brand bg-brand text-[var(--on-brand)]' : 'border-line-strong text-transparent',
                          )}
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
                  {t('ob.habitsTitle')}
                </h1>
                <p className="mt-2 text-base text-ink-2">
                  {t('ob.habitsBody')}
                </p>
                <div className="mt-6 grid gap-2 sm:grid-cols-2">
                  {habitPresets('es').map((preset) => {
                    const active = draft.habitKeys.includes(preset.key)
                    const Icon = habitIcon(preset.icon)
                    const tint = colorVar(preset.color)
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => toggleHabit(preset.key)}
                        aria-pressed={active}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all duration-150',
                          active ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-line-strong',
                        )}
                      >
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                          style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
                        >
                          <Icon size={17} />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                          {preset.name}
                        </span>
                        {active ? <Check size={16} className="shrink-0 text-brand-ink" strokeWidth={3} /> : null}
                      </button>
                    )
                  })}
                </div>
                <p className="mt-3 text-xs text-ink-3">
                  {t('ob.habitsCount', { n: draft.habitKeys.length })}
                </p>
              </div>
            ) : null}

            {step === 6 ? (
              <div>
                <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink">
                  {t('ob.readyTitle', { name: draft.name.trim() || t('ob.readyFriend') })}
                </h1>
                <p className="mt-2 text-base text-ink-2">
                  {returning ? t('ob.readyBodyReturning') : t('ob.readyBodyNew')}
                </p>

                <div className="mt-6 space-y-2">
                  {DATA_MODES.filter((option) => option.value !== 'keep' || returning).map((option) => {
                    const active = dataMode === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setDataMode(option.value)}
                        aria-pressed={active}
                        className={cn(
                          'flex w-full items-start gap-3 rounded-xl border px-4 py-3.5 text-left transition-all',
                          active
                            ? 'border-brand bg-brand-soft'
                            : 'border-line bg-surface hover:border-line-strong',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-base font-semibold text-ink">
                            {t(option.labelKey)}
                          </span>
                          <span className="mt-0.5 block text-sm text-ink-3">
                            {t(option.hintKey)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                            active
                              ? 'border-brand bg-brand-solid text-[var(--on-brand)]'
                              : 'border-line-strong text-transparent',
                          )}
                        >
                          <Check size={12} strokeWidth={3} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}
          </div>

          {/* controls */}
          <div className="mt-8 flex items-center gap-3">
            {step > 0 ? (
              <Button variant="ghost" onClick={back}>
                <ArrowLeft size={15} />
                {t('common.back')}
              </Button>
            ) : null}
            <div className="flex-1" />
            <Button variant="primary" size="lg" onClick={next}>
              {step === 0 ? t('ob.getStarted') : step === STEPS.length - 1 ? t('ob.enter') : t('common.continue')}
              <ArrowRight size={16} />
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
