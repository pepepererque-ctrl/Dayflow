/** Evento que abre la paleta de comandos desde cualquier botón de la interfaz. */
export const PALETTE_EVENT = 'dayflow:palette'

export function openPalette(): void {
  window.dispatchEvent(new Event(PALETTE_EVENT))
}

/** «⌘K» en Mac y «Ctrl K» en el resto, para mostrarlo en la interfaz. */
export function paletteShortcut(): string {
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
  return mac ? '⌘K' : 'Ctrl K'
}
