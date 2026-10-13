import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft'
type Size = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand-solid text-[var(--on-brand)] shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_1px_2px_rgb(16_20_28/0.12)] hover:bg-brand-hover',
  secondary: 'bg-surface text-ink border border-line-strong hover:bg-surface-2 hover:border-line-strong',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  soft: 'bg-brand-soft text-brand-ink hover:brightness-[0.97]',
  danger: 'bg-surface text-bad border border-line-strong hover:bg-bad hover:text-white hover:border-bad',
}

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-sm gap-1.5 rounded-lg',
  md: 'h-9.5 px-3.5 text-base gap-2 rounded-xl',
  lg: 'h-11 px-5 text-md gap-2 rounded-xl',
  icon: 'h-9.5 w-9.5 rounded-xl',
  'icon-sm': 'h-8 w-8 rounded-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Estira el botón al ancho de su contenedor. */
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', block, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        // `whitespace-nowrap`: una etiqueta partida en dos líneas rompe la
        // altura fija del control y descuadra la fila entera.
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium',
        'transition-[background-color,color,border-color,transform,opacity,filter] duration-150',
        // Empuje físico al pulsar. Solo transform: no provoca reflujo.
        'active:scale-[0.975]',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    />
  )
})
