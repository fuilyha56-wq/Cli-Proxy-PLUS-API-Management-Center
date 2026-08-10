/**
 * Tests for Gemini CLI quota diagnostics.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getGeminiCliQuotaCompatibilityIssue,
  getGeminiCliUnsupportedClientMessage,
} from '../../../src/utils/quota/geminiCliDiagnostics.ts';

test('extracts the unsupported-client migration message from loadCodeAssist', () => {
  const message = getGeminiCliUnsupportedClientMessage({
    allowedTiers: [{ id: 'standard-tier' }],
    ineligibleTiers: [
      {
        reasonCode: 'UNSUPPORTED_CLIENT',
        reasonMessage:
          'This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google',
      },
    ],
  });

  assert.equal(
    message,
    'This client is no longer supported for Gemini Code Assist for individuals. To continue using Gemini, please migrate to the Antigravity suite of products: https://antigravity.google'
  );
});

test('ignores unrelated ineligible tiers', () => {
  const message = getGeminiCliUnsupportedClientMessage({
    ineligibleTiers: [
      {
        reasonCode: 'VALIDATION_REQUIRED',
        reasonMessage: 'Verify this account.',
      },
    ],
  });

  assert.equal(message, null);
});

test('classifies an unsupported client after a quota 429', () => {
  const issue = getGeminiCliQuotaCompatibilityIssue(429, 200, {
    ineligibleTiers: [
      {
        reasonCode: 'UNSUPPORTED_CLIENT',
        reasonMessage: 'Migrate to Antigravity.',
      },
    ],
  });

  assert.deepEqual(issue, {
    kind: 'unsupported-client',
    message: 'Migrate to Antigravity.',
  });
});

test('classifies management authentication failures without masking other errors', () => {
  assert.deepEqual(getGeminiCliQuotaCompatibilityIssue(401), {
    kind: 'management-auth-failed',
  });
  assert.equal(getGeminiCliQuotaCompatibilityIssue(403), null);
  assert.equal(getGeminiCliQuotaCompatibilityIssue(429, 401), null);
});
