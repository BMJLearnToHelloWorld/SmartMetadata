/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  AppstoreOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  GlobalOutlined,
  HeartOutlined,
  ReadOutlined,
  SortAscendingOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons-vue';
import type { Component } from 'vue';
import { LANDING_PAGE_WIDGET_KEYS } from './landingPageLayout';

/**
 * The header tone tile for each home topic widget, ported from the
 * official framework's per-widget TONE (icon + tile classes in each
 * `*Widget.tsx` / `*.constants.ts`): the tile is a 40px square with
 * the widget's icon on a tinted background, the title beside it, the
 * summary under the title, and the status trailing right
 * (TopicCardHeader). The tints are product tokens, not official's
 * colours: official's blue tile maps to the primary tint, error and
 * warning to their product tints, and the two tiles with no product
 * tint (indigo, purple) map to the primary tint — recorded, not
 * invented. Gray tiles use the elevated surface + secondary text.
 *
 * ADR:2026-11-11-home-style-compaction-and-tokens
 */
export interface WidgetTone {
  icon: Component;
  /** Tile background, a --sm-* token var. */
  bg: string;
  /** Tile icon colour, a --sm-* token var. */
  fg: string;
}

const PRIMARY: Pick<WidgetTone, 'bg' | 'fg'> = {
  bg: 'var(--sm-color-primary-bg)',
  fg: 'var(--sm-color-primary)',
};
const ERROR: Pick<WidgetTone, 'bg' | 'fg'> = {
  bg: 'var(--sm-color-error-bg)',
  fg: 'var(--sm-color-error-text)',
};
const WARNING: Pick<WidgetTone, 'bg' | 'fg'> = {
  bg: 'var(--sm-color-warning-bg)',
  fg: 'var(--sm-color-warning-text)',
};
const NEUTRAL: Pick<WidgetTone, 'bg' | 'fg'> = {
  bg: 'var(--sm-bg-elevated)',
  fg: 'var(--sm-text-secondary)',
};

export const WIDGET_TONES: Readonly<Record<string, WidgetTone>> = {
  // Official: DataHealthScore icon, error tile.
  [LANDING_PAGE_WIDGET_KEYS.PLATFORM_HEALTH]: { icon: HeartOutlined, ...ERROR },
  // Official: Assets icon, blue tile.
  [LANDING_PAGE_WIDGET_KEYS.DATA_ESTATE]: { icon: DatabaseOutlined, ...PRIMARY },
  // Official: LayersThree01 icon, blue tile.
  [LANDING_PAGE_WIDGET_KEYS.TOTAL_DATA_ASSETS]: { icon: AppstoreOutlined, ...PRIMARY },
  // Official: ClipboardCheck icon, blue tile.
  [LANDING_PAGE_WIDGET_KEYS.MY_TASK]: { icon: CheckSquareOutlined, ...PRIMARY },
  // Official: Dataflow03 icon, blue tile.
  [LANDING_PAGE_WIDGET_KEYS.PIPELINE_STATUS]: { icon: DeploymentUnitOutlined, ...PRIMARY },
  // Official: Teams icon, gray tile.
  [LANDING_PAGE_WIDGET_KEYS.ACTIVITY_FEED]: { icon: TeamOutlined, ...NEUTRAL },
  // Official: Follow icon, purple tile — no product purple tint.
  [LANDING_PAGE_WIDGET_KEYS.YOURS_AND_FOLLOWED]: { icon: StarOutlined, ...PRIMARY },
  // Official: Articles icon, gray tile.
  [LANDING_PAGE_WIDGET_KEYS.KNOWLEDGE_CENTER]: { icon: ReadOutlined, ...NEUTRAL },
  // Official: Sort icon, indigo tile — no product indigo tint.
  [LANDING_PAGE_WIDGET_KEYS.CURATED_ASSETS]: { icon: SortAscendingOutlined, ...PRIMARY },
  // Official: DataQuality icon, error tile.
  [LANDING_PAGE_WIDGET_KEYS.DATA_QUALITY]: { icon: CheckCircleOutlined, ...ERROR },
  // Official: Domain icon, blue tile.
  [LANDING_PAGE_WIDGET_KEYS.DOMAINS]: { icon: GlobalOutlined, ...PRIMARY },
  // Official: DataProduct icon, blue tile. ProductOutlined does not
  // exist in the installed icons version; ClusterOutlined stands in.
  [LANDING_PAGE_WIDGET_KEYS.DATA_PRODUCTS]: { icon: ClusterOutlined, ...PRIMARY },
  // Official: RankingDetails icon, warning tile.
  [LANDING_PAGE_WIDGET_KEYS.KPI]: { icon: BarChartOutlined, ...WARNING },
};

export function getWidgetTone(widgetKey: string): WidgetTone | undefined {
  return WIDGET_TONES[widgetKey];
}
