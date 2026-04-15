import { useMemo } from 'react';
import { createApiClient } from '../api-client';

export function useApi() {
  const apiKey = typeof window !== 'undefined'
    ? localStorage.getItem('netobserver-api-key') || ''
    : '';
  return useMemo(() => createApiClient('/api/v1', apiKey), [apiKey]);
}
