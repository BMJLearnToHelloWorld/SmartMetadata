/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { Agent } from '@/types/ingestion';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Deployment summary derivations, ported from official
 * components/ServiceAgents/components/DeploymentSummaryCard.component.tsx
 * (openmetadata-ui, pin a3012259ca). The card derives everything from
 * the LIVE agents list and renders nothing when no agent is active.
 */

export interface DeploymentSummary {
  allDone: boolean;
  total: number;
  running: number;
  done: number;
  failed: number;
  queued: number;
  assets: number;
  errors: number;
  /** Max ETA across running agents; null when no running agent reports one. */
  maxEta: number | null;
  percent: number;
  titleKey: string;
  subtitle: string;
}

export function getDeploymentSummary(
  agents: readonly Agent[],
  totalAgents: number | undefined,
  t: Translate,
): DeploymentSummary | null {
  const activeAgents = agents.filter((agent) => agent.status !== 'none');
  if (activeAgents.length === 0) {
    return null;
  }

  const total = Math.max(activeAgents.length, totalAgents ?? 0);
  const running = activeAgents.filter((agent) => agent.status === 'running').length;
  const done = activeAgents.filter((agent) => agent.status === 'success').length;
  const failed = activeAgents.filter((agent) => agent.status === 'failed').length;
  const queued = total - done - running - failed;
  const allDone = running === 0 && done + failed === total;

  // Assets come from the NEWEST run of the Metadata agent(s) only —
  // never summed across agents, which would count the same catalog
  // several times over. The filter keys on the pipeline type, not
  // the mapped display type: application, dataInsight and other
  // pipeline types map to the same 'Metadata' display type but
  // count different units.
  const latestMetadataAgent = activeAgents
    .filter((agent) => agent.pipelineType === 'metadata' && agent.status !== 'queued')
    .reduce<Agent | undefined>((latest, agent) => {
      const isNewerRun = !latest || (agent.lastRunAt ?? 0) > (latest.lastRunAt ?? 0);
      return isNewerRun ? agent : latest;
    }, undefined);
  const assets = latestMetadataAgent?.assets ?? 0;

  const errors = activeAgents.reduce((sum, agent) => sum + agent.errors, 0);

  let maxEta: number | null = null;
  for (const agent of activeAgents) {
    if (agent.status === 'running' && agent.eta !== null) {
      maxEta = maxEta === null ? agent.eta : Math.max(maxEta, agent.eta);
    }
  }

  const percent =
    total > 0
      ? Math.round(activeAgents.reduce((sum, agent) => sum + agent.pct, 0) / total)
      : 0;

  const needAttention =
    failed > 0 ? ` · ${failed} ${t('ingestion.agents.needAttention')}` : '';
  const failedSuffix =
    failed > 0 ? ` · ${failed} ${t('ingestion.agents.failedLowercase')}` : '';
  const subtitle = allDone
    ? t('ingestion.agents.finishedSummary', {
        done,
        total,
        attentionSuffix:
          failed > 0 ? needAttention : ` · ${t('ingestion.agents.everythingHealthy')}`,
      })
    : t('ingestion.agents.deployProgress', {
        done,
        running,
        queued,
        failedSuffix,
      });

  return {
    allDone,
    total,
    running,
    done,
    failed,
    queued,
    assets,
    errors,
    maxEta,
    percent,
    titleKey: allDone
      ? 'ingestion.agents.deploymentComplete'
      : 'ingestion.agents.deployingIngesting',
    subtitle,
  };
}
