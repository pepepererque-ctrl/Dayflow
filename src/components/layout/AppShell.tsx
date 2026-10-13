import { useEffect, useState, type ReactNode } from 'react'
import {
  BarChart3,
  CalendarDays,
  CalendarRange,
  CheckSquare,
  ClipboardCheck,
  Ellipsis,
  Flag,
  GraduationCap,
  Repeat,
  Search,
  Settings as SettingsIcon,
  Sun,
  Timer,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/cn'
import { colorVar } from '@/lib/constants'
import { openPalette, paletteShortcut } from '@/lib/palette'
import { navigate, type RouteName } from '@/lib/router'
import { isOpenSubject, subjectShort } from '@/lib/subjects'
import { useApp } from '@/store/AppStore'
import { computeTodayScore } from '@/lib/analytics'
import { LogoMark, Wordmark } from './Logo'
import { useT } from '@/i18n/I18nProvider'
import type { TranslationKey } from '@/i18n/es'

interface NavItem {
  name: RouteName
  labelKey: TranslationKey
  icon: LucideIcon
}

const PRIMARY: NavItem[] = [
  { name: 'today', labelKey: 'nav.today', icon: Sun },
  { name: 'tasks', labelKey: 'nav.tasks', icon: CheckSquare },
  { name: 'subjects', labelKey: 'nav.subjects', icon: GraduationCap },
  { name: 'habits', labelKey: 'nav.habits', icon: Repeat },
  { name: 'goals', labelKey: 'nav.goals', icon: Flag },
]

const SECONDARY: NavItem[] = [
  { name: 'planner', labelKey: 'nav.planner', icon: CalendarRange },
  { name: 'timetable', labelKey: 'nav.timetable', icon: CalendarDays },
  { name: 'exams', labelKey: 'nav.exams', icon: ClipboardCheck },
  { name: 'focus', labelKey: 'nav.focus', icon: Timer },
  { name: 'analytics', labelKey: 'nav.analytics', icon: BarChart3 },
]

const SETTINGS: NavItem = { name: 'settings', labelKey: 'nav.settings', icon: SettingsIcon }

// En el móvil caben cuatro pestañas y «Más»: hábitos y metas pasan al menú.
const byName = (name: RouteName) => [...PRIMARY, ...SECONDARY].find((i) => i.name === name) as NavItem
const MOBILE_TABS: NavItem[] = [byName('today'), byName('tasks'), byName('subjects'), byName('planner')]
const MOBILE_MORE: NavItem[] = [
  byName('habits'),
  byName('goals'),
  byName('timetable'),
  byName('exams'),
  byName('focus'),
  byName('analytics'),
  SETTINGS,
]

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem
  active: boolean
  collapsed?: boolean
}) {
  const Icon = item.icon
  const t = useT()
  const label = t(item.labelKey)
  return (
    <a
      href={`#/${item.name}`}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-xl text-base font-medium transition-colors duration-150',
        collapsed ? 'h-9.5 w-9.5 justify-center' : 'h-9.5 px-2.5',
        active
          ? 'bg-surface-2 text-ink shadow-card ring-1 ring-line'
          : 'text-ink-2 hover:bg-surface-2/70 hover:text-ink',
      )}
    >
      <Icon
        size={17}
        strokeWidth={active ? 2.2 : 1.8}
        className={cn('shrink-0 transition-colors', active ? 'text-brand' : 'text-ink-3')}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </a>
  )
}

function NavGroup({ label, collapsed }: { label: string; collapsed?: boolean }) {
  if (collapsed) return <div className="my-2 h-px w-6 bg-line" />
  return <p className="eyebrow px-2.5 pb-1.5 pt-5">{label}</p>
}

/** Atajos a las asignaturas en curso, cada una con su color. */
function SubjectShortcuts({ activeId }: { activeId: string | null }) {
  const { state } = useApp()
  const t = useT()
  const subjects = state.subjects.filter(isOpenSubject)
  if (!subjects.length) return null
  return (
    <>
      <NavGroup label={t('nav.mySubjects')} />
      <ul className="space-y-0.5">
        {subjects.map((s) => (
          <li key={s.id}>
            <a
              href={`#/subjects/${s.id}`}
              aria-current={activeId === s.id ? 'page' : undefined}
              title={s.name}
              className={cn(
                'flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150',
                activeId === s.id
                  ? 'bg-surface-2 text-ink ring-1 ring-line'
                  : 'text-ink-2 hover:bg-surface-2/70 hover:text-ink',
              )}
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: colorVar(s.color) }}
              />
              <span className="truncate">{subjectShort(s)}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  )
}

function ScorePill() {
  const { state, today } = useApp()
  const t = useT()
  const { score } = computeTodayScore(state, today)
  return (
    <a
      href="#/today"
      className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong"
    >
      <div className="relative h-8 w-8 shrink-0">
        <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-surface-3" />
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            stroke="var(--brand)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 15}
            strokeDashoffset={2 * Math.PI * 15 * (1 - score / 100)}
            style={{ transition: 'stroke-dashoffset 600ms ease-out' }}
          />
        </svg>
      </div>
      <div className="min-w-0">
        <p className="eyebrow truncate">{t('nav.todayScore')}</p>
        <p className="tnum text-md font-semibold leading-tight text-ink">{score}</p>
      </div>
    </a>
  )
}

export function AppShell({
  route,
  param,
  children,
}: {
  route: RouteName
  param?: string | null
  children: ReactNode
}) {
  const { state } = useApp()
  const t = useT()
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    setMoreOpen(false)
  }, [route])

  const initials = (state.profile.name || 'You')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-canvas">
      {/* ------------------------------ sidebar ----------------------------- */}
      <aside className="hidden w-[236px] shrink-0 flex-col border-r border-line bg-surface px-3 py-4 md:flex xl:w-[252px]">
        <a href="#/today" className="mb-1 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-surface-2">
          <Wordmark />
        </a>

        <button
          type="button"
          onClick={openPalette}
          className="mt-3 flex h-9.5 w-full items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-2.5 text-base text-ink-3 transition-colors hover:border-line-strong hover:text-ink-2"
        >
          <Search size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">{t('palette.open')}</span>
          <kbd className="shrink-0 rounded-md border border-line bg-surface px-1.5 py-0.5 font-sans text-2xs font-semibold text-ink-3">
            {paletteShortcut()}
          </kbd>
        </button>

        <nav className="mt-3 flex-1 overflow-y-auto no-scrollbar">
          <div className="space-y-0.5">
            {PRIMARY.map((item) => (
              <NavLink key={item.name} item={item} active={route === item.name} />
            ))}
          </div>
          <NavGroup label={t('nav.groupPlan')} />
          <div className="space-y-0.5">
            {SECONDARY.map((item) => (
              <NavLink key={item.name} item={item} active={route === item.name} />
            ))}
          </div>
          <SubjectShortcuts activeId={route === 'subjects' ? (param ?? null) : null} />
        </nav>

        <div className="space-y-1.5 border-t border-line pt-3">
          <ScorePill />
          <NavLink item={SETTINGS} active={route === 'settings'} />
          <div className="flex items-center gap-2.5 px-2.5 py-1.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-2xs font-semibold text-ink-2">
              {initials || 'YO'}
            </span>
            <span className="truncate text-sm font-medium text-ink-2">
              {state.profile.name || t('nav.workspace')}
            </span>
          </div>
        </div>
      </aside>

      {/* ------------------------------- main ------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Opaca a propósito: con la barra translúcida el contenido que pasa
            por detrás se leía como texto encima de la navegación. */}
        <header
          className={cn(
            'sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:hidden',
            route === 'planner' && 'hidden',
          )}
        >
          <a href="#/today" className="-my-2 flex min-w-0 items-center gap-2 py-2">
            <LogoMark size={26} />
            <span className="truncate text-md font-semibold tracking-[-0.02em]">
              Day<span className="text-brand-ink">Flow</span>
            </span>
          </a>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={openPalette}
              aria-label={t('palette.open')}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-line bg-surface-2 text-ink-2 transition-colors hover:text-ink"
            >
              <Search size={17} />
            </button>
            <a
              href="#/focus"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-brand-soft px-3 text-sm font-semibold text-brand-ink"
            >
              <Timer size={15} />
              {t('nav.focus')}
            </a>
          </div>
        </header>

        <main id="dayflow-main" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 sm:px-6 md:pb-10 md:pt-7 xl:px-8">
            {children}
          </div>
        </main>
      </div>

      {/* ---------------------------- mobile tabs --------------------------- */}
      <nav
        aria-label={t('nav.primary')}
        className="safe-b fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-line bg-surface md:hidden"
      >
        {MOBILE_TABS.map((item) => {
          const Icon = item.icon
          const active = route === item.name
          return (
            <a
              key={item.name}
              href={`#/${item.name}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-2xs font-medium transition-colors',
                active ? 'text-brand-ink' : 'text-ink-3',
              )}
            >
              <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
              <span className="max-w-full truncate px-0.5">{t(item.labelKey)}</span>
            </a>
          )
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={moreOpen}
          className={cn(
            'flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-2xs font-medium transition-colors',
            MOBILE_MORE.some((m) => m.name === route) || moreOpen ? 'text-brand-ink' : 'text-ink-3',
          )}
        >
          <Ellipsis size={20} />
          {t('nav.more')}
        </button>
      </nav>

      {moreOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 animate-[fade_0.2s_ease-out_both] bg-[rgb(20_16_14/0.4)]" />
          <div
            className="safe-b absolute inset-x-0 bottom-[62px] mx-3 animate-[sheet_0.28s_cubic-bezier(0.22,1,0.36,1)_both] rounded-2xl border border-line bg-surface p-2 shadow-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {MOBILE_MORE.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => {
                    navigate(item.name)
                    setMoreOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-base font-medium transition-colors',
                    route === item.name ? 'bg-brand-soft text-brand-ink' : 'text-ink-2 hover:bg-surface-2',
                  )}
                >
                  <Icon size={18} />
                  {t(item.labelKey)}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/** Standard page heading used by every feature screen. */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3', className)}>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.025em] text-ink sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-base text-ink-3">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}
