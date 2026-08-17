import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Card } from '@/components/ui/Card';
import { authFilesApi } from '@/services/api';
import { useDisableModel } from '@/hooks';
import { DisableModelModal } from './DisableModelModal';
import { UnsupportedDisableModal } from './UnsupportedDisableModal';
import {
  maskSecret,
  formatProviderDisplay,
  formatTimestamp,
  getRateClassName,
  getProviderDisplayParts,
} from '@/utils/monitor';
import type { UsageData } from '@/pages/MonitorPage';
import styles from '@/pages/MonitorPage.module.scss';

interface RequestLogsProps {
  data: UsageData | null;
  loading: boolean;
  providerMap: Record<string, string>;
  providerTypeMap: Record<string, string>;
  timeRange: number;
  onRefresh: () => void;
}

interface LogEntry {
  id: string;
  timestamp: string;
  timestampMs: number;
  apiKey: string;
  model: string;
  source: string;
  displayName: string;
  providerName: string | null;
  providerType: string;
  maskedKey: string;
  failed: boolean;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  authIndex: string;
}

interface ChannelModelRequest {
  failed: boolean;
  timestamp: number;
}

// 预计算的统计数据缓存
interface PrecomputedStats {
  recentRequests: ChannelModelRequest[];
  successRate: string;
  totalCount: number;
}

// 虚拟滚动行高
const ROW_HEIGHT = 40;

export function RequestLogs({
  data,
  loading,
  providerMap,
  providerTypeMap,
  timeRange,
  onRefresh,
}: RequestLogsProps) {
  const { t } = useTranslation();
  const [filterApi, setFilterApi] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState<'' | 'success' | 'failed'>('');
  const [filterProviderType, setFilterProviderType] = useState('');

  // 虚拟滚动容器 ref
  const tableContainerRef = useRef<HTMLDivElement>(null);
  // 固定表头容器 ref
  const headerRef = useRef<HTMLDivElement>(null);

  // 同步表头和内容的水平滚动
  const handleScroll = useCallback(() => {
    if (tableContainerRef.current && headerRef.current) {
      headerRef.current.scrollLeft = tableContainerRef.current.scrollLeft;
    }
  }, []);

  // 认证文件索引到名称的映射
  const [authIndexMap, setAuthIndexMap] = useState<Record<string, string>>({});

  // 使用禁用模型 Hook
  const {
    disableState,
    unsupportedState,
    disabling,
    isModelDisabled,
    handleDisableClick,
    handleConfirmDisable,
    handleCancelDisable,
    handleCloseUnsupported,
  } = useDisableModel({ providerMap, providerTypeMap });

  // 加载认证文件映射（authIndex -> 文件名）
  const loadAuthIndexMap = useCallback(async () => {
    try {
      const response = await authFilesApi.list();
      const files = response?.files || [];
      const map: Record<string, string> = {};
      files.forEach((file) => {
        // 兼容 auth_index 和 authIndex 两种字段名（API 返回的是 auth_index）
        const rawAuthIndex = (file as Record<string, unknown>)['auth_index'] ?? file.authIndex;
        if (rawAuthIndex !== undefined && rawAuthIndex !== null) {
          const authIndexKey = String(rawAuthIndex).trim();
          if (authIndexKey) {
            map[authIndexKey] = file.name;
          }
        }
      });
      setAuthIndexMap(map);
    } catch (err) {
      console.warn('Failed to load auth files for index mapping:', err);
    }
  }, []);

  // 初始加载认证文件映射
  useEffect(() => {
    loadAuthIndexMap();
  }, [loadAuthIndexMap]);

  // 将数据转换为日志条目
  const logEntries = useMemo(() => {
    if (!data?.apis) return [];

    const entries: LogEntry[] = [];
    let idCounter = 0;

    Object.entries(data.apis).forEach(([apiKey, apiData]) => {
      Object.entries(apiData.models).forEach(([modelName, modelData]) => {
        modelData.details.forEach((detail) => {
          const source = detail.source || 'unknown';
          const { provider, masked } = getProviderDisplayParts(source, providerMap);
          const displayName = provider ? `${provider} (${masked})` : masked;
          const timestampMs = detail.timestamp ? new Date(detail.timestamp).getTime() : 0;
          // 获取提供商类型
          const providerType = providerTypeMap[source] || '--';
          entries.push({
            id: `${idCounter++}`,
            timestamp: detail.timestamp,
            timestampMs,
            apiKey,
            model: modelName,
            source,
            displayName,
            providerName: provider,
            providerType,
            maskedKey: masked,
            failed: detail.failed,
            inputTokens: detail.tokens.input_tokens || 0,
            outputTokens: detail.tokens.output_tokens || 0,
            totalTokens: detail.tokens.total_tokens || 0,
            authIndex: detail.auth_index || '',
          });
        });
      });
    });

    // 按时间倒序排序
    return entries.sort((a, b) => b.timestampMs - a.timestampMs);
  }, [data, providerMap, providerTypeMap]);

  // 预计算所有条目的统计数据（一次性计算，避免渲染时重复计算）
  const precomputedStats = useMemo(() => {
    const statsMap = new Map<string, PrecomputedStats>();

    // 首先按渠道+模型分组，并按时间排序
    const channelModelGroups: Record<string, { entry: LogEntry; index: number }[]> = {};

    logEntries.forEach((entry, index) => {
      const key = `${entry.source}|||${entry.model}`;
      if (!channelModelGroups[key]) {
        channelModelGroups[key] = [];
      }
      channelModelGroups[key].push({ entry, index });
    });

    // 对每个分组按时间正序排序（用于计算累计统计）
    Object.values(channelModelGroups).forEach((group) => {
      group.sort((a, b) => a.entry.timestampMs - b.entry.timestampMs);
    });

    // 计算每个条目的统计数据
    Object.entries(channelModelGroups).forEach(([, group]) => {
      let successCount = 0;
      let totalCount = 0;
      const recentRequests: ChannelModelRequest[] = [];

      group.forEach(({ entry }) => {
        totalCount++;
        if (!entry.failed) {
          successCount++;
        }

        // 维护最近 10 次请求
        recentRequests.push({ failed: entry.failed, timestamp: entry.timestampMs });
        if (recentRequests.length > 10) {
          recentRequests.shift();
        }

        // 计算成功率
        const successRate = totalCount > 0 ? ((successCount / totalCount) * 100).toFixed(1) : '0.0';

        // 存储该条目的统计数据
        statsMap.set(entry.id, {
          recentRequests: [...recentRequests],
          successRate,
          totalCount,
        });
      });
    });

    return statsMap;
  }, [logEntries]);

  // 获取筛选选项
  const { apis, models, sources, providerTypes } = useMemo(() => {
    const apiSet = new Set<string>();
    const modelSet = new Set<string>();
    const sourceSet = new Set<string>();
    const providerTypeSet = new Set<string>();

    logEntries.forEach((entry) => {
      apiSet.add(entry.apiKey);
      modelSet.add(entry.model);
      sourceSet.add(entry.source);
      if (entry.providerType && entry.providerType !== '--') {
        providerTypeSet.add(entry.providerType);
      }
    });

    return {
      apis: Array.from(apiSet).sort(),
      models: Array.from(modelSet).sort(),
      sources: Array.from(sourceSet).sort(),
      providerTypes: Array.from(providerTypeSet).sort(),
    };
  }, [logEntries]);

  // 过滤后的数据
  const filteredEntries = useMemo(() => {
    return logEntries.filter((entry) => {
      if (filterApi && entry.apiKey !== filterApi) return false;
      if (filterModel && entry.model !== filterModel) return false;
      if (filterSource && entry.source !== filterSource) return false;
      if (filterStatus === 'success' && entry.failed) return false;
      if (filterStatus === 'failed' && !entry.failed) return false;
      if (filterProviderType && entry.providerType !== filterProviderType) return false;
      return true;
    });
  }, [logEntries, filterApi, filterModel, filterSource, filterStatus, filterProviderType]);

  // 虚拟滚动配置
  const rowVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10, // 预渲染上下各 10 行
  });

  // 格式化数字
  const formatNumber = (num: number) => {
    return num.toLocaleString('zh-CN');
  };

  // 获取预计算的统计数据
  const getStats = (entry: LogEntry): PrecomputedStats => {
    return precomputedStats.get(entry.id) || {
      recentRequests: [],
      successRate: '0.0',
      totalCount: 0,
    };
  };

  // 渲染单行
  const renderRow = (entry: LogEntry) => {
    const stats = getStats(entry);
    const rateValue = parseFloat(stats.successRate);
    const disabled = isModelDisabled(entry.source, entry.model);
    // 将 authIndex 映射为文件名
    const authDisplayName = entry.authIndex ? (authIndexMap[entry.authIndex] || entry.authIndex) : '-';

    return (
      <>
        <td title={authDisplayName}>
          {authDisplayName}
        </td>
        <td title={entry.apiKey}>
          {maskSecret(entry.apiKey)}
        </td>
        <td>{entry.providerType}</td>
        <td title={entry.model}>
          {entry.model}
        </td>
        <td title={entry.source}>
          {entry.providerName ? (
            <>
              <span className={styles.channelName}>{entry.providerName}</span>
              <span className={styles.channelSecret}> ({entry.maskedKey})</span>
            </>
          ) : (
            entry.maskedKey
          )}
        </td>
        <td>
          <span className={`${styles.statusPill} ${entry.failed ? styles.failed : styles.success}`}>
            {entry.failed ? t('monitor.logs.failed') : t('monitor.logs.success')}
          </span>
        </td>
        <td>
          <div className={styles.statusBars}>
            {stats.recentRequests.map((req, idx) => (
              <div
                key={idx}
                className={`${styles.statusBar} ${req.failed ? styles.failure : styles.success}`}
              />
            ))}
          </div>
        </td>
        <td className={getRateClassName(rateValue, styles)}>
          {stats.successRate}%
        </td>
        <td>{formatNumber(stats.totalCount)}</td>
        <td>{formatNumber(entry.inputTokens)}</td>
        <td>{formatNumber(entry.outputTokens)}</td>
        <td>{formatNumber(entry.totalTokens)}</td>
        <td>{formatTimestamp(entry.timestamp)}</td>
        <td>
          {entry.source && entry.source !== '-' && entry.source !== 'unknown' ? (
            disabled ? (
              <span className={styles.disabledLabel}>
                {t('monitor.logs.disabled')}
              </span>
            ) : (
              <button
                className={styles.disableBtn}
                title={t('monitor.logs.disable_model')}
                onClick={() => handleDisableClick(entry.source, entry.model)}
              >
                {t('monitor.logs.disable')}
              </button>
            )
          ) : (
            '-'
          )}
        </td>
      </>
    );
  };

  return (
    <>
      <Card
        title={t('monitor.logs.title')}
        subtitle={
          <span>
            {timeRange === 1 ? t('monitor.today') : t('monitor.last_n_days', { n: timeRange })} · {t('monitor.logs.total_count', { count: logEntries.length })}
            <span style={{ color: 'var(--text-tertiary)' }}> · {t('monitor.logs.scroll_hint')}</span>
          </span>
        }
      >
        {/* 筛选器 */}
        <div className={styles.logFilters}>
          <select
            className={styles.logSelect}
            value={filterApi}
            onChange={(e) => setFilterApi(e.target.value)}
          >
            <option value="">{t('monitor.logs.all_apis')}</option>
            {apis.map((api) => (
              <option key={api} value={api}>
                {maskSecret(api)}
              </option>
            ))}
          </select>
          <select
            className={styles.logSelect}
            value={filterProviderType}
            onChange={(e) => setFilterProviderType(e.target.value)}
          >
            <option value="">{t('monitor.logs.all_provider_types')}</option>
            {providerTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            className={styles.logSelect}
            value={filterModel}
            onChange={(e) => setFilterModel(e.target.value)}
          >
            <option value="">{t('monitor.logs.all_models')}</option>
            {models.map((model) => (
              <option key={model} value={model}>{model}</option>
            ))}
          </select>
          <select
            className={styles.logSelect}
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value)}
          >
            <option value="">{t('monitor.logs.all_sources')}</option>
            {sources.map((source) => (
              <option key={source} value={source}>
                {formatProviderDisplay(source, providerMap)}
              </option>
            ))}
          </select>
          <select
            className={styles.logSelect}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as '' | 'success' | 'failed')}
          >
            <option value="">{t('monitor.logs.all_status')}</option>
            <option value="success">{t('monitor.logs.success')}</option>
            <option value="failed">{t('monitor.logs.failed')}</option>
          </select>

          <button type="button" className={styles.logRefreshButton} onClick={onRefresh} disabled={loading}>
            {loading ? t('common.loading') : t('common.refresh')}
          </button>
        </div>

        {/* 虚拟滚动表格 */}
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.emptyState}>{t('common.loading')}</div>
          ) : filteredEntries.length === 0 ? (
            <div className={styles.emptyState}>{t('monitor.no_data')}</div>
          ) : (
            <>
              {/* 固定表头 */}
              <div ref={headerRef} className={styles.stickyHeader}>
                <table className={`${styles.table} ${styles.virtualTable}`}>
                  <thead>
                    <tr>
                      <th>{t('monitor.logs.header_auth')}</th>
                      <th>{t('monitor.logs.header_api')}</th>
                      <th>{t('monitor.logs.header_request_type')}</th>
                      <th>{t('monitor.logs.header_model')}</th>
                      <th>{t('monitor.logs.header_source')}</th>
                      <th>{t('monitor.logs.header_status')}</th>
                      <th>{t('monitor.logs.header_recent')}</th>
                      <th>{t('monitor.logs.header_rate')}</th>
                      <th>{t('monitor.logs.header_count')}</th>
                      <th>{t('monitor.logs.header_input')}</th>
                      <th>{t('monitor.logs.header_output')}</th>
                      <th>{t('monitor.logs.header_total')}</th>
                      <th>{t('monitor.logs.header_time')}</th>
                      <th>{t('monitor.logs.header_actions')}</th>
                    </tr>
                  </thead>
                </table>
              </div>

              {/* 虚拟滚动容器 */}
              <div
                ref={tableContainerRef}
                className={styles.virtualScrollContainer}
                style={{
                  height: 'calc(100vh - 420px)',
                  minHeight: '360px',
                  overflow: 'auto',
                }}
                onScroll={handleScroll}
              >
                <div
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    width: '100%',
                    position: 'relative',
                  }}
                >
                  <table className={`${styles.table} ${styles.virtualTable}`}>
                    <tbody>
                      {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                        const entry = filteredEntries[virtualRow.index];
                        return (
                          <tr
                            key={entry.id}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: `${virtualRow.size}px`,
                              transform: `translateY(${virtualRow.start}px)`,
                              display: 'table',
                              tableLayout: 'fixed',
                            }}
                          >
                            {renderRow(entry)}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 统计信息 */}
        {filteredEntries.length > 0 && (
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
            {t('monitor.logs.total_count', { count: filteredEntries.length })}
          </div>
        )}
      </Card>

      {/* 禁用确认弹窗 */}
      <DisableModelModal
        disableState={disableState}
        disabling={disabling}
        onConfirm={handleConfirmDisable}
        onCancel={handleCancelDisable}
      />

      {/* 不支持自动禁用提示弹窗 */}
      <UnsupportedDisableModal
        state={unsupportedState}
        onClose={handleCloseUnsupported}
      />
    </>
  );
}
