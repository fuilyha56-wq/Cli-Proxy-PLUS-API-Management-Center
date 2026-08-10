/**
 * Tests for Gemini CLI OAuth refresh helpers.
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildGeminiCliOAuthRefreshBody,
  getGeminiCliRefreshToken,
  getGeminiCliRefreshedAccessToken,
  refreshGeminiCliAccessToken,
} from '../../../src/utils/quota/geminiCliOAuth.ts';

const TEST_CREDENTIALS = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret',
};

test('extracts a refresh token from current and legacy credential shapes', () => {
  assert.equal(
    getGeminiCliRefreshToken(JSON.stringify({ refresh_token: 'top-level-refresh' })),
    'top-level-refresh'
  );
  assert.equal(
    getGeminiCliRefreshToken({ token: { refresh_token: 'nested-refresh' } }),
    'nested-refresh'
  );
  assert.equal(getGeminiCliRefreshToken({ refresh_token: '   ' }), null);
});

test('builds the installed-app OAuth refresh form', () => {
  const body = new URLSearchParams(
    buildGeminiCliOAuthRefreshBody('refresh-token', TEST_CREDENTIALS)
  );

  assert.equal(body.get('grant_type'), 'refresh_token');
  assert.equal(body.get('refresh_token'), 'refresh-token');
  assert.equal(body.get('client_id'), TEST_CREDENTIALS.clientId);
  assert.equal(body.get('client_secret'), TEST_CREDENTIALS.clientSecret);
});

test('extracts a non-empty access token from a refresh response', () => {
  assert.equal(
    getGeminiCliRefreshedAccessToken(JSON.stringify({ access_token: 'new-access-token' })),
    'new-access-token'
  );
  assert.equal(getGeminiCliRefreshedAccessToken({ access_token: '' }), null);
  assert.equal(getGeminiCliRefreshedAccessToken('not-json'), null);
});

test('refreshes an access token through the management API proxy', async () => {
  const accessToken = await refreshGeminiCliAccessToken(
    { refresh_token: 'refresh-token' },
    'auth-index',
    async (request) => {
      const form = new URLSearchParams(request.data);
      const requestIsValid =
        request.authIndex === 'auth-index' &&
        request.method === 'POST' &&
        request.url === 'https://oauth2.googleapis.com/token' &&
        request.header['Content-Type'] === 'application/x-www-form-urlencoded' &&
        form.get('grant_type') === 'refresh_token' &&
        form.get('refresh_token') === 'refresh-token' &&
        form.get('client_id') === TEST_CREDENTIALS.clientId &&
        form.get('client_secret') === TEST_CREDENTIALS.clientSecret;

      return requestIsValid
        ? {
            statusCode: 200,
            body: { access_token: 'refreshed-access-token' },
            bodyText: '{"access_token":"refreshed-access-token"}',
          }
        : { statusCode: 400, body: null, bodyText: '' };
    },
    TEST_CREDENTIALS
  );

  assert.equal(accessToken, 'refreshed-access-token');
});

test('does not issue an OAuth request without a refresh token', async () => {
  const accessToken = await refreshGeminiCliAccessToken({}, 'auth-index', async () => {
    throw new Error('request should not be called');
  });

  assert.equal(accessToken, null);
});

test('rejects unsuccessful OAuth refresh responses', async () => {
  const accessToken = await refreshGeminiCliAccessToken(
    { refresh_token: 'refresh-token' },
    'auth-index',
    async () => ({
      statusCode: 400,
      body: { error: 'invalid_grant' },
      bodyText: '{"error":"invalid_grant"}',
    })
  );

  assert.equal(accessToken, null);
});
