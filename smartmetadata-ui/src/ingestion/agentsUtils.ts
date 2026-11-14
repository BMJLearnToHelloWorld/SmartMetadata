/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  AppstoreOutlined,
  CodeOutlined,
  DatabaseOutlined,
  SafetyOutlined,
  ShareAltOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import type { OperationPermissions } from '@/api/permissions';
import type { Agent, AgentActionPermissions, AgentStatus, RunStatus } from '@/types/ingestion';

/**
 * Agent card helpers, ported from official
 * components/ServiceAgents/utils/agents.utils.ts (openmetadata-ui,
 * pin a3012259ca). Tailwind class strings are not ported: the fork
 * renders with Ant Design components and its own tokens, so the
 * status/dot metadata below carries antd colors and CSS variables
 * instead.
 */

export const NO_AGENT_PERMISSIONS: AgentActionPermissions = {
  trigger: false,
  edit: false,
  delete: false,
};

/**
 * Per-agent action permissions, mirroring official
 * useAgentPermissions (trigger → Trigger, edit → EditAll, delete →
 * Delete) with the fork's P1 admin line ORed in, as in
 * pipelineActions. A missing permission fetch denies (fail-closed).
 */
export function agentActionPermissions(
  isAdminUser: boolean,
  ops: OperationPermissions | undefined,
): AgentActionPermissions {
  return {
    trigger: isAdminUser || ops?.Trigger === true,
    edit: isAdminUser || ops?.EditAll === true,
    delete: isAdminUser || ops?.Delete === true,
  };
}

/** Card/menu actions, named as in official AgentOverflowMenu / useAgentActions. */
export type AgentAction = 'run' | 'redeploy' | 'kill' | 'pause' | 'resume' | 'edit' | 'delete';

export function canRunAgent(
  permissions: AgentActionPermissions,
  agent: Agent,
): boolean {
  return (
    permissions.trigger &&
    agent.enabled !== false &&
    agent.status !== 'running' &&
    agent.status !== 'queued'
  );
}

export function fmtNum(value: number): string {
  return value.toLocaleString();
}

export type EtaState = 'idle' | 'wrapping' | 'seconds' | 'duration';

export interface EtaInfo {
  state: EtaState;
  seconds?: number;
}

export function getEtaInfo(etaSeconds: number | null | undefined): EtaInfo {
  if (etaSeconds === null || etaSeconds === undefined) {
    return { state: 'idle' };
  }
  if (etaSeconds <= 0) {
    return { state: 'wrapping' };
  }
  if (etaSeconds < 60) {
    return { state: 'seconds', seconds: etaSeconds };
  }
  return { state: 'duration', seconds: etaSeconds };
}

const SECONDS_PER_UNIT: ReadonlyArray<readonly [string, number]> = [
  ['Y', 31104000],
  ['M', 2592000],
  ['d', 86400],
  ['h', 3600],
  ['m', 60],
  ['s', 1],
];

/**
 * Official utils/date-time/DateTimeUtils.ts
 * `convertSecondsToHumanReadableFormat`: 3661 → "1h 1m" (at most
 * `length` units, largest first, zero units skipped, 0 → "0s").
 */
export function convertSecondsToHumanReadableFormat(
  seconds: number,
  length = 2,
  prependForNegative = '-',
): string {
  if (seconds === 0) {
    return '0s';
  }
  const negative = seconds < 0;
  let remaining = Math.abs(seconds);
  const parts: string[] = [];
  for (const [suffix, unitSeconds] of SECONDS_PER_UNIT) {
    if (parts.length >= length) {
      break;
    }
    const value = Math.floor(remaining / unitSeconds);
    if (value > 0) {
      parts.push(`${value}${suffix}`);
      remaining -= value * unitSeconds;
    }
  }
  const formatted = parts.length > 0 ? parts.join(' ') : '0s';
  return negative ? `${prependForNegative}${formatted}` : formatted;
}

type Translate = (key: string, params?: Record<string, string | number>) => string;

export function formatEtaLong(etaInfo: EtaInfo, t: Translate): string {
  switch (etaInfo.state) {
    case 'wrapping':
      return t('ingestion.agents.wrappingUp');
    case 'seconds':
      return t('ingestion.agents.secondsLeft', { count: etaInfo.seconds ?? 0 });
    case 'duration':
      return t('ingestion.agents.durationLeft', {
        duration: convertSecondsToHumanReadableFormat(etaInfo.seconds ?? 0, 2),
      });
    case 'idle':
    default:
      return '';
  }
}

export function formatEtaShort(etaInfo: EtaInfo, t: Translate): string {
  switch (etaInfo.state) {
    case 'wrapping':
      return t('ingestion.agents.wrappingUp');
    case 'seconds':
      return t('ingestion.agents.secondsShort', { count: etaInfo.seconds ?? 0 });
    case 'duration':
      return convertSecondsToHumanReadableFormat(etaInfo.seconds ?? 0, 2);
    case 'idle':
    default:
      return '';
  }
}

/** Unit noun label keys, keyed by the agent's counted unit. */
export const UNIT_LABEL_KEY: Record<string, string> = {
  queries: 'ingestion.agents.queryPluralLowercase',
  assets: 'ingestion.agents.assetPluralLowercase',
  models: 'ingestion.agents.modelPluralLowercase',
};

/** Past-tense verb phrase label keys, keyed by the agent's verb. */
export const UNIT_VERB_LABEL_KEY: Record<string, string> = {
  scanned: 'ingestion.agents.queriesScanned',
  processed: 'ingestion.agents.queriesProcessed',
  ingested: 'ingestion.agents.assetsIngested',
  profiled: 'ingestion.agents.assetsProfiled',
  parsed: 'ingestion.agents.modelsParsed',
};

export function getUnitLabelKey(unit: string): string {
  return UNIT_LABEL_KEY[unit] ?? UNIT_LABEL_KEY.assets;
}

export function getUnitVerbLabelKey(verb: string): string {
  return UNIT_VERB_LABEL_KEY[verb] ?? UNIT_VERB_LABEL_KEY.ingested;
}

export function shouldShowLastRunMetric(agent: Agent): boolean {
  return (
    agent.status === 'success' ||
    (agent.status === 'none' && (agent.assets > 0 || agent.finishedAt !== undefined))
  );
}

export function getFinishedSuffix(agent: Agent, t: Translate): string {
  if (agent.finishedAt === undefined) {
    return '';
  }
  return ` · ${t('ingestion.agents.finishedLowercase')} ${agent.finishedAt}`;
}

/**
 * Agent-type icon map. The pin maps to UntitledUI glyphs; the fork
 * maps to the equivalent Ant Design icons from its own icon set
 * (visual adaptation — the type keys are the pin's).
 */
export const AGENT_TYPE_ICON: Record<string, Component> = {
  Metadata: DatabaseOutlined,
  Usage: ThunderboltOutlined,
  Profiler: AppstoreOutlined,
  Lineage: ShareAltOutlined,
  'Auto Classification': StarOutlined,
  dbt: CodeOutlined,
  'Data Quality': SafetyOutlined,
};

export function getAgentTypeIcon(type: string): Component {
  return AGENT_TYPE_ICON[type] ?? DatabaseOutlined;
}

/**
 * Agent-type label keys, reusing the fork's pipeline-type labels.
 * Tier / Documentation are Collate-only types the pin lists for a
 * widget the OSS build never renders; they are unreachable here and
 * fall back to the metadata label.
 */
export const AGENT_TYPE_LABEL_KEY: Record<string, string> = {
  Metadata: 'ingestion.pipelines.types.metadata',
  Usage: 'ingestion.pipelines.types.usage',
  Lineage: 'ingestion.pipelines.types.lineage',
  Profiler: 'ingestion.pipelines.types.profiler',
  'Auto Classification': 'ingestion.pipelines.types.autoClassification',
  dbt: 'ingestion.pipelines.types.dbt',
  'Data Quality': 'ingestion.pipelines.types.TestSuite',
};

export function getAgentTypeLabelKey(type: string): string {
  return AGENT_TYPE_LABEL_KEY[type] ?? AGENT_TYPE_LABEL_KEY.Metadata;
}

export const AGENT_STATUS_PILL: Record<AgentStatus, { color: string; labelKey: string }> = {
  running: { color: 'processing', labelKey: 'ingestion.agents.running' },
  success: { color: 'success', labelKey: 'ingestion.agents.success' },
  failed: { color: 'error', labelKey: 'ingestion.agents.failed' },
  queued: { color: 'default', labelKey: 'ingestion.agents.queued' },
  none: { color: 'default', labelKey: 'ingestion.agents.noStatus' },
};

export const RUN_META: Record<RunStatus, { labelKey: string; colorVar: string }> = {
  success: { labelKey: 'ingestion.agents.success', colorVar: '--sm-color-success' },
  partial: { labelKey: 'ingestion.agents.partialSuccess', colorVar: '--sm-color-warning' },
  failed: { labelKey: 'ingestion.agents.failed', colorVar: '--sm-color-error' },
  running: { labelKey: 'ingestion.agents.running', colorVar: '--sm-brand' },
  skipped: { labelKey: 'ingestion.agents.didNotRun', colorVar: '--sm-text-quaternary' },
};
