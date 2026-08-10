/**
 * Gemini CLI OAuth refresh helpers.
 */

interface GeminiCliOAuthCredentials {
  clientId: string;
  clientSecret: string;
}

const GEMINI_CLI_OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/**
 * 从构建环境（Vite `import.meta.env`）读取 Gemini CLI OAuth 凭据。
 *
 * 凭据配置在本地 `.env`（已被 .gitignore 忽略）或部署环境变量中：
 * - `VITE_GEMINI_CLI_OAUTH_CLIENT_ID`
 * - `VITE_GEMINI_CLI_OAUTH_CLIENT_SECRET`
 *
 * 代码中不硬编码任何密钥，避免敏感信息进入版本历史。
 */
const resolveCredentials = (): GeminiCliOAuthCredentials => {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return {
    clientId: env.VITE_GEMINI_CLI_OAUTH_CLIENT_ID ?? '',
    clientSecret: env.VITE_GEMINI_CLI_OAUTH_CLIENT_SECRET ?? '',
  };
};

interface GeminiCliOAuthRequest {
  authIndex: string;
  method: 'POST';
  url: string;
  header: Record<string, string>;
  data: string;
}

interface GeminiCliOAuthResponse {
  statusCode: number;
  body: unknown;
  bodyText: string;
}

type GeminiCliOAuthRequester = (request: GeminiCliOAuthRequest) => Promise<GeminiCliOAuthResponse>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parsePayload = (payload: unknown): Record<string, unknown> | null => {
  if (isRecord(payload)) return payload;
  if (typeof payload !== 'string') return null;

  try {
    const parsed = JSON.parse(payload) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const nonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
};

export function getGeminiCliRefreshToken(payload: unknown): string | null {
  const parsed = parsePayload(payload);
  if (!parsed) return null;

  const topLevel = nonEmptyString(parsed.refresh_token);
  if (topLevel) return topLevel;

  return isRecord(parsed.token) ? nonEmptyString(parsed.token.refresh_token) : null;
}

export function buildGeminiCliOAuthRefreshBody(
  refreshToken: string,
  credentials: GeminiCliOAuthCredentials = resolveCredentials()
): string {
  return new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  }).toString();
}

export function getGeminiCliRefreshedAccessToken(payload: unknown): string | null {
  const parsed = parsePayload(payload);
  return parsed ? nonEmptyString(parsed.access_token) : null;
}

export async function refreshGeminiCliAccessToken(
  credentialPayload: unknown,
  authIndex: string,
  request: GeminiCliOAuthRequester,
  credentials: GeminiCliOAuthCredentials = resolveCredentials()
): Promise<string | null> {
  const refreshToken = getGeminiCliRefreshToken(credentialPayload);
  if (!refreshToken) return null;

  const result = await request({
    authIndex,
    method: 'POST',
    url: GEMINI_CLI_OAUTH_TOKEN_URL,
    header: { 'Content-Type': 'application/x-www-form-urlencoded' },
    data: buildGeminiCliOAuthRefreshBody(refreshToken, credentials),
  });
  if (result.statusCode < 200 || result.statusCode >= 300) return null;

  return getGeminiCliRefreshedAccessToken(result.body ?? result.bodyText);
}
