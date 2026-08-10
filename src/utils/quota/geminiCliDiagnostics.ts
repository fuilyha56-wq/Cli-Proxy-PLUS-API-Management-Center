/**
 * Gemini CLI quota diagnostic helpers.
 */

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parsePayload = (payload: unknown): Record<string, unknown> | null => {
  if (isRecord(payload)) return payload;
  if (typeof payload !== 'string') return null;

  const trimmed = payload.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export function getGeminiCliUnsupportedClientMessage(payload: unknown): string | null {
  const parsed = parsePayload(payload);
  const ineligibleTiers = parsed?.ineligibleTiers;
  if (!Array.isArray(ineligibleTiers)) return null;

  for (const tier of ineligibleTiers) {
    if (!isRecord(tier) || tier.reasonCode !== 'UNSUPPORTED_CLIENT') continue;
    const reasonMessage = tier.reasonMessage;
    if (typeof reasonMessage !== 'string') return null;
    const trimmed = reasonMessage.trim();
    return trimmed || null;
  }

  return null;
}

export type GeminiCliQuotaCompatibilityIssue =
  | { kind: 'unsupported-client'; message: string }
  | { kind: 'management-auth-failed' };

export function getGeminiCliQuotaCompatibilityIssue(
  quotaStatusCode: number,
  diagnosticStatusCode: number | null = null,
  diagnosticPayload: unknown = null
): GeminiCliQuotaCompatibilityIssue | null {
  if (quotaStatusCode === 401) {
    return { kind: 'management-auth-failed' };
  }

  if (
    quotaStatusCode !== 429 ||
    diagnosticStatusCode === null ||
    diagnosticStatusCode < 200 ||
    diagnosticStatusCode >= 300
  ) {
    return null;
  }

  const message = getGeminiCliUnsupportedClientMessage(diagnosticPayload);
  return message ? { kind: 'unsupported-client', message } : null;
}
