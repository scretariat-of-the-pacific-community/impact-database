'use client';

import { useEffect, useState } from 'react';
import { config } from '@/lib/config';

export default function DebugConfigPage() {
  const [clientConfig, setClientConfig] = useState<any>(null);

  useEffect(() => {
    setClientConfig({
      API_BASE_URL: config.API.BASE_URL,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
      NODE_ENV: process.env.NODE_ENV,
      window_location: typeof window !== 'undefined' ? window.location.href : 'N/A',
    });
  }, []);

  return (
    <div className="min-h-screen bg-ocean-900 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">Configuration Debug Page</h1>
      
      <div className="bg-ocean-800 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">Client-Side Configuration</h2>
        <pre className="bg-black/30 p-4 rounded overflow-auto">
          {JSON.stringify(clientConfig, null, 2)}
        </pre>
      </div>

      <div className="bg-ocean-800 p-6 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-4">Test API Call</h2>
        <button
          onClick={async () => {
            try {
              const response = await fetch('/api/user/stats');
              console.log('API Response:', response.status, await response.json());
            } catch (error) {
              console.error('API Error:', error);
            }
          }}
          className="bg-pacific-500 hover:bg-pacific-600 px-4 py-2 rounded"
        >
          Test /api/user/stats
        </button>
      </div>

      <div className="bg-ocean-800 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Instructions</h2>
        <ol className="list-decimal list-inside space-y-2">
          <li>Check if NEXT_PUBLIC_API_URL is set correctly</li>
          <li>Verify API_BASE_URL matches expected backend URL</li>
          <li>Open browser DevTools Console to see debug logs</li>
          <li>Click "Test API Call" to see actual request behavior</li>
        </ol>
      </div>
    </div>
  );
}
