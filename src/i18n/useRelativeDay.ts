import { useCallback } from 'react'
import { relativeDay } from '@/lib/date'
import type { ISODate } from '@/types'
import { useT } from './I18nProvider'

/** Turns the date descriptor into copy in the active language. */
export function useRelativeDay() {
  const t = useT()
  return useCallback(
    (iso: ISODate, from?: ISODate) => {
      const rel = relativeDay(iso, from)
      switch (rel.kind) {
        case 'today':
          return t('date.today')
        case 'tomorrow':
          return t('date.tomorrow')
        case 'yesterday':
          return t('date.yesterday')
        default:
          return rel.text
      }
    },
    [t],
  )
}
