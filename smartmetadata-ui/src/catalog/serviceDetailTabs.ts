/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getCountLabel } from './serviceCountLabel';
import type { ServiceKind } from '@/types/ingestion';

/** Tab roles in the official ServiceDetailsPage tab order. */
export type ServiceDetailTabKind = 'insights' | 'main' | 'secondary' | 'agents' | 'connection';

export interface ServiceDetailTabDef {
  /** URL tab key. The main tab key is the English count-label slug, not a locale string (ADR:2026-11-17-service-main-tab-key). */
  key: string;
  /** i18n key for the tab label. */
  labelKey: string;
  kind: ServiceDetailTabKind;
}

export interface ServiceDetailTabInput {
  kind: ServiceKind;
  /** Owner, owner-team member, or admin (official Agents tab rule). */
  showAgentsTab: boolean;
  /** Ungated EditAll flag: the Connection tab hides without it. */
  canEditAll: boolean;
}

/**
 * Official ServiceDetailsPage tab composition, as pure data: Insights,
 * then the main child-entity tab, then kind-specific secondary tabs
 * (dashboard data models, drive files/spreadsheets), then Agents,
 * then Connection. Metadata services get only Agents + Connection
 * (no child entities, no insights); security services get only
 * Connection (no agents tab, no insights). The versions surface is a
 * separate route, never a tab.
 */
export function resolveServiceDetailTabs(input: ServiceDetailTabInput): ServiceDetailTabDef[] {
  const { kind, showAgentsTab, canEditAll } = input;
  const tabs: ServiceDetailTabDef[] = [];
  if (kind !== 'metadata' && kind !== 'security') {
    tabs.push({ key: 'insights', labelKey: 'ingestion.services.insightsTab', kind: 'insights' });
    const { key, labelKey } = getCountLabel(kind);
    tabs.push({ key, labelKey, kind: 'main' });
    if (kind === 'dashboard') {
      tabs.push({
        key: 'data-model',
        labelKey: 'serviceDetail.dataModels.dataModels',
        kind: 'secondary',
      });
    }
    if (kind === 'drive') {
      tabs.push({ key: 'files', labelKey: 'serviceDetail.drive.files', kind: 'secondary' });
      tabs.push({
        key: 'spreadsheets',
        labelKey: 'serviceDetail.drive.spreadsheets',
        kind: 'secondary',
      });
    }
  }
  if (kind !== 'security' && showAgentsTab) {
    tabs.push({ key: 'agents', labelKey: 'ingestion.services.agentsTab', kind: 'agents' });
  }
  if (canEditAll) {
    tabs.push({ key: 'connection', labelKey: 'ingestion.services.connectionTab', kind: 'connection' });
  }
  return tabs;
}

/** Official default tab: metadata opens on Agents, security on Connection, the rest on Insights. */
export function defaultServiceDetailTab(kind: ServiceKind): string {
  if (kind === 'metadata') {
    return 'agents';
  }
  if (kind === 'security') {
    return 'connection';
  }
  return 'insights';
}

/** The first visible tab, or undefined when nothing is visible (never crash on an empty set). */
export function firstServiceDetailTab(tabs: readonly ServiceDetailTabDef[]): string | undefined {
  return tabs[0]?.key;
}
