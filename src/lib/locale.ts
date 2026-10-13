/**
 * The active BCP-47 locale, kept module-level so the date helpers can format
 * without every one of their ~40 call sites having to thread it through.
 * `I18nProvider` is the only writer.
 */
let active = 'en-GB'

export function setActiveLocale(locale: string): void {
  active = locale
}

export function activeLocale(): string {
  return active
}
