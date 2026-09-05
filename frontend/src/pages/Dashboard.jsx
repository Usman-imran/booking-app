import { useEffect, useState } from 'react';
import apiClient from '../api/client.js';

export default function Dashboard() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    apiClient
      .get('/health')
      .then(() => {
        if (!cancelled) setStatus('connected');
      })
      .catch((err) => {
        if (!cancelled) {
          setStatus('error');
          setError(err.message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="page-placeholder">
      <h2>Dashboard</h2>
      <p>This module will be implemented in a later development stage.</p>
      <p>
        Backend status:{' '}
        {status === 'loading' && 'Checking…'}
        {status === 'connected' && 'Connected'}
        {status === 'error' && `Unreachable (${error})`}
      </p>
    </div>
  );
}
