/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, KeyStats } from '@/utils/usage';
import type { ApiError } from '@/types';

const USAGE_TIMEOUT_MS = 60 * 1000;
const USAGE_QUEUE_BATCH_SIZE = 500;
const USAGE_SNAPSHOT_STORAGE_KEY = 'cli-proxy-usage-queue-snapshot-v1';
const MAX_USAGE_DETAILS = 20_000;
const EMPTY_USAGE: Record<string, unknown> = {
  total_requests: 0,
  success_count: 0,
  failure_count: 0,
  total_tokens: 0,
  apis: {}
};

type UsageTokens = {
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cached_tokens: number;
  cache_tokens: number;
  total_tokens: number;
};

type UsageQueueRecord = {
  timestamp?: unknown;
  endpoint?: unknown;
  model?: unknown;
  source?: unknown;
  auth_index?: unknown;
  failed?: unknown;
  tokens?: unknown;
};

type UsageSnapshot = Record<string, {
  models: Record<string, {
    details: Array<{
      timestamp: string;
      source: string;
      auth_index: string;
      failed: boolean;
      tokens: UsageTokens;
    }>;
  }>;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toFiniteNumber = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

const loadUsageSnapshot = (): UsageSnapshot => {
  try {
    const raw = localStorage.getItem(USAGE_SNAPSHOT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as UsageSnapshot) : {};
  } catch {
    return {};
  }
};

const saveUsageSnapshot = (snapshot: UsageSnapshot): void => {
  try {
    localStorage.setItem(USAGE_SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Statistics still work for the active page when browser storage is unavailable.
  }
};

const addUsageQueueRecords = (snapshot: UsageSnapshot, records: unknown[]): void => {
  records.forEach((record): void => {
    if (!isRecord(record)) return;
    const item = record as UsageQueueRecord;
    if (typeof item.timestamp !== 'string' || !item.timestamp.trim()) return;
    const endpoint = typeof item.endpoint === 'string' && item.endpoint.trim()
      ? item.endpoint.trim()
      : 'unknown';
    const model = typeof item.model === 'string' && item.model.trim()
      ? item.model.trim()
      : 'unknown';
    const source = typeof item.source === 'string' ? item.source : '';
    const authIndex = item.auth_index === null || item.auth_index === undefined
      ? ''
      : String(item.auth_index);
    const rawTokens = isRecord(item.tokens) ? item.tokens : {};
    const tokens: UsageTokens = {
      input_tokens: toFiniteNumber(rawTokens.input_tokens),
      output_tokens: toFiniteNumber(rawTokens.output_tokens),
      reasoning_tokens: toFiniteNumber(rawTokens.reasoning_tokens),
      cached_tokens: toFiniteNumber(rawTokens.cached_tokens),
      cache_tokens: toFiniteNumber(rawTokens.cache_tokens),
      total_tokens: toFiniteNumber(rawTokens.total_tokens),
    };
    const api = snapshot[endpoint] ??= { models: {} };
    const modelStats = api.models[model] ??= { details: [] };
    modelStats.details.push({
      timestamp: item.timestamp,
      source,
      auth_index: authIndex,
      failed: item.failed === true,
      tokens,
    });
    if (modelStats.details.length > MAX_USAGE_DETAILS) {
      modelStats.details.splice(0, modelStats.details.length - MAX_USAGE_DETAILS);
    }
  });
};

const buildUsagePayload = (snapshot: UsageSnapshot): Record<string, unknown> => {
  let totalRequests = 0;
  let successCount = 0;
  let failureCount = 0;
  let totalTokens = 0;
  const apis: Record<string, unknown> = {};

  Object.entries(snapshot).forEach(([endpoint, api]) => {
    let apiRequests = 0;
    let apiSuccess = 0;
    let apiFailure = 0;
    let apiTokens = 0;
    const models: Record<string, unknown> = {};
    Object.entries(api.models).forEach(([model, stats]) => {
      let modelSuccess = 0;
      let modelFailure = 0;
      let modelTokens = 0;
      stats.details.forEach((detail) => {
        if (detail.failed) modelFailure += 1;
        else modelSuccess += 1;
        modelTokens += detail.tokens.total_tokens;
      });
      const modelRequests = stats.details.length;
      models[model] = {
        total_requests: modelRequests,
        success_count: modelSuccess,
        failure_count: modelFailure,
        total_tokens: modelTokens,
        details: stats.details,
      };
      apiRequests += modelRequests;
      apiSuccess += modelSuccess;
      apiFailure += modelFailure;
      apiTokens += modelTokens;
    });
    apis[endpoint] = {
      total_requests: apiRequests,
      success_count: apiSuccess,
      failure_count: apiFailure,
      total_tokens: apiTokens,
      models,
    };
    totalRequests += apiRequests;
    successCount += apiSuccess;
    failureCount += apiFailure;
    totalTokens += apiTokens;
  });

  return { total_requests: totalRequests, success_count: successCount, failure_count: failureCount, total_tokens: totalTokens, apis };
};

const getUsageFromQueue = async (): Promise<Record<string, unknown>> => {
  const records = await apiClient.get<unknown[]>('/usage-queue', {
    params: { count: USAGE_QUEUE_BATCH_SIZE },
    timeout: USAGE_TIMEOUT_MS,
  });
  const snapshot = loadUsageSnapshot();
  addUsageQueueRecords(snapshot, Array.isArray(records) ? records : []);
  saveUsageSnapshot(snapshot);
  return buildUsagePayload(snapshot);
};

const isUsageRouteMissing = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const response = (error as { response?: { status?: unknown } }).response;
  const { status, statusCode } = error as ApiError & { statusCode?: unknown };
  return status === 404 || statusCode === 404 || response?.status === 404;
};

const getUsage = async (): Promise<Record<string, unknown>> => {
  try {
    return await apiClient.get<Record<string, unknown>>('/usage', { timeout: USAGE_TIMEOUT_MS });
  } catch (error: unknown) {
    // CLI Proxy API v7.2.124 exposes usage through a consumable management queue.
    if (isUsageRouteMissing(error)) {
      try {
        return await getUsageFromQueue();
      } catch (queueError: unknown) {
        if (isUsageRouteMissing(queueError)) return { ...EMPTY_USAGE, apis: {} };
        throw queueError;
      }
    }
    throw error;
  }
};

export interface UsageExportPayload {
  version?: number;
  exported_at?: string;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface UsageImportResponse {
  added?: number;
  skipped?: number;
  total_requests?: number;
  failed_requests?: number;
  [key: string]: unknown;
}

export const usageApi = {
  /**
   * 获取使用统计原始数据
   */
  getUsage,

  /**
   * 导出使用统计快照
   */
  exportUsage: () => apiClient.get<UsageExportPayload>('/usage/export', { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 导入使用统计快照
   */
  importUsage: (payload: unknown) =>
    apiClient.post<UsageImportResponse>('/usage/import', payload, { timeout: USAGE_TIMEOUT_MS }),

  /**
   * 计算密钥成功/失败统计，必要时会先获取 usage 数据
   */
  async getKeyStats(usageData?: unknown): Promise<KeyStats> {
    let payload = usageData;
    if (!payload) {
      const response = await getUsage();
      payload = response?.usage ?? response;
    }
    return computeKeyStats(payload);
  }
};
