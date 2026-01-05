import { redirect } from 'next/navigation';
import { getServerAuthState } from '@/lib/server-auth';
import UploadClient from './UploadClient';

export default async function UploadPage() {
  const { isAuthenticated } = await getServerAuthState();
  if (!isAuthenticated) {
    const returnUrl = encodeURIComponent('/upload');
    redirect(`/auth/login?returnUrl=${returnUrl}`);
  }
  return <UploadClient />;
}
