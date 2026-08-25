import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type ButtonVariant = 'primary' | 'secondary' | 'ghost'
type ButtonSize = 'sm' | 'md'

interface ButtonStyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
}

export interface ButtonProps
  extends ButtonStyleProps,
    ButtonHTMLAttributes<HTMLButtonElement> {}

export function Button({
  children,
  className,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: PropsWithChildren<ButtonProps>) {
  return (
    <button
      className={getButtonClassName({ className, size, variant })}
      type={type}
      {...props}
    >
      {children}
    </button>
  )
}

export interface ButtonLinkProps extends ButtonStyleProps, LinkProps {}

export function ButtonLink({
  children,
  className,
  size = 'md',
  variant = 'primary',
  ...props
}: PropsWithChildren<ButtonLinkProps>) {
  return (
    <Link className={getButtonClassName({ className, size, variant })} {...props}>
      {children}
    </Link>
  )
}

function getButtonClassName({
  className,
  size,
  variant,
}: Required<ButtonStyleProps> & { className?: string }): string {
  return [
    'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border font-semibold',
    'transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
    'disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-100 disabled:text-stone-400',
    sizeClasses[size],
    variantClasses[variant],
    className,
  ]
    .filter(Boolean)
    .join(' ')
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 type-caption',
  md: 'px-3.5 py-2 type-body',
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-brand-700 bg-brand-700 text-white hover:bg-brand-800',
  secondary: 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50',
  ghost: 'border-transparent bg-transparent text-stone-600 hover:bg-stone-100 hover:text-stone-950',
}
