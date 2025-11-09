'use client';

import clsx from 'clsx';
import React from 'react';

export interface FormFieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  required?: boolean;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  hint,
  error,
  required,
  children,
  className,
  ...props
}) => {
  const describedById = error && htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={clsx('space-y-2', className)} {...props}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={htmlFor} className="text-sm font-medium text-slate-900">
          {label}
          {required && <span className="ml-1 text-danger-600" aria-hidden="true">*</span>}
        </label>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      <div aria-describedby={describedById}>{children}</div>
      {error && (
        <p id={describedById} className="text-sm text-danger-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

export default FormField;
