'use client';

import clsx from 'clsx';
import React, { forwardRef } from 'react';

type SelectVariant = 'dark' | 'light';
type SelectSize = 'sm' | 'md';

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  variant?: SelectVariant;
  size?: SelectSize;
  fullWidth?: boolean;
}

const baseClasses =
  'rounded-2xl border appearance-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed';

const variantClasses: Record<SelectVariant, string> = {
  dark: 'bg-deep-900/60 border-white/15 text-white placeholder:text-white/45 focus-visible:ring-pacific-400 focus-visible:ring-offset-deep-950',
  light:
    'bg-white border-slate-200 text-slate-900 focus-visible:ring-brand-500 focus-visible:ring-offset-white',
};

const sizeClasses: Record<SelectSize, string> = {
  sm: 'h-11 px-3 text-sm',
  md: 'h-12 px-4 text-base',
};

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      variant = 'dark',
      size = 'md',
      fullWidth = true,
      children,
      ...props
    },
    ref
  ) => (
    <select
      ref={ref}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    >
      {children}
    </select>
  )
);

Select.displayName = 'Select';

export default Select;
