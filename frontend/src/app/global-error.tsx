'use client';

import Error from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    // Log error to console in development, could be sent to logging service
    console.error('Global error:', error);
  }, [error]);

  return (
    <html>
      <body>
        {/* This is the default Next.js error page but it doesn't allow omitting the statusCode property yet. */}
        <Error statusCode={undefined as any} />
      </body>
    </html>
  );
}
