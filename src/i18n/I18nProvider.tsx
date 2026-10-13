import { createContext, useContext, type ReactNode } from 'react'
import { es, type TranslationKey } from './es'
import { setActiveLocale } from '@/lib/locale'

/** DayFlow es una app en español. Un único idioma, un único diccionario. */
export const LOCALE = 'es-ES'

/**
 * Los valores son cadenas o funciones. Quien llama recibe el tipo del
 * parámetro inferido, así que `t('today.tasksSub', { open, done })` se comprueba
 * en tiempo de compilación y falta de argumento es un error.
 */
type Entry<K extends TranslationKey> = (typeof es)[K]

type Translate = <K extends TranslationKey>(
  key: K,
  ...args: Entry<K> extends (v: infer P) => string ? [P] : []
) => string

const translate = ((key, ...args) => {
  const entry = (es as Record<string, unknown>)[key]
  if (typeof entry === 'function') {
    return (entry as (v: unknown) => string)(args[0])
  }
  return typeof entry === 'string' ? entry : String(key)
}) as Translate

interface I18nValue {
  locale: string
  t: Translate
}

const VALUE: I18nValue = { locale: LOCALE, t: translate }

const I18nContext = createContext<I18nValue>(VALUE)

export function I18nProvider({ children }: { children: ReactNode }) {
  // Se fija durante el render: los helpers de fecha lo leen mientras se
  // construye el primer árbol, así que un efecto llegaría un pintado tarde.
  setActiveLocale(LOCALE)
  return <I18nContext.Provider value={VALUE}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  return useContext(I18nContext)
}

/** Atajo para componentes que solo necesitan la función de traducción. */
export function useT(): Translate {
  return translate
}
