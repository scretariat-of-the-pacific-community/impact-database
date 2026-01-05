'use client';

import clsx from 'clsx';
import React, { forwardRef, useId } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

type SelectVariant = 'dark' | 'light';
type SelectSize = 'sm' | 'md' | 'lg';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  /** Visual variant - 'dark' for dark backgrounds, 'light' for light backgrounds */
  variant?: SelectVariant;
  /** Size of the select */
  size?: SelectSize;
  /** Whether to take full width of container */
  fullWidth?: boolean;
  /** Visible label text (recommended for a11y) */
  label?: string;
  /** Hide the visible label but keep it for screen readers */
  labelHidden?: boolean;
  /** Helper text shown below the select */
  helperText?: string;
  /** Error message - shows error styling when present */
  error?: string;
  /** Show loading spinner */
  isLoading?: boolean;
  /** Icon to show on the left side */
  leftIcon?: React.ReactNode;
}

const baseClasses =
  'rounded-xl border appearance-none transition pr-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed [&>option]:text-slate-900 [&>option]:bg-white';

const variantClasses: Record<SelectVariant, string> = {
  dark: 'bg-deep-900/60 border-white/15 text-white focus-visible:ring-pacific-400 focus-visible:ring-offset-deep-950',
  light: 'bg-white border-slate-200 text-slate-900 focus-visible:ring-brand-500 focus-visible:ring-offset-white',
};

const variantErrorClasses: Record<SelectVariant, string> = {
  dark: 'border-coral-500/60 focus-visible:ring-coral-400',
  light: 'border-red-500 focus-visible:ring-red-500',
};

const sizeClasses: Record<SelectSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-sm',
  lg: 'h-12 px-4 text-base',
};

const iconSizeClasses: Record<SelectSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const labelClasses: Record<SelectVariant, string> = {
  dark: 'text-white/70',
  light: 'text-slate-700',
};

const helperClasses: Record<SelectVariant, string> = {
  dark: 'text-white/50',
  light: 'text-slate-500',
};

const errorTextClasses: Record<SelectVariant, string> = {
  dark: 'text-coral-400',
  light: 'text-red-600',
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      variant = 'dark',
      size = 'md',
      fullWidth = true,
      label,
      labelHidden = false,
      helperText,
      error,
      isLoading = false,
      leftIcon,
      disabled,
      id: providedId,
      children,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const id = providedId || generatedId;
    const helperId = `${id}-helper`;
    const errorId = `${id}-error`;
    
    const hasError = Boolean(error);
    const describedBy = [
      helperText ? helperId : null,
      hasError ? errorId : null,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <div className={clsx(fullWidth && 'w-full')}>
        {/* Label */}
        {label && (
          <label
            htmlFor={id}
            className={clsx(
              'block text-sm font-medium mb-1.5',
              labelClasses[variant],
              labelHidden && 'sr-only'
            )}
          >
            {label}
          </label>
        )}

        {/* Select wrapper for icon positioning */}
        <div className="relative">
          {/* Left icon */}
          {leftIcon && (
            <div className={clsx(
              'absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none',
              variant === 'dark' ? 'text-white/50' : 'text-slate-400'
            )}>
              {leftIcon}
            </div>
          )}

          <select
            ref={ref}
            id={id}
            disabled={disabled || isLoading}
            aria-label={!label ? ariaLabel : undefined}
            aria-invalid={hasError}
            aria-describedby={describedBy}
            className={clsx(
              baseClasses,
              variantClasses[variant],
              hasError && variantErrorClasses[variant],
              sizeClasses[size],
              fullWidth && 'w-full',
              leftIcon && 'pl-10',
              className
            )}
            {...props}
          >
            {children}
          </select>

          {/* Right side - chevron or loading spinner */}
          <div className={clsx(
            'absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none',
            variant === 'dark' ? 'text-white/50' : 'text-slate-400'
          )}>
            {isLoading ? (
              <Loader2 className={clsx(iconSizeClasses[size], 'animate-spin')} />
            ) : (
              <ChevronDown className={iconSizeClasses[size]} />
            )}
          </div>
        </div>

        {/* Helper text */}
        {helperText && !hasError && (
          <p id={helperId} className={clsx('mt-1.5 text-xs', helperClasses[variant])}>
            {helperText}
          </p>
        )}

        {/* Error message */}
        {hasError && (
          <p id={errorId} className={clsx('mt-1.5 text-xs', errorTextClasses[variant])} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export default Select;
