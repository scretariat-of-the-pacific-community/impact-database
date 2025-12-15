'use client';

import clsx from 'clsx';
import React, { forwardRef } from 'react';

type InputVariant = 'dark' | 'light';
type InputSize = 'sm' | 'md' | 'lg';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  size?: InputSize;
  fullWidth?: boolean;
}

const baseClasses =
  'rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed placeholder:transition';

const variantClasses: Record<InputVariant, string> = {
  dark: 'bg-deep-900/60 border-white/15 text-white placeholder:text-white/45 focus-visible:ring-pacific-400 focus-visible:ring-offset-deep-950',
  light:
    'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-brand-500 focus-visible:ring-offset-white',
};

const sizeClasses: Record<InputSize, string> = {
  sm: 'h-10 px-3 text-sm',
  md: 'h-12 px-4 text-base',
  lg: 'h-14 px-4 text-base',
};

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, variant = 'dark', size = 'md', fullWidth = true, ...props },
    ref
  ) => (
    <input
      ref={ref}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  )
);

Input.displayName = 'Input';

export default Input;
