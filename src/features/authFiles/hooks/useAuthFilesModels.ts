import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import { useNotificationStore } from '@/stores';
import type { AuthFileItem } from '@/types';
import type { AuthFileModelItem } from '@/features/authFiles/constants';

type ModelsError = 'unsupported' | null;

const GEMINI_VERSION_PATTERN = /^gemini-(\d+(?:\.\d+)?)(?:-|$)/i;

export const formatGeminiModelName = (modelId: string): string => {
  const id = modelId.trim();
  if (!id.toLowerCase().startsWith('gemini-')) return id;

  const segments = id.slice('gemini-'.length).split('-').filter(Boolean);
  const version = segments.shift();
  if (!version) return id;

  return [`Gemini ${version}`, ...segments.map((segment) =>
    segment === 'oss' ? 'OSS' : segment.charAt(0).toUpperCase() + segment.slice(1)
  )].join(' ');
};

const formatGeminiDisplayName = (model: AuthFileModelItem): AuthFileModelItem => {
  const displayName = formatGeminiModelName(model.id);
  return displayName === model.id ? model : { ...model, display_name: displayName };
};

const parseGeminiVersion = (modelId: string): number[] | null => {
  const match = modelId.match(GEMINI_VERSION_PATTERN);
  return match ? match[1].split('.').map(Number) : null;
};

export const compareModelIds = (left: string, right: string): number => {
  const leftVersion = parseGeminiVersion(left);
  const rightVersion = parseGeminiVersion(right);

  if (leftVersion && rightVersion) {
    const length = Math.max(leftVersion.length, rightVersion.length);
    for (let index = 0; index < length; index += 1) {
      const difference = (leftVersion[index] ?? 0) - (rightVersion[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return left.localeCompare(right, undefined, { numeric: true });
  }
  if (leftVersion) return -1;
  if (rightVersion) return 1;
  return left.localeCompare(right, undefined, { numeric: true });
};

const normalizeModelsForDisplay = (models: AuthFileModelItem[]): AuthFileModelItem[] =>
  models
    .map(formatGeminiDisplayName)
    .sort((left, right) => compareModelIds(left.id, right.id));

export type UseAuthFilesModelsResult = {
  modelsModalOpen: boolean;
  modelsLoading: boolean;
  modelsList: AuthFileModelItem[];
  modelsFileName: string;
  modelsFileType: string;
  modelsError: ModelsError;
  showModels: (item: AuthFileItem) => Promise<void>;
  closeModelsModal: () => void;
};

export function useAuthFilesModels(): UseAuthFilesModelsResult {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [modelsModalOpen, setModelsModalOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsFileName, setModelsFileName] = useState('');
  const [modelsFileType, setModelsFileType] = useState('');
  const [modelsError, setModelsError] = useState<ModelsError>(null);
  const closeModelsModal = useCallback(() => {
    setModelsModalOpen(false);
  }, []);

  const showModels = useCallback(
    async (item: AuthFileItem) => {
      setModelsFileName(item.name);
      setModelsFileType(item.type || '');
      setModelsList([]);
      setModelsError(null);
      setModelsModalOpen(true);

      setModelsLoading(true);
      try {
        const models = normalizeModelsForDisplay(await authFilesApi.getModelsForAuthFile(item.name));
        setModelsList(models);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '';
        if (
          errorMessage.includes('404') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Not Found')
        ) {
          setModelsError('unsupported');
        } else {
          showNotification(`${t('notification.load_failed')}: ${errorMessage}`, 'error');
        }
      } finally {
        setModelsLoading(false);
      }
    },
    [showNotification, t]
  );

  return {
    modelsModalOpen,
    modelsLoading,
    modelsList,
    modelsFileName,
    modelsFileType,
    modelsError,
    showModels,
    closeModelsModal
  };
}

