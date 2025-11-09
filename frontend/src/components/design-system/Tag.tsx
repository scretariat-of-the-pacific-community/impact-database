'use client';

import clsx from 'clsx';
import React from 'react';

type TagTone = 'brand' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: TagTone;
  icon?: React.ReactNode;
  onRemove?: () => void;
  removableLabel?: string;
}

const toneStyles: Record<TagTone, string> = {
  brand: 'bg-brand-50 text-brand-800 border border-brand-200',
  info: 'bg-ocean-50 text-ocean-800 border border-ocean-200',
  success: 'bg-success-50 text-success-800 border border-success-200',
  warning: 'bg-warning-50 text-warning-800 border border-warning-200',
  danger: 'bg-danger-50 text-danger-700 border border-danger-200',
  neutral: 'bg-slate-100 text-slate-700 border border-slate-200',
};

const Tag: React.FC<TagProps> = ({
  tone = 'neutral',
  icon,
  children,
  className,
  onRemove,
  removableLabel = 'Remove tag',
  ...props
}) => {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium',
        toneStyles[tone],
        className
      )}
      {...props}
    >
      {icon && <span className="text-base" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-1 rounded-full p-0.5 text-current hover:bg-white/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-current"
          aria-label={removableLabel}
        >
          ×
        </button>
      )}
    </span>
  );
};

export default Tag;
