/**
 * 使用统计相关 API
 */

import { apiClient } from './client';
import { computeKeyStats, KeyStats } from '@/utils/usage';
import type { ApiError } from '@/types';

const USAGE_TIMEOUT_MS = 60 * 1000;
const EMPTY_USAGE: Record<string, unknown> = {
  total_requests: 0,
  success_count: 0,
  failure_count: 0,
  total_tokens: 0,
  apis: {}
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
    // CLI Proxy API v7.2.124 does not expose detailed /usage data.
    if (isUsageRouteMissing(error)) {
      return { ...EMPTY_USAGE, apis: {} };
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
