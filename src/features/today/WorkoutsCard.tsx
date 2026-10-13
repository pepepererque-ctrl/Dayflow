import { useCallback, useEffect, useState } from 'react'
import { Dumbbell, RefreshCw } from 'lucide-react'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/cn'
import { formatShortDate, formatDuration } from '@/lib/date'
import { fetchRecentWorkouts, isThisWeek, workoutDurationMin, type PepeLiftWorkout } from '@/lib/pepelift'
import { useT } from '@/i18n/I18nProvider'
import { useApp } from '@/store/AppStore'
import { useSync } from '@/store/SyncProvider'

type Fetch = 'idle' | 'loading' | 'error' | 'ready'

/**
 * PepeLift and DayFlow share one Supabase project and the same accounts, so
 * this card only appears once the user is signed into DayFlow's cloud sync —
 * that sign-in doubles as proof they can see their own PepeLift data under
 * row-level security. Read-only: workouts are still logged in PepeLift itself.
 */
export function WorkoutsCard() {
  const { userId } = useSync()
  const { state } = useApp()
  const t = useT()
  const [workouts, setWorkouts] = useState<PepeLiftWorkout[] | null>(null)
  const [status, setStatus] = useState<Fetch>('idle')

  const load = useCallback(() => {
    if (!userId) return
    setStatus('loading')
    fetchRecentWorkouts(userId).then((result) => {
      if (result === null) {
        setStatus('error')
        return
      }
      setWorkouts(result)
      setStatus('ready')
    })
  }, [userId])

  useEffect(() => {
    if (!userId) {
      setWorkouts(null)
      setStatus('idle')
      return
    }
    load()
  }, [userId, load])

  if (!userId) return null

  const thisWeek = workouts?.filter((w) => isThisWeek(w.startedAt, state.settings.weekStartsOn)) ?? []
  const weekSets = thisWeek.reduce((sum, w) => sum + w.sets, 0)
  const weekVolume = thisWeek.reduce((sum, w) => sum + w.volumeKg, 0)

  return (
    <Card>
      <CardHeader
        title={t('workouts.title')}
        subtitle={workouts?.length ? t('workouts.subtitle', { n: thisWeek.length }) : t('workouts.subtitleEmpty')}
        icon={<Dumbbell size={16} />}
        action={
          <Button
            size="sm"
            variant="ghost"
            onClick={load}
            disabled={status === 'loading'}
            aria-label={t('workouts.retry')}
          >
            <RefreshCw size={13} className={cn(status === 'loading' && 'animate-spin')} />
          </Button>
        }
      />

      {status === 'ready' && workouts && workouts.length > 0 ? (
        <div className="p-5 pt-2">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <p className="tnum text-xl font-semibold leading-[1.1] text-ink">{weekSets}</p>
              <p className="mt-1 text-2xs text-ink-3">{t('workouts.thisWeekSets')}</p>
            </div>
            <div className="rounded-xl bg-surface-2 px-3.5 py-3">
              <p className="tnum text-xl font-semibold leading-[1.1] text-ink">{weekVolume}</p>
              <p className="mt-1 text-2xs text-ink-3">{t('workouts.thisWeekVolume')}</p>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-line">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line bg-surface-2 text-2xs uppercase tracking-wide text-ink-3">
                  <th className="px-3 py-2 font-medium">{t('workouts.colDate')}</th>
                  <th className="px-3 py-2 font-medium">{t('workouts.colName')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('workouts.colSets')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('workouts.colVolume')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {workouts.slice(0, 6).map((w) => {
                  const durationMin = workoutDurationMin(w)
                  return (
                    <tr key={w.id}>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-2">
                        {formatShortDate(w.startedAt.slice(0, 10))}
                      </td>
                      <td className="px-3 py-2 text-ink">
                        <span className="truncate">{w.name}</span>
                        {durationMin === null ? null : (
                          <span className="ml-1.5 text-2xs text-ink-3">{formatDuration(durationMin)}</span>
                        )}
                      </td>
                      <td className="tnum px-3 py-2 text-right text-ink-2">{w.sets}</td>
                      <td className="tnum px-3 py-2 text-right font-medium text-ink">{w.volumeKg}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : status === 'error' ? (
        <div className="p-2">
          <EmptyState
            compact
            icon={<Dumbbell size={18} />}
            title={t('workouts.errorTitle')}
            description={t('workouts.errorBody')}
            action={
              <Button size="sm" variant="secondary" onClick={load}>
                <RefreshCw size={14} />
                {t('workouts.retry')}
              </Button>
            }
          />
        </div>
      ) : status === 'ready' ? (
        <div className="p-2">
          <EmptyState
            compact
            icon={<Dumbbell size={18} />}
            title={t('workouts.emptyTitle')}
            description={t('workouts.emptyBody')}
          />
        </div>
      ) : (
        <div className="p-5 pt-2">
          <div className="h-24 animate-pulse rounded-xl bg-surface-2" />
        </div>
      )}
    </Card>
  )
}
