
import React, { useEffect } from 'react';

interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'type'> {
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'gold' | 'danger' | 'warning';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  iconOnly?: boolean;
  fullWidth?: boolean;
  type?: 'button' | 'submit';
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  iconOnly = false,
  fullWidth = true,
  disabled,
  type = 'button',
  className = '',
  'aria-label': ariaLabel,
  ...buttonProps
}: ButtonProps) {
  useEffect(() => {
    if ((import.meta as any).env?.DEV && iconOnly && !ariaLabel) {
      console.warn('Button with iconOnly requires an aria-label.');
    }
  }, [ariaLabel, iconOnly]);

  const baseStyle = 'app-button relative inline-flex items-center justify-center font-semibold';

  const variants = {
    primary: 'app-button--primary',
    secondary: 'app-button--secondary',
    gold: 'app-button--gold',
    danger: 'app-button--danger',
    warning: 'app-button--warning',
  };
  const sizes = {
    sm: 'app-button--sm px-3 text-xs',
    md: 'app-button--md px-4 text-sm',
    lg: 'app-button--lg px-5 text-base',
  };
  const width = iconOnly ? 'w-auto aspect-square px-0' : fullWidth ? 'w-full' : 'w-auto';

  return (
    <button
      aria-busy={loading}
      aria-label={ariaLabel}
      type={type}
      disabled={disabled || loading}
      className={`${baseStyle} ${sizes[size]} ${width} ${variants[variant]} ${className}`}
      {...buttonProps}
    >
      {loading ? (
        <span
          aria-hidden="true"
          className="absolute h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
      ) : null}
      <span className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap ${loading ? 'invisible' : ''}`}>{children}</span>
    </button>
  );
}
