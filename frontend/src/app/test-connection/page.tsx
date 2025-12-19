'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';

function DevTestConnection() {
  const [backendStatus, setBackendStatus] = useState<string>('Testing...');
  const [apiResponse, setApiResponse] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    testBackendConnection(controller.signal);
    
    return () => controller.abort();
  }, []);

  const testBackendConnection = async (signal?: AbortSignal) => {
    try {
      // Test basic connection
      const response = await fetch('http://localhost:8000/', {
        signal
      });
      const data = await response.json();
      setBackendStatus('✅ Connected successfully!');
      setApiResponse(data as Record<string, unknown>);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      setBackendStatus(`❌ Connection failed: ${error}`);
      console.error('Backend connection error:', error);
    }
  };

  const testAPIEndpoint = async () => {
    const controller = new AbortController();
    try {
      const response = await fetch('http://localhost:8000/search?limit=1', {
        signal: controller.signal
      });
      const data = await response.json();
      console.log('API test response:', data);
      toast.success('API test successful!', {
        description: 'Check console for details.',
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was cancelled, ignore
        return;
      }
      console.error('API test error:', error);
      toast.error('API test failed', {
        description: String(error),
      });
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Frontend ↔ Backend Connection Test</h1>

      <div style={{ marginBottom: '20px' }}>
        <h2>Connection Status:</h2>
        <p style={{ fontSize: '18px' }}>{backendStatus}</p>
      </div>

      {apiResponse && (
        <div style={{ marginBottom: '20px' }}>
          <h2>Backend Response:</h2>
          <pre style={{ background: '#f5f5f5', padding: '10px', borderRadius: '5px' }}>
            {JSON.stringify(apiResponse, null, 2)}
          </pre>
        </div>
      )}

      <div>
        <button
          onClick={() => testBackendConnection()}
          style={{ marginRight: '10px', padding: '10px 20px', cursor: 'pointer' }}
        >
          Test Connection Again
        </button>

        <button
          onClick={testAPIEndpoint}
          style={{ padding: '10px 20px', cursor: 'pointer' }}
        >
          Test API Endpoint
        </button>
      </div>

      <div style={{ marginTop: '30px', padding: '15px', background: '#e3f2fd', borderRadius: '5px' }}>
        <h3>Expected Results:</h3>
        <ul>
          <li>✅ Status should show Connected successfully!</li>
          <li>✅ Backend response should show API info</li>
          <li>✅ No CORS errors in browser console</li>
          <li>✅ API endpoint test should return data</li>
        </ul>
      </div>
    </div>
  );
}

function Empty() {
  return null;
}

export default process.env.NODE_ENV === 'development' ? DevTestConnection : Empty;