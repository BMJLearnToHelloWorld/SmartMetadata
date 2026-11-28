/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { DataContract } from '@/api/dataContracts';
import type { IngestionPipeline, PipelineStatus } from '@/types/ingestion';
import type { TestIncident, TestSummary } from '@/types/quality';
import { getShortRelativeTime } from '@/utils/relativeTime';

/**
 * Official AssetHealth row derivation
 * (openmetadata-ui/.../DataAssets/AssetHealthWidget/AssetHealthWidget.utils.ts
 * + AssetHealthWidget.constant.ts), ported 1:1. The widget itself only
 * fetches and renders; every rule about what a row says lives here so
 * the mapping is unit-testable without a mount.
 *
 * Named deviation: pin renders its FeaturedIcon/BadgeWithIcon pair per
 * row; the product has no such pair, so the tone rides an antd Badge
 * and a text CTA instead. The rows, tones, badges and subtitles are
 * unchanged.
 */
export type AssetHealthTone = 'success' | 'warning' | 'error' | 'info' | 'neutral';
export type AssetHealthCategory = 'pipeline' | 'data-quality' | 'data-observability' | 'contract';
export type AssetHealthCtaType = 'link-pipeline' | 'add-tests' | 'enable-observability' | 'create-contract';

export interface AssetHealthRow {
  category: AssetHealthCategory;
  titleKey: string;
  tone: AssetHealthTone;
  subtitle: string;
  badgeLabel?: string;
  cta?: { labelKey: string; type: AssetHealthCtaType };
}

export interface AssetHealthHeader {
  tone: AssetHealthTone;
  labelKey: string;
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

const HIGH_SEVERITIES: ReadonlySet<string> = new Set(['Severity1', 'Severity2']);
/** Official TestCaseResolutionStatusTypes.Resolved. */
const RESOLVED_STATUS_TYPE = 'Resolved';

const CATEGORY_TITLE_KEY: Record<AssetHealthCategory, string> = {
  pipeline: 'label.pipeline',
  'data-quality': 'label.data-quality',
  'data-observability': 'label.data-observability',
  contract: 'label.contract',
};

function buildRow(
  category: AssetHealthCategory,
  tone: AssetHealthTone,
  subtitle: string,
  badgeLabel?: string,
  cta?: AssetHealthRow['cta'],
): AssetHealthRow {
  return { category, titleKey: CATEGORY_TITLE_KEY[category], tone, subtitle, badgeLabel, cta };
}

function buildSetupRow(
  category: AssetHealthCategory,
  ctaType: AssetHealthCtaType,
  ctaKey: string,
  subtitleKey: string,
  t: Translate,
): AssetHealthRow {
  return buildRow(category, 'neutral', t(subtitleKey), undefined, {
    labelKey: ctaKey,
    type: ctaType,
  });
}

export function getLatestPipelineStatus(pipeline?: IngestionPipeline): PipelineStatus | undefined {
  let latest: PipelineStatus | undefined;
  pipeline?.pipelineStatuses?.forEach((status) => {
    if (
      status.startDate !== undefined &&
      status.startDate !== null &&
      (latest?.startDate === undefined || latest.startDate === null || status.startDate > latest.startDate)
    ) {
      latest = status;
    }
  });
  return latest;
}

interface PipelinePresentation {
  tone: AssetHealthTone;
  badgeKey: string;
  subtitleKey?: string;
}

const PIPELINE_STATE_PRESENTATION: Record<string, PipelinePresentation> = {
  success: { tone: 'success', badgeKey: 'label.healthy' },
  running: { tone: 'info', badgeKey: 'label.running', subtitleKey: 'message.started-time' },
  queued: { tone: 'info', badgeKey: 'label.queued' },
  partialSuccess: { tone: 'warning', badgeKey: 'label.partial-success' },
  stopped: { tone: 'warning', badgeKey: 'label.paused' },
};
const DEFAULT_PIPELINE_PRESENTATION: PipelinePresentation = {
  tone: 'error',
  badgeKey: 'label.failed',
};

export function getPipelineHealthRow(pipeline: IngestionPipeline | undefined, t: Translate): AssetHealthRow {
  const latest = getLatestPipelineStatus(pipeline);
  const state = latest?.pipelineState;
  if (state === undefined || state === null) {
    return buildSetupRow('pipeline', 'link-pipeline', 'label.link-pipeline', 'message.no-pipeline-linked', t);
  }
  const presentation = PIPELINE_STATE_PRESENTATION[state] ?? DEFAULT_PIPELINE_PRESENTATION;
  const subtitle = t(presentation.subtitleKey ?? 'message.last-run-time', {
    time: getShortRelativeTime(latest?.endDate ?? latest?.startDate),
  });
  return buildRow('pipeline', presentation.tone, subtitle, t(presentation.badgeKey));
}

function getDataQualityTone(
  success: number,
  failed: number,
  aborted: number,
  queued: number,
  total: number,
  t: Translate,
): { tone: AssetHealthTone; badgeLabel: string } {
  if (failed > 0) {
    return { tone: 'error', badgeLabel: t('message.count-failed-test', { count: failed }) };
  }
  if (queued > 0) {
    return { tone: 'info', badgeLabel: t('label.queued') };
  }
  if (aborted > 0) {
    return { tone: 'warning', badgeLabel: t('label.aborted') };
  }
  return {
    tone: success < total ? 'warning' : 'success',
    badgeLabel: t('label.passing'),
  };
}

export function getDataQualityHealthRow(
  hasTests: boolean,
  summary: TestSummary | undefined,
  t: Translate,
): AssetHealthRow {
  const total = summary?.total ?? 0;
  if (!hasTests || total === 0) {
    return buildSetupRow('data-quality', 'add-tests', 'label.add-test-plural', 'message.no-test-defined', t);
  }
  const success = summary?.success ?? 0;
  const failed = summary?.failed ?? 0;
  const aborted = summary?.aborted ?? 0;
  const queued = summary?.queued ?? 0;
  const { tone, badgeLabel } = getDataQualityTone(success, failed, aborted, queued, total, t);
  return buildRow(
    'data-quality',
    tone,
    t('message.count-by-total-test-plural', { count: success, total }),
    badgeLabel,
  );
}

export function getDataObservabilityHealthRow(
  hasTests: boolean,
  incidents: TestIncident[],
  t: Translate,
): AssetHealthRow {
  if (!hasTests) {
    return buildSetupRow(
      'data-observability',
      'enable-observability',
      'label.enable',
      'message.not-configured',
      t,
    );
  }
  const unresolved = incidents.filter(
    (incident) => incident.testCaseResolutionStatusType !== RESOLVED_STATUS_TYPE,
  );
  const latestTimestamp = incidents.reduce<number | undefined>(
    (latest, incident) =>
      incident.timestamp !== undefined &&
      incident.timestamp !== null &&
      incident.timestamp > (latest ?? 0)
        ? incident.timestamp
        : latest,
    undefined,
  );
  const hasHighSeverity = unresolved.some(
    (incident) => incident.severity !== undefined && HIGH_SEVERITIES.has(incident.severity),
  );
  const subtitle =
    latestTimestamp === undefined
      ? ''
      : t('message.last-check-time', { time: getShortRelativeTime(latestTimestamp) });
  if (unresolved.length === 0) {
    return buildRow('data-observability', 'success', subtitle, t('label.no-anomaly-plural'));
  }
  return buildRow(
    'data-observability',
    hasHighSeverity ? 'error' : 'warning',
    subtitle,
    t('message.count-anomaly', { count: unresolved.length }),
  );
}

interface ContractPresentation {
  tone: AssetHealthTone;
  badgeKey: string;
}

const CONTRACT_STATUS_PRESENTATION: Record<string, ContractPresentation> = {
  Success: { tone: 'success', badgeKey: 'label.passing' },
  Running: { tone: 'info', badgeKey: 'label.running' },
  Queued: { tone: 'info', badgeKey: 'label.queued' },
  PartialSuccess: { tone: 'warning', badgeKey: 'label.partial-success' },
  Aborted: { tone: 'error', badgeKey: 'label.failed-to-run' },
};
const DEFAULT_CONTRACT_PRESENTATION: ContractPresentation = {
  tone: 'error',
  badgeKey: 'label.breach',
};

export function getContractHealthRow(contract: DataContract | null | undefined, t: Translate): AssetHealthRow {
  const status = contract?.latestResult?.status;
  if (status === undefined || status === null) {
    return buildSetupRow('contract', 'create-contract', 'label.create', 'message.no-contract', t);
  }
  const presentation = CONTRACT_STATUS_PRESENTATION[status] ?? DEFAULT_CONTRACT_PRESENTATION;
  const timestamp = contract?.latestResult?.timestamp;
  const subtitle =
    contract?.latestResult?.message ||
    (timestamp === undefined
      ? ''
      : t('message.last-check-time', { time: getShortRelativeTime(timestamp) }));
  return buildRow('contract', presentation.tone, subtitle, t(presentation.badgeKey));
}

export function getAssetHealthHeader(rows: AssetHealthRow[]): AssetHealthHeader {
  const configured = rows.filter((row) => !row.cta);
  const errorCount = configured.filter((row) => row.tone === 'error').length;
  const hasWarning = configured.some((row) => row.tone === 'warning');
  const hasInProgress = configured.some((row) => row.tone === 'info');

  if (configured.length === 0) {
    return { tone: 'neutral', labelKey: 'label.not-set-up' };
  }
  if (errorCount >= 2) {
    return { tone: 'error', labelKey: 'label.critical' };
  }
  if (errorCount === 1) {
    return { tone: 'error', labelKey: 'label.attention' };
  }
  if (hasWarning) {
    return { tone: 'warning', labelKey: 'label.attention' };
  }
  if (hasInProgress) {
    return { tone: 'info', labelKey: 'label.running' };
  }
  return { tone: 'success', labelKey: 'label.all-clear' };
}

/** antd Badge status for a tone; the neutral tone reads as the default dot. */
export const ASSET_HEALTH_BADGE_STATUS: Record<AssetHealthTone, 'success' | 'warning' | 'error' | 'processing' | 'default'> = {
  success: 'success',
  warning: 'warning',
  error: 'error',
  info: 'processing',
  neutral: 'default',
};
