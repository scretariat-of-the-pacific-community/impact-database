'use client';

import React from 'react';
import Card, { CardProps } from './Card';
import clsx from 'clsx';

export interface SectionShellProps extends Omit<
  CardProps,
  'heading' | 'eyebrow' | 'actions' | 'title'
> {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  titleClassName?: string;
  descriptionClassName?: string;
}

const SectionShell: React.FC<SectionShellProps> = ({
  title,
  eyebrow,
  description,
  actions,
  titleClassName,
  descriptionClassName,
  children,
  variant = 'elevated',
  padding = 'lg',
  ...cardProps
}) => {
  const isDark = false;

  return (
    <Card variant={variant} padding={padding} {...cardProps}>
      <div className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            {eyebrow && (
              <p
                className={clsx(
                  'mb-2 text-xs uppercase tracking-wide font-medium',
                  isDark ? 'text-pacific-300' : 'text-slate-500'
                )}
              >
                {eyebrow}
              </p>
            )}
            <h2
              className={clsx(
                'text-2xl font-bold sm:text-3xl',
                isDark ? 'text-white' : 'text-slate-900',
                titleClassName
              )}
            >
              {title}
            </h2>
            {description && (
              <p
                className={clsx(
                  'mt-2 text-sm sm:text-base',
                  isDark ? 'text-white/70' : 'text-slate-600',
                  descriptionClassName
                )}
              >
                {description}
              </p>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-2 sm:ml-4">{actions}</div>
          )}
        </div>
      </div>
      {children}
    </Card>
  );
};

export default SectionShell;
