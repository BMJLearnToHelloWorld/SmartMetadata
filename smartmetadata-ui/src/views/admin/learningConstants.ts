/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import dayjs from 'dayjs';

/**
 * Learning-resources constants and pure helpers, ported from the official
 * Learning.constants / Learning.interface / learning.utils / StringUtils.
 * Kept view-local to the 04 Learning partition.
 */

export const MAX_VISIBLE_TAGS = 2;
export const MAX_VISIBLE_CONTEXTS = 2;
export const MAX_VISIBLE_CATEGORIES_IN_CARD = 2;
export const DESCRIPTION_VIEW_MORE_THRESHOLD = 100;

export type ResourceCategory =
  | 'Discovery'
  | 'Administration'
  | 'DataGovernance'
  | 'DataQuality'
  | 'Observability'
  | 'AI';

export type ResourceTypeValue = 'Storylane' | 'Video' | 'Article' | 'Link' | 'PDF';

export const CATEGORY_BADGE_COLORS: Record<ResourceCategory, string> = {
  Discovery: 'blue',
  Administration: 'cyan',
  DataGovernance: 'purple',
  DataQuality: 'orange',
  Observability: 'orange',
  AI: 'magenta',
};

export const LEARNING_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  Discovery: 'Discovery',
  Administration: 'Admin',
  DataGovernance: 'Governance',
  DataQuality: 'Data Quality',
  Observability: 'Observability',
  AI: 'AI',
};

export const CATEGORIES: { value: ResourceCategory; label: string }[] = [
  { value: 'Discovery', label: 'Discovery' },
  { value: 'DataGovernance', label: 'Governance' },
  { value: 'DataQuality', label: 'Data Quality' },
  { value: 'Observability', label: 'Observability' },
  { value: 'Administration', label: 'Admin' },
  { value: 'AI', label: 'AI' },
];

export const RESOURCE_TYPE_VALUES: ResourceTypeValue[] = ['Video', 'Storylane', 'Link', 'PDF'];

export const RESOURCE_TYPE_LABEL_KEYS: Record<ResourceTypeValue, string> = {
  Article: 'settings.learning.typeArticle',
  Link: 'settings.learning.typeLink',
  PDF: 'settings.learning.typePdf',
  Storylane: 'settings.learning.typeStorylane',
  Video: 'settings.learning.typeVideo',
};

export const SOURCE_URL_PLACEHOLDERS: Record<ResourceTypeValue, string> = {
  Article: 'https://docs.example.com/article',
  Link: 'https://docs.example.com/guide',
  PDF: 'https://docs.example.com/guide.pdf',
  Storylane: 'https://app.storylane.io/share/...',
  Video: 'https://www.youtube.com/watch?v=...',
};

export const LEARNING_RESOURCE_STATUSES = ['Active', 'Draft', 'Deprecated'] as const;

export const DURATIONS = [
  '1 min',
  '2 mins',
  '3 mins',
  '5 mins',
  '10 mins',
  '15 mins',
  '30 mins',
];

/** "5 mins" → 300 seconds, the unit the API stores. */
export function parseDuration(duration: string): number {
  const match = /(\d+)/.exec(duration);
  return match ? Number.parseInt(match[1], 10) * 60 : 0;
}

export const DURATION_ITEMS: { id: string; label: string }[] = DURATIONS.map((duration) => ({
  id: String(parseDuration(duration)),
  label: duration,
}));

export const PAGE_IDS: { value: string; label: string }[] = [
  { value: 'domain', label: 'Domain' },
  { value: 'dataProduct', label: 'Data Product' },
  { value: 'glossary', label: 'Glossary' },
  { value: 'glossaryTerm', label: 'Glossary Term' },
  { value: 'classification', label: 'Classification' },
  { value: 'tags', label: 'Tags' },
  { value: 'lineage', label: 'Lineage' },
  { value: 'dataInsights', label: 'Data Insights' },
  { value: 'dataInsightDashboards', label: 'Data Insight Dashboards' },
  { value: 'dataQuality', label: 'Data Quality' },
  { value: 'testSuite', label: 'Test Suite' },
  { value: 'incidentManager', label: 'Incident Manager' },
  { value: 'profilerConfiguration', label: 'Profiler Configuration' },
  { value: 'testLibrary', label: 'Test Library' },
  { value: 'explore', label: 'Explore' },
  { value: 'table', label: 'Table' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'topic', label: 'Topic' },
  { value: 'container', label: 'Container' },
  { value: 'mlmodel', label: 'ML Model' },
  { value: 'storedProcedure', label: 'Stored Procedure' },
  { value: 'searchIndex', label: 'Search Index' },
  { value: 'apiEndpoint', label: 'API Endpoint' },
  { value: 'apiCollection', label: 'API Collection' },
  { value: 'database', label: 'Database' },
  { value: 'databaseSchema', label: 'Database Schema' },
  { value: 'homePage', label: 'Home Page' },
  { value: 'myData', label: 'My Data' },
  { value: 'governanceWorkflows', label: 'Workflows' },
  { value: 'automations', label: 'Automations' },
  { value: 'knowledgeCenter', label: 'Knowledge Center' },
  { value: 'sqlStudio', label: 'SQL Studio' },
  { value: 'queryBuilder', label: 'Query Builder' },
  { value: 'askCollate', label: 'Ask Collate' },
  { value: 'aiAssistant', label: 'AI Assistant' },
  { value: 'metrics', label: 'Metrics' },
  { value: 'dataObservability', label: 'Data Observability' },
  { value: 'pipelineObservability', label: 'Pipeline Observability' },
  { value: 'alerts', label: 'Alerts' },
  { value: 'services', label: 'Services' },
  { value: 'policies', label: 'Policies' },
  { value: 'roles', label: 'Roles' },
  { value: 'teams', label: 'Teams' },
  { value: 'users', label: 'Users' },
  { value: 'notificationTemplates', label: 'Notification Templates' },
  { value: 'ingestionRunners', label: 'Ingestion Runners' },
  { value: 'usage', label: 'Usage' },
  { value: 'settings', label: 'Settings' },
];

export function getCategoryLabel(category: string): string {
  return LEARNING_CATEGORY_LABELS[category as ResourceCategory] ?? category;
}

export function getCategoryColor(category: string): string {
  return CATEGORY_BADGE_COLORS[category as ResourceCategory] ?? 'default';
}

export function getContextLabel(pageId: string): string {
  return PAGE_IDS.find((p) => p.value === pageId)?.label ?? pageId;
}

const SAFE_URL_PROTOCOLS = ['http:', 'https:'];

/** Returns the URL only when it is an absolute http(s) URL, otherwise undefined. */
export function getSafeHttpUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }
  try {
    return SAFE_URL_PROTOCOLS.includes(new URL(url).protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

export function opensInNewTab(resourceType: string): boolean {
  return resourceType === 'Link';
}

export function openUrlInNewTab(url: string): void {
  const safeUrl = getSafeHttpUrl(url);
  if (safeUrl) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
  }
}

const READ_TIME_RESOURCE_TYPES = new Set(['Article', 'Link', 'PDF']);

export function getDurationUnitLabelKey(resourceType: string): string {
  return READ_TIME_RESOURCE_TYPES.has(resourceType)
    ? 'settings.learning.minRead'
    : 'settings.learning.minWatch';
}

export function formatDuration(
  estimatedDuration: number | undefined,
  unitLabel: string,
): string | null {
  return estimatedDuration
    ? `${Math.floor(estimatedDuration / 60)} ${unitLabel}`
    : null;
}

/** Official table/player date: luxon `LLL d, yyyy` ("Nov 5, 2026"). */
export function formatTableDate(updatedAt: number | undefined): string | null {
  return updatedAt ? dayjs(updatedAt).format('MMM D, YYYY') : null;
}

/** Official card date: luxon `LLL dd, yyyy` ("Nov 05, 2026"). */
export function formatCardDate(updatedAt: number | undefined): string | null {
  return updatedAt ? dayjs(updatedAt).format('MMM DD, YYYY') : null;
}

const YOUTUBE_HOSTNAMES = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];
const VIMEO_HOSTNAMES = ['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'];

function buildYouTubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?enablejsapi=1&origin=${window.location.origin}`;
}

function getYouTubeEmbedUrl(parsedUrl: URL, originalUrl: string): string {
  const hostname = parsedUrl.hostname.toLowerCase();
  if (hostname === 'youtu.be') {
    const videoId = parsedUrl.pathname.split('/').filter(Boolean)[0] || '';
    return videoId ? buildYouTubeEmbedUrl(videoId) : originalUrl;
  }
  if (parsedUrl.pathname.startsWith('/watch')) {
    const videoId = parsedUrl.searchParams.get('v') || '';
    return videoId ? buildYouTubeEmbedUrl(videoId) : originalUrl;
  }
  if (parsedUrl.pathname.startsWith('/embed/')) {
    return originalUrl;
  }
  return originalUrl;
}

function getVimeoEmbedUrl(parsedUrl: URL, originalUrl: string): string {
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);
  const videoId = pathParts[pathParts.length - 1] || '';
  return videoId ? `https://player.vimeo.com/video/${videoId}` : originalUrl;
}

// Takes a URL getSafeHttpUrl has already accepted, so it always parses.
export function getEmbedUrl(url: string): string {
  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname.toLowerCase();
  if (YOUTUBE_HOSTNAMES.includes(hostname)) {
    return getYouTubeEmbedUrl(parsedUrl, url);
  }
  if (VIMEO_HOSTNAMES.includes(hostname)) {
    return getVimeoEmbedUrl(parsedUrl, url);
  }
  return url;
}
