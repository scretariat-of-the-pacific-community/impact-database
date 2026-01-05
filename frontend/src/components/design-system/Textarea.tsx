'use client';

import clsx from 'clsx';
import React, { forwardRef } from 'react';

type TextareaVariant = 'dark' | 'light';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: TextareaVariant;
  fullWidth?: boolean;
}

const baseClasses =
  'rounded-2xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed placeholder:transition';

const variantClasses: Record<TextareaVariant, string> = {
  dark: 'bg-deep-900/60 border-white/15 text-white placeholder:text-white/45 focus-visible:ring-pacific-400 focus-visible:ring-offset-deep-950',
  light:
    'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-brand-500 focus-visible:ring-offset-white',
};

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    { className, variant = 'dark', rows = 3, fullWidth = true, ...props },
    ref
  ) => (
    <textarea
      ref={ref}
      rows={rows}
      className={clsx(
        baseClasses,
        variantClasses[variant],
        fullWidth && 'w-full',
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = 'Textarea';

export default Textarea;
