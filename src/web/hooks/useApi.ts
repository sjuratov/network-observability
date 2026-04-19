import { useMemo } from 'react';
import { createApiClient } from '../api-client';

export function useApi() {
  return useMemo(
    () => createApiClient('/api/v1', () => (typeof window !== 'undefined' ? localStorage.getItem('netobserver-api-key') || '' : '')),
    [],
  );
}
