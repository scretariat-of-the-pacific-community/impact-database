import { redirect } from 'next/navigation';
import { getServerAuthState } from '@/lib/server-auth';
import ProfileClient from './ProfileClient';

export default async function ProfilePage() {
  const { isAuthenticated } = await getServerAuthState();
  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent('/profile');
    redirect(`/auth/login?returnUrl=${returnUrl}`);
  }
  return <ProfileClient />;
}
