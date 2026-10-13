type ClassValue = string | number | false | null | undefined | ClassValue[]

/** Tiny classnames joiner — no dependency needed for what we do here. */
export function cn(...parts: ClassValue[]): string {
  const out: string[] = []
  for (const part of parts) {
    if (!part) continue
    if (Array.isArray(part)) {
      const nested = cn(...part)
      if (nested) out.push(nested)
    } else {
      out.push(String(part))
    }
  }
  return out.join(' ')
}
