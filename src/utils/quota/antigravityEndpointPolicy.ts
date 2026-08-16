/**
 * Antigravity quota endpoint selection and browser persistence helpers.
 */

import { ANTIGRAVITY_QUOTA_URLS } from './constants';

export const ANTIGRAVITY_ENDPOINT_POLICY_STORAGE_KEY = 'antigravity-quota-endpoint-policy';

export type AntigravityEndpointPolicy = 'auto' | 'daily' | 'sandbox' | 'production';

const ENDPOINT_POLICY_URLS: Record<Exclude<AntigravityEndpointPolicy, 'auto'>, string> = {
  daily: ANTIGRAVITY_QUOTA_URLS[0],
  sandbox: ANTIGRAVITY_QUOTA_URLS[1],
  production: ANTIGRAVITY_QUOTA_URLS[2],
};

export const isAntigravityEndpointPolicy = (
  value: unknown
): value is AntigravityEndpointPolicy =>
  value === 'auto' || value === 'daily' || value === 'sandbox' || value === 'production';

export const readAntigravityEndpointPolicy = (): AntigravityEndpointPolicy => {
  if (typeof localStorage === 'undefined') return 'auto';

  const stored = localStorage.getItem(ANTIGRAVITY_ENDPOINT_POLICY_STORAGE_KEY);
  return isAntigravityEndpointPolicy(stored) ? stored : 'auto';
};

export const writeAntigravityEndpointPolicy = (policy: AntigravityEndpointPolicy): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(ANTIGRAVITY_ENDPOINT_POLICY_STORAGE_KEY, policy);
};

export const resolveAntigravityQuotaUrls = (
  policy: AntigravityEndpointPolicy = readAntigravityEndpointPolicy()
): readonly string[] => (policy === 'auto' ? ANTIGRAVITY_QUOTA_URLS : [ENDPOINT_POLICY_URLS[policy]]);