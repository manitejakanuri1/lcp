import type { ReactNode } from 'react'

interface ButtonProps {
    children: ReactNode
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
    fullWidth?: boolean
    onClick?: () => void
    className?: string
}

export function Button({
    children,
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    loading = false,
    fullWidth = false,
    onClick,
    className = ''
}: ButtonProps) {
    const baseStyles = `
    inline-flex items-center justify-center gap-2 font-medium
    rounded-lg border cursor-pointer transition-all duration-150
    disabled:opacity-50 disabled:cursor-not-allowed
    active:scale-[0.98] focus:outline-none
  `

    const variantStyles = {
        primary: 'bg-[var(--color-primary)] border-[var(--color-primary)] text-white shadow-sm hover:bg-[var(--color-primary-hover)] hover:border-[var(--color-primary-hover)] hover:shadow-md',
        secondary: 'bg-[var(--color-surface-elevated)] text-[var(--color-text)] border-[var(--color-border)] hover:bg-[var(--color-surface)] hover:border-[var(--color-text-muted)]',
        danger: 'bg-[var(--color-danger)] border-[var(--color-danger)] text-white hover:bg-red-600 hover:border-red-600',
        ghost: 'bg-transparent border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-elevated)]',
        outline: 'bg-transparent border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-light)]'
    }

    const sizeStyles = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-4 py-2 text-sm',
        lg: 'px-5 py-2.5 text-sm'
    }

    return (
        <button
            type={type}
            disabled={disabled || loading}
            onClick={onClick}
            className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
        >
            {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                    />
                    <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                </svg>
            )}
            {children}
        </button>
    )
}
