'use client';

import clsx from 'clsx';
import React, { ElementType, forwardRef } from 'react';

type CardVariant = 'elevated' | 'surface' | 'outline';
type CardPadding = 'none' | 'sm' | 'md' | 'lg';

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: ElementType;
  variant?: CardVariant;
  padding?: CardPadding;
  interactive?: boolean;
  heading?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
}

const variantClasses: Record<CardVariant, string> = {
  elevated: 'bg-surface text-slate-900 shadow-card border border-slate-100',
  surface: 'bg-white text-slate-900 border border-slate-100 shadow-sm',
  outline: 'bg-surface-muted text-slate-900 border border-slate-200',
};

const paddingClasses: Record<CardPadding, string> = {
  none: 'p-0',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

const Card = forwardRef<HTMLElement, CardProps>(
  (
    {
      as: Component = 'div',
      variant = 'surface',
      padding = 'md',
      interactive = false,
      heading,
      eyebrow,
      actions,
      className,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <Component
        ref={ref}
        className={clsx(
          'rounded-2xl transition-shadow duration-200',
          variantClasses[variant],
          paddingClasses[padding],
          interactive && 'hover:shadow-card-hover focus-within:shadow-card-hover',
          className
        )}
        {...props}
      >
        {(heading || eyebrow || actions) && (
          <div className={clsx('mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between', padding === 'none' && 'px-5 pt-5')}>
            <div>
              {eyebrow && (
                <p className="text-xs uppercase tracking-wide text-slate-500 mb-1">{eyebrow}</p>
              )}
              {heading && (
                <h3 className="text-lg font-semibold text-slate-900">{heading}</h3>
              )}
            </div>
            {actions && <div className="flex items-center gap-2">{actions}</div>}
          </div>
        )}
        {children}
      </Component>
    );
  }
);

Card.displayName = 'Card';

export default Card;
