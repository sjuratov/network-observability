import { createApiClient } from '../api-client';

const getApiKey = () => localStorage.getItem('netobserver-api-key') || '';

export function useApi() {
  return createApiClient('/api/v1', getApiKey());
}
