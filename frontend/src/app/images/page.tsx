'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Legacy /images route now simply redirects to /search for a unified browsing experience.
 * Keeping this page lightweight prevents old modal code from being bundled and avoids build errors.
 */
export default function ImagesPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/search');
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-deep-950 via-deep-900 to-deep-950">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-pacific-500 border-r-transparent motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="mt-4 text-white/60">Redirecting to search...</p>
      </div>
    </div>
  );
}
