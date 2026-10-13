import { CalendarDays, Clock3, Flag, GraduationCap, Layers, Pencil, Timer, Trash2 } from 'lucide-react'
import { Badge, Dot } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { useConfirm } from '@/components/ui/Confirm'
import { useToast } from '@/components/ui/Toast'
import { CATEGORIES, PRIORITIES, STATUSES, STATUS_ORDER, colorVar } from '@/lib/constants'
import { formatClock, formatDuration, formatShortDate } from '@/lib/date'
import { useT } from '@/i18n/I18nProvider'
import { useRelativeDay } from '@/i18n/useRelativeDay'
import { navigate } from '@/lib/router'
import { useApp } from '@/store/AppStore'
import type { Task, TaskStatus } from '@/types'
import { isOverdue } from './taskUtils'

function DetailRow({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex w-[110px] shrink-0 items-center gap-2 text-sm text-ink-3">
        {icon}
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm text-ink">{children}</div>
    </div>
  )
}

export function TaskDetail({
  task,
  onClose,
  onEdit,
}: {
  task: Task | null
  onClose: () => void
  onEdit: (task: Task) => void
}) {
  const { state, dispatch } = useApp()
  const confirm = useConfirm()
  const { toast } = useToast()
  const t = useT()
  const relDay = useRelativeDay()

  if (!task) return null

  const goal = task.goalId ? state.goals.find((g) => g.id === task.goalId) : null
  const subject = task.subjectId ? state.subjects.find((s) => s.id === task.subjectId) : null
  const sessions = state.sessions.filter((s) => s.taskId === task.id)
  const focusMinutes = sessions.reduce((sum, s) => sum + s.actualMinutes, 0)
  const overdue = isOverdue(task)

  const remove = async () => {
    const ok = await confirm({
      title: t('tasks.deleteTitle'),
      message: t('tasks.deleteBody', { title: task.title }),
      confirmLabel: t('common.delete'),
      destructive: true,
    })
    if (!ok) return
    dispatch({ type: 'deleteTask', id: task.id })
    toast(t('tasks.deleted'), { tone: 'info' })
    onClose()
  }

  return (
    <Modal
      open={task !== null}
      onClose={onClose}
      size="lg"
      title={task.title}
      description={
        task.status === 'done' && task.completedAt
          ? t('taskDetail.completedOn', { date: formatShortDate(task.completedAt.slice(0, 10)) })
          : undefined
      }
      footer={
        <>
          <Button variant="danger" size="sm" onClick={remove}>
            <Trash2 size={14} />
            {t('common.delete')}
          </Button>
          <div className="flex-1" />
          <Button variant="secondary" onClick={() => onEdit(task)}>
            <Pencil size={14} />
            {t('common.edit')}
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              navigate(`focus?task=${task.id}`)
              onClose()
            }}
          >
            <Timer size={15} />
            {t('taskDetail.startFocus')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 eyebrow">{t('taskDetail.status')}</p>
          <Segmented
            ariaLabel="Task status"
            value={task.status}
            onChange={(status: TaskStatus) => dispatch({ type: 'moveTask', id: task.id, status })}
            options={STATUS_ORDER.map((s) => ({ value: s, label: t(STATUSES[s].labelKey) }))}
          />
        </div>

        <div className="divide-y divide-line rounded-xl border border-line px-4">
          <DetailRow icon={<Flag size={14} />} label={t('taskDetail.priority')}>
            <Badge color={PRIORITIES[task.priority].color}>{t(PRIORITIES[task.priority].labelKey)}</Badge>
          </DetailRow>
          <DetailRow icon={<Layers size={14} />} label={t('taskDetail.category')}>
            <span className="inline-flex items-center gap-2">
              <Dot color={CATEGORIES[task.category].color} />
              {t(CATEGORIES[task.category].labelKey)}
            </span>
          </DetailRow>
          <DetailRow icon={<CalendarDays size={14} />} label={t('taskDetail.due')}>
            {task.dueDate ? (
              <span className={overdue ? 'font-medium text-bad' : undefined}>
                {relDay(task.dueDate)}
                <span className="text-ink-3"> · {formatShortDate(task.dueDate)}</span>
                {overdue ? t('taskDetail.overdueSuffix') : ''}
              </span>
            ) : (
              <span className="text-ink-3">{t('taskDetail.noDue')}</span>
            )}
          </DetailRow>
          <DetailRow icon={<Clock3 size={14} />} label={t('taskDetail.time')}>
            {task.dueTime ? formatClock(task.dueTime) : <span className="text-ink-3">{t('taskDetail.anyTime')}</span>}
          </DetailRow>
          <DetailRow icon={<Timer size={14} />} label={t('taskDetail.estimate')}>
            {task.estimateMin ? (
              formatDuration(task.estimateMin)
            ) : (
              <span className="text-ink-3">{t('taskDetail.notEstimated')}</span>
            )}
          </DetailRow>
          {subject ? (
            <DetailRow icon={<GraduationCap size={14} />} label={t('taskDetail.subject')}>
              <button
                type="button"
                onClick={() => {
                  navigate(`subjects/${subject.id}`)
                  onClose()
                }}
                className="inline-flex items-center gap-2 font-medium hover:underline"
                style={{ color: colorVar(subject.color) }}
              >
                {subject.name}
              </button>
            </DetailRow>
          ) : null}
          {goal ? (
            <DetailRow icon={<Flag size={14} />} label={t('taskDetail.goal')}>
              <button
                type="button"
                onClick={() => {
                  navigate(`goals/${goal.id}`)
                  onClose()
                }}
                className="inline-flex items-center gap-2 font-medium hover:underline"
                style={{ color: colorVar(goal.color) }}
              >
                {goal.title}
              </button>
            </DetailRow>
          ) : null}
        </div>

        {task.notes ? (
          <div>
            <p className="mb-2 eyebrow">{t('taskDetail.notes')}</p>
            <p className="whitespace-pre-wrap rounded-xl bg-surface-2 p-4 text-sm leading-relaxed text-ink-2">
              {task.notes}
            </p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 eyebrow">{t('taskDetail.focusTime')}</p>
          {sessions.length ? (
            <p className="text-sm text-ink-2">
              {t('taskDetail.focusSummary', {
                duration: formatDuration(focusMinutes),
                n: sessions.length,
              })}
            </p>
          ) : (
            <p className="text-sm text-ink-3">{t('taskDetail.noFocus')}</p>
          )}
        </div>
      </div>
    </Modal>
  )
}
