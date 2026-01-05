import { useMemo } from 'react';
import { useAuth } from '@/providers/auth-provider';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  reviewer: ['review:read', 'review:approve', 'review:reject', 'analytics:read', 'collaboration:access'],
  contributor: ['upload:create', 'upload:read', 'metadata:read', 'metadata:update', 'profile:settings:update'],
  viewer: ['read'],
};

export function usePermission(permission: string): boolean {
  const { user } = useAuth();

  return useMemo(() => {
    if (!user) return false;
    const roles = Array.isArray((user as any).roles) ? (user as any).roles : (user as any).role ? [(user as any).role] : [];
    const userPerms = roles.flatMap((r: string) => ROLE_PERMISSIONS[r] || []);
    return userPerms.includes('*') || userPerms.includes(permission);
  }, [user, permission]);
}
