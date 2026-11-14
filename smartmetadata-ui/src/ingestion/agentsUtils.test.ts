/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { DatabaseOutlined, StarOutlined } from '@ant-design/icons-vue';
import type { Agent } from '@/types/ingestion';
import {
  AGENT_STATUS_PILL,
  agentActionPermissions,
  canRunAgent,
  convertSecondsToHumanReadableFormat,
  formatEtaLong,
  formatEtaShort,
  getAgentTypeIcon,
  getAgentTypeLabelKey,
  getEtaInfo,
  getFinishedSuffix,
  getUnitLabelKey,
  getUnitVerbLabelKey,
  NO_AGENT_PERMISSIONS,
  RUN_META,
  shouldShowLastRunMetric,
} from './agentsUtils';

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'p1',
    fqn: 'pg.metadata',
    pipelineType: 'metadata',
    name: 'Metadata Agent',
    type: 'Metadata',
    unit: 'assets',
    verb: 'ingested',
    status: 'success',
    pct: 100,
    eta: 0,
    assets: 10,
    target: 10,
    errors: 0,
    warnings: 0,
    recentRuns: [],
    ...overrides,
  };
}

/** Records the keys a formatter asks for, interpolating {{params}} like vue-i18n. */
function stubT() {
  const calls: Array<{ key: string; params?: Record<string, string | number> }> = [];
  const t = (key: string, params?: Record<string, string | number>): string => {
    calls.push({ key, params });
    let rendered = key;
    for (const [name, value] of Object.entries(params ?? {})) {
      rendered = rendered.replace(`{{${name}}}`, String(value));
    }
    return rendered;
  };
  return { t, calls };
}

describe('agentActionPermissions / canRunAgent', () => {
  it('derives trigger/edit/delete from the entity permission bits, admin ORed in', () => {
    expect(agentActionPermissions(false, { Trigger: true, EditAll: false, Delete: true })).toEqual({
      trigger: true,
      edit: false,
      delete: true,
    });
    expect(agentActionPermissions(true, {})).toEqual({
      trigger: true,
      edit: true,
      delete: true,
    });
    expect(agentActionPermissions(false, undefined)).toEqual(NO_AGENT_PERMISSIONS);
  });

  it('allows Run only with the trigger bit, an enabled agent, and a non-active status', () => {
    const permitted = { trigger: true, edit: true, delete: true };
    expect(canRunAgent(permitted, agent())).toBe(true);
    expect(canRunAgent(permitted, agent({ enabled: false }))).toBe(false);
    expect(canRunAgent(permitted, agent({ status: 'running' }))).toBe(false);
    expect(canRunAgent(permitted, agent({ status: 'queued' }))).toBe(false);
    expect(canRunAgent(permitted, agent({ status: 'none' }))).toBe(true);
    expect(canRunAgent(NO_AGENT_PERMISSIONS, agent())).toBe(false);
    expect(canRunAgent(permitted, agent({ enabled: undefined }))).toBe(true);
  });
});

describe('getEtaInfo / convertSecondsToHumanReadableFormat / formatEta*', () => {
  it('classifies the ETA state at the pin boundaries', () => {
    expect(getEtaInfo(null)).toEqual({ state: 'idle' });
    expect(getEtaInfo(undefined)).toEqual({ state: 'idle' });
    expect(getEtaInfo(0)).toEqual({ state: 'wrapping' });
    expect(getEtaInfo(-5)).toEqual({ state: 'wrapping' });
    expect(getEtaInfo(59)).toEqual({ state: 'seconds', seconds: 59 });
    expect(getEtaInfo(60)).toEqual({ state: 'duration', seconds: 60 });
  });

  it('formats durations largest-first, capped at the requested units', () => {
    expect(convertSecondsToHumanReadableFormat(0)).toBe('0s');
    expect(convertSecondsToHumanReadableFormat(59)).toBe('59s');
    expect(convertSecondsToHumanReadableFormat(60)).toBe('1m');
    expect(convertSecondsToHumanReadableFormat(61)).toBe('1m 1s');
    expect(convertSecondsToHumanReadableFormat(3661)).toBe('1h 1m');
    expect(convertSecondsToHumanReadableFormat(3661, 3)).toBe('1h 1m 1s');
    expect(convertSecondsToHumanReadableFormat(90061)).toBe('1d 1h');
    expect(convertSecondsToHumanReadableFormat(31104000)).toBe('1Y');
    expect(convertSecondsToHumanReadableFormat(-90)).toBe('-1m 30s');
    expect(convertSecondsToHumanReadableFormat(-90, 2, '+')).toBe('+1m 30s');
  });

  it('formats the long ETA with the pin locale keys', () => {
    const { t, calls } = stubT();
    expect(formatEtaLong({ state: 'idle' }, t)).toBe('');
    expect(formatEtaLong({ state: 'wrapping' }, t)).toBe('ingestion.agents.wrappingUp');
    expect(formatEtaLong({ state: 'seconds', seconds: 42 }, t)).toBe(
      'ingestion.agents.secondsLeft',
    );
    expect(formatEtaLong({ state: 'duration', seconds: 3661 }, t)).toBe(
      'ingestion.agents.durationLeft',
    );
    expect(calls).toContainEqual({
      key: 'ingestion.agents.secondsLeft',
      params: { count: 42 },
    });
    expect(calls).toContainEqual({
      key: 'ingestion.agents.durationLeft',
      params: { duration: '1h 1m' },
    });
  });

  it('formats the short ETA without the wrapper phrases', () => {
    const { t } = stubT();
    expect(formatEtaShort({ state: 'idle' }, t)).toBe('');
    expect(formatEtaShort({ state: 'wrapping' }, t)).toBe('ingestion.agents.wrappingUp');
    expect(formatEtaShort({ state: 'seconds', seconds: 42 }, t)).toBe(
      'ingestion.agents.secondsShort',
    );
    expect(formatEtaShort({ state: 'duration', seconds: 3661 }, t)).toBe('1h 1m');
  });
});

describe('unit / verb / type lookups', () => {
  it('resolves unit and verb label keys with the assets fallbacks', () => {
    expect(getUnitLabelKey('queries')).toBe('ingestion.agents.queryPluralLowercase');
    expect(getUnitLabelKey('models')).toBe('ingestion.agents.modelPluralLowercase');
    expect(getUnitLabelKey('mystery')).toBe('ingestion.agents.assetPluralLowercase');
    expect(getUnitVerbLabelKey('scanned')).toBe('ingestion.agents.queriesScanned');
    expect(getUnitVerbLabelKey('parsed')).toBe('ingestion.agents.modelsParsed');
    expect(getUnitVerbLabelKey('mystery')).toBe('ingestion.agents.assetsIngested');
  });

  it('resolves agent type icons and label keys with the metadata fallbacks', () => {
    expect(getAgentTypeIcon('Auto Classification')).toBe(StarOutlined);
    expect(getAgentTypeIcon('mystery')).toBe(DatabaseOutlined);
    expect(getAgentTypeLabelKey('Usage')).toBe('ingestion.pipelines.types.usage');
    expect(getAgentTypeLabelKey('Data Quality')).toBe('ingestion.pipelines.types.TestSuite');
    expect(getAgentTypeLabelKey('Tier')).toBe('ingestion.pipelines.types.metadata');
  });

  it('exposes the status pill and run metadata tables', () => {
    expect(AGENT_STATUS_PILL.running).toEqual({
      color: 'processing',
      labelKey: 'ingestion.agents.running',
    });
    expect(AGENT_STATUS_PILL.none).toEqual({
      color: 'default',
      labelKey: 'ingestion.agents.noStatus',
    });
    expect(RUN_META.partial.labelKey).toBe('ingestion.agents.partialSuccess');
    expect(RUN_META.skipped.labelKey).toBe('ingestion.agents.didNotRun');
  });
});

describe('shouldShowLastRunMetric / getFinishedSuffix', () => {
  it('shows the last-run metric for success and for none agents with a past run', () => {
    expect(shouldShowLastRunMetric(agent({ status: 'success' }))).toBe(true);
    expect(shouldShowLastRunMetric(agent({ status: 'failed' }))).toBe(false);
    expect(shouldShowLastRunMetric(agent({ status: 'none', assets: 0 }))).toBe(false);
    expect(shouldShowLastRunMetric(agent({ status: 'none', assets: 5 }))).toBe(true);
    expect(
      shouldShowLastRunMetric(agent({ status: 'none', assets: 0, finishedAt: '10 mins ago' })),
    ).toBe(true);
  });

  it('renders the finished suffix only when a finish time exists', () => {
    const { t } = stubT();
    expect(getFinishedSuffix(agent({ finishedAt: '10 mins ago' }), t)).toBe(
      ' · ingestion.agents.finishedLowercase 10 mins ago',
    );
    expect(getFinishedSuffix(agent(), t)).toBe('');
  });
});
