import { useEffect, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { cn } from '@/lib/cn'
import { CLASS_KINDS } from '@/lib/constants'
import { clockFromMinutes, formatClock, formatDuration, minutesFromClock, nowClock } from '@/lib/date'
import { navigate } from '@/lib/router'
import { subjectShort } from '@/lib/subjects'
import { classesOn, nextClass } from '@/lib/timetable'
import { useApp } from '@/store/AppStore'
import { useT } from '@/i18n/I18nProvider'
import { useRelativeDay } from '@/i18n/useRelativeDay'
import { SubjectChip } from '../subjects/SubjectBits'

/**
 * Las clases de hoy y la siguiente. Si no hay horario, no aparece: así la
 * pantalla de Hoy no ocupa sitio con algo que el usuario aún no usa.
 */
export function ClassesCard() {
  const { state, today } = useApp()
  const t = useT()
  const relDay = useRelativeDay()
  const [now, setNow] = useState(() => minutesFromClock(nowClock()))

  useEffect(() => {
    const id = window.setInterval(() => setNow(minutesFromClock(nowClock())), 30_000)
    return () => window.clearInterval(id)
  }, [])

  if (!state.timetable.slots.length) return null

  const todays = classesOn(state, today)
  const upcoming = nextClass(state, today, now)
  const current = todays.find((c) => now >= c.start && now < c.end)

  let summary: string
  if (current) {
    summary = t('classes.inProgress', { subject: subjectShort(current.subject) })
  } else if (upcoming && upcoming.days === 0) {
    summary = t('classes.nextIn', {
      subject: subjectShort(upcoming.occurrence.subject),
      duration: formatDuration(upcoming.occurrence.start - now),
    })
  } else if (todays.length) {
    summary = t('classes.done')
  } else if (upcoming) {
    summary = t('classes.noneNext', {
      day: relDay(upcoming.occurrence.date, today),
      time: formatClock(clockFromMinutes(upcoming.occurrence.start)),
      subject: subjectShort(upcoming.occurrence.subject),
    })
  } else {
    summary = t('classes.none')
  }

  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('classes.title')}
        subtitle={summary}
        icon={<CalendarDays size={16} />}
        action={
          <Button size="sm" variant="ghost" onClick={() => navigate('timetable')}>
            {t('classes.seeAll')}
          </Button>
        }
      />
      {todays.length ? (
        <ul className="flex-1 space-y-0.5 p-3 pt-2">
          {todays.map((c) => {
            const live = c === current
            const past = now >= c.end
            return (
              <li
                key={c.slot.id}
                className={cn(
                  'flex items-center gap-3 rounded-xl px-2.5 py-2',
                  live && 'bg-brand-soft/60',
                  past && 'opacity-55',
                )}
              >
                <span className="tnum w-[5.5rem] shrink-0 text-xs font-semibold text-ink-2">
                  {formatClock(c.slot.start)}–{formatClock(c.slot.end)}
                </span>
                <span className="min-w-0 flex-1">
                  <SubjectChip subject={c.subject} />
                  <span className="mt-0.5 block truncate text-2xs text-ink-3">
                    {[t(CLASS_KINDS[c.slot.kind].labelKey), c.slot.room].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {live ? <Badge color="amber">{t('classes.now')}</Badge> : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="pb-4" />
      )}
    </Card>
  )
}
