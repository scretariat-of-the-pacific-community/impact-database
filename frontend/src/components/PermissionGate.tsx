import React from 'react';
import { usePermission } from '@/hooks/usePermission';
import { Skeleton } from '@/components/design-system';
import { useAuth } from '@/providers/auth-provider';

interface PermissionGateProps {
  permission: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({ permission, fallback = null, children }: PermissionGateProps) {
  const hasPermission = usePermission(permission);
  const { isLoading } = useAuth();

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (!hasPermission) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
