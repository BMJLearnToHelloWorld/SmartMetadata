/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { RouteLocationRaw } from 'vue-router';
import type { AuditLogEntry } from '@/api/auditLogs';
import { assetLocation, isDetailWired } from '@/catalog/entityRoutes';
import { splitFqn } from '@/catalog/fqn';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { roleDetailLocation, policyDetailLocation } from './accessPaths';
import { startCase } from '@/utils/text';

/**
 * Pure feed model for the audit log list, ported from
 * components/AuditLog/AuditLogList.component.tsx at pin a3012259ca.
 * Every function below mirrors one pin helper; the Vue row component
 * renders the models without re-deriving them.
 */

/** Strips all HTML tags and returns plain text (BlockEditorPureUtils.ts:264). */
export function getTextFromHtmlString(description?: string): string {
  if (!description) {
    return '';
  }
  return description.replace(/<[^>]{1,1000}>/g, '').trim();
}

/**
 * Pin `parseValue`: a string that parses to a truthy JSON value becomes
 * the parsed value; anything else (including `'0'`, `'null'`, `'""'`
 * and unparseable text) stays the original value.
 */
export function parseChangeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed) {
        return parsed;
      }
    } catch {
      // Not JSON: fall through to the original string.
    }
    return value;
  }
  return value;
}

export function formatObjectChangeValue(parsed: object): string {
  const maybeEntity = parsed as { displayName?: string; name?: string };
  if (maybeEntity.displayName || maybeEntity.name) {
    return maybeEntity.displayName ?? maybeEntity.name ?? '';
  }
  return JSON.stringify(parsed);
}

export function formatChangeValue(value: unknown): string {
  const parsed = parseChangeValue(value);
  if (parsed === null || parsed === undefined) {
    return '';
  }
  if (Array.isArray(parsed)) {
    return parsed
      .map((item) => formatChangeValue(item))
      .filter((item) => Boolean(item))
      .join(', ');
  }
  if (typeof parsed === 'string') {
    const asText = getTextFromHtmlString(parsed);
    return asText || parsed;
  }
  if (typeof parsed === 'object') {
    return formatObjectChangeValue(parsed);
  }
  return String(parsed);
}

export interface AuditLogEntityInfo {
  fqn: string;
  name: string;
  displayName?: string;
  /** Carried for id-based detail routes (event subscriptions); the pin drops it. */
  id?: string;
}

export function extractEntityInfo(value: unknown): AuditLogEntityInfo[] {
  const parsed = parseChangeValue(value);
  if (!parsed) {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  const infos: AuditLogEntityInfo[] = [];
  for (const item of items) {
    if (typeof item === 'object' && item !== null) {
      const entity = item as {
        id?: string;
        fullyQualifiedName?: string;
        tagFQN?: string;
        fqn?: string;
        name?: string;
        displayName?: string;
      };
      const fqn =
        entity.fullyQualifiedName ?? entity.tagFQN ?? entity.fqn ?? entity.name;
      if (fqn) {
        infos.push({
          fqn,
          name: entity.name ?? splitFqn(fqn).pop() ?? fqn,
          displayName: entity.displayName,
          id: entity.id,
        });
      }
    }
  }
  return infos;
}

/** Last dot segment, start-cased; empty when the field has no name. */
export function getFieldLabel(name?: string): string {
  if (!name) {
    return '';
  }
  const parts = name.split('.');
  return startCase(parts[parts.length - 1] ?? '');
}

/**
 * Fields whose values render as entity links (pin `isLinkableField`).
 * `tags`, `dataproducts` and `domain` take the linkable branch but have
 * no product path constructor, so their segments render as plain text —
 * a routing-line residual, recorded in the batch report.
 */
export const LINKABLE_FIELD_KEYS = [
  'tags',
  'dataproducts',
  'teams',
  'domain',
  'owner',
  'reviewers',
  'experts',
] as const;

const USER_FIELD_KEYS = ['owner', 'reviewers', 'experts'] as const;

function matchesFieldKey(fieldName: string, keys: readonly string[]): boolean {
  const field = fieldName.toLowerCase();
  return keys.some((key) => field === key || field.endsWith(`.${key}`));
}

export function isLinkableField(fieldName?: string): boolean {
  return Boolean(fieldName) && matchesFieldKey(fieldName ?? '', LINKABLE_FIELD_KEYS);
}

export function isUserField(fieldName?: string): boolean {
  return Boolean(fieldName) && matchesFieldKey(fieldName ?? '', USER_FIELD_KEYS);
}

export function isDescriptionField(fieldName: string): boolean {
  return fieldName === 'description' || fieldName.endsWith('.description');
}

/**
 * Field → path table (pin LINKABLE_FIELD_RESOLVERS, product routes).
 * Team and user detail pages load by name. The user detail route is
 * :fqn-addressed (B-9 (a1)), so user FQN values resolve through the
 * :fqn param; the team route still carries its FQN value in the :id
 * param (the D-11 transition shape).
 */
const FIELD_LINK_RESOLVERS: Record<string, (fqn: string) => RouteLocationRaw> = {
  teams: (fqn) => ({ name: 'admin-team', params: { id: fqn } }),
  owner: (fqn) => ({ name: 'admin-user', params: { fqn } }),
  reviewers: (fqn) => ({ name: 'admin-user', params: { fqn } }),
  experts: (fqn) => ({ name: 'admin-user', params: { fqn } }),
};

function findFieldResolverKey(fieldName: string): string | undefined {
  const field = fieldName.toLowerCase();
  return Object.keys(FIELD_LINK_RESOLVERS).find(
    (key) => field === key || field.endsWith(`.${key}`),
  );
}

export function getEntityLinkForField(
  fieldName: string,
  entityInfo: AuditLogEntityInfo,
): RouteLocationRaw | null {
  const matchedKey = findFieldResolverKey(fieldName);
  return matchedKey ? FIELD_LINK_RESOLVERS[matchedKey]!(entityInfo.fqn) : null;
}

export interface AuditLogValueSegment {
  key: string;
  text: string;
  to?: RouteLocationRaw;
  avatar?: { name: string; displayName?: string };
}

/**
 * Pin `renderEntityLinks`: entity segments when the value carries
 * entities, else the formatted plain value as a single segment, else
 * no segments (the caller then falls through to the description/plain
 * branches).
 */
export function renderEntityLinkSegments(
  fieldName: string,
  value: unknown,
  keyPrefix: string,
): AuditLogValueSegment[] {
  const entities = extractEntityInfo(value);
  if (entities.length === 0) {
    const plainValue = formatChangeValue(value);
    return plainValue ? [{ key: `${keyPrefix}-plain`, text: plainValue }] : [];
  }
  const showAvatar = isUserField(fieldName);
  return entities.map((entity, index) => {
    const link = getEntityLinkForField(fieldName, entity);
    const segment: AuditLogValueSegment = {
      key: `${keyPrefix}-${index}-${entity.fqn}`,
      text: entity.displayName ?? entity.name,
    };
    if (link) {
      segment.to = link;
    }
    if (showAvatar) {
      segment.avatar = { name: entity.name, displayName: entity.displayName };
    }
    return segment;
  });
}

export type AuditLogDetailValue =
  | { kind: 'segments'; segments: AuditLogValueSegment[] }
  | { kind: 'markdown'; markdown: string };

/**
 * Pin `renderChangeValue`: a falsy raw value yields no node at all;
 * anything else yields a node, even when it formats to empty text.
 */
export function renderChangeValueModel(
  fieldName: string,
  value: unknown,
  keyPrefix: string,
): AuditLogDetailValue | null {
  if (!value) {
    return null;
  }
  if (isLinkableField(fieldName)) {
    const segments = renderEntityLinkSegments(fieldName, value, keyPrefix);
    if (segments.length > 0) {
      return { kind: 'segments', segments };
    }
  }
  if (isDescriptionField(fieldName)) {
    return {
      kind: 'markdown',
      markdown: typeof value === 'string' ? value : formatChangeValue(value),
    };
  }
  return { kind: 'segments', segments: [{ key: `${keyPrefix}-text`, text: formatChangeValue(value) }] };
}

export interface AuditLogChangeDetail {
  key: string;
  actionLabel: string;
  fieldLabel: string;
  oldValue: AuditLogDetailValue | null;
  newValue: AuditLogDetailValue | null;
}

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * Pin `getChangeDetails`: Added takes the new value, Deleted the old
 * value, Updated both (the `deleted` field is excluded from updates).
 * The field fallback reproduces the pin's `defaultValue: 'field'`.
 */
export function getChangeDetails(
  changeDescription: NonNullable<AuditLogEntry['changeEvent']>['changeDescription'],
  t: Translate,
): AuditLogChangeDetail[] {
  if (!changeDescription) {
    return [];
  }
  const addedLabel = startCase(t('label.added-lowercase'));
  const updatedLabel = startCase(t('label.updated-lowercase'));
  const removedLabel = startCase(t('label.removed-lowercase'));
  const fieldKey = t('label.field');
  const fallbackField = fieldKey === 'label.field' ? 'field' : fieldKey;

  const details: AuditLogChangeDetail[] = [];
  for (const change of changeDescription.fieldsAdded ?? []) {
    const label = getFieldLabel(change.name);
    details.push({
      key: `added-${change.name}`,
      actionLabel: addedLabel,
      fieldLabel: label || fallbackField,
      oldValue: null,
      newValue: renderChangeValueModel(change.name ?? '', change.newValue, `added-${change.name}`),
    });
  }
  for (const change of (changeDescription.fieldsUpdated ?? []).filter(
    (item) => item.name !== 'deleted',
  )) {
    const label = getFieldLabel(change.name);
    details.push({
      key: `updated-${change.name}`,
      actionLabel: updatedLabel,
      fieldLabel: label || fallbackField,
      oldValue: renderChangeValueModel(change.name ?? '', change.oldValue, `updated-old-${change.name}`),
      newValue: renderChangeValueModel(change.name ?? '', change.newValue, `updated-new-${change.name}`),
    });
  }
  for (const change of changeDescription.fieldsDeleted ?? []) {
    const label = getFieldLabel(change.name);
    details.push({
      key: `deleted-${change.name}`,
      actionLabel: removedLabel,
      fieldLabel: label || fallbackField,
      oldValue: renderChangeValueModel(change.name ?? '', change.oldValue, `deleted-${change.name}`),
      newValue: null,
    });
  }
  return details;
}

/** Lowercase → canonical entity type (pin `resolveEntityType`, case-insensitive match). */
const ENTITY_TYPE_CANONICAL: Record<string, string> = {
  table: 'table',
  topic: 'topic',
  dashboard: 'dashboard',
  pipeline: 'pipeline',
  mlmodel: 'mlmodel',
  container: 'container',
  searchindex: 'searchIndex',
  storedprocedure: 'storedProcedure',
  dashboarddatamodel: 'dashboardDataModel',
  chart: 'chart',
  database: 'database',
  databaseschema: 'databaseSchema',
  query: 'query',
  apicollection: 'apiCollection',
  apiendpoint: 'apiEndpoint',
  metric: 'metric',
  glossary: 'glossary',
  glossaryterm: 'glossaryTerm',
  classification: 'classification',
  tag: 'tag',
  domain: 'domain',
  dataproduct: 'dataProduct',
  user: 'user',
  team: 'team',
  bot: 'bot',
  persona: 'persona',
  role: 'role',
  policy: 'policy',
  databaseservice: 'databaseService',
  messagingservice: 'messagingService',
  dashboardservice: 'dashboardService',
  pipelineservice: 'pipelineService',
  mlmodelservice: 'mlmodelService',
  storageservice: 'storageService',
  searchservice: 'searchService',
  apiservice: 'apiService',
  metadataservice: 'metadataService',
  driveservice: 'driveService',
  ingestionpipeline: 'ingestionPipeline',
  testsuite: 'testSuite',
  testcase: 'testCase',
  eventsubscription: 'eventSubscription',
  app: 'application',
  application: 'application',
  kpi: 'kpi',
  directory: 'directory',
  file: 'file',
  spreadsheet: 'spreadsheet',
  worksheet: 'worksheet',
  knowledgepage: 'knowledgePage',
};

export function resolveEntityType(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  return ENTITY_TYPE_CANONICAL[value.toLowerCase()];
}

export interface AuditLogDisplayInfo {
  userName: string;
  eventType: string;
  entityType?: string;
  entityFQN?: string;
  entityLabel?: string;
  normalizedType?: string;
  timestamp?: number;
  entityId?: string;
}

export function resolveEntityLabel(log: AuditLogEntry, entityFQN?: string): string | undefined {
  const entity = log.changeEvent?.entity;
  const entityNameLabel = (entity ? getEntityName(entity) : '') || entity?.name;
  const splitEntityFqn = entityFQN ? splitFqn(entityFQN).pop() : undefined;
  return (
    entityNameLabel ||
    splitEntityFqn ||
    log.changeEvent?.entityFullyQualifiedName ||
    log.entityId
  );
}

export function getAuditLogDisplayInfo(log: AuditLogEntry, systemLabel: string): AuditLogDisplayInfo {
  const entityType = log.entityType ?? log.changeEvent?.entityType;
  const entityFQN =
    log.entityFQN ??
    log.changeEvent?.entityFullyQualifiedName ??
    log.changeEvent?.entity?.fullyQualifiedName;
  return {
    userName: log.userName || systemLabel,
    eventType: log.eventType ? startCase(log.eventType) : '',
    entityType,
    entityFQN,
    entityLabel: resolveEntityLabel(log, entityFQN),
    normalizedType: resolveEntityType(entityType),
    timestamp: log.eventTs,
    entityId: log.entityId ?? log.changeEvent?.entity?.id,
  };
}

export type AuditLogEntityLink =
  | { kind: 'link'; to: RouteLocationRaw; label: string }
  | { kind: 'text'; label: string };

/**
 * Typed-link table (pin `getEntityLinkFromType`, product routes):
 * the 16 wired asset types resolve through `isDetailWired`; services,
 * governance types, bots and applications have no FQN detail route
 * today and fall back to plain text — a routing-line residual.
 */
const TYPED_LINK_RESOLVERS: Record<
  string,
  (fqn: string, entityId?: string) => RouteLocationRaw | null
> = {
  role: (fqn) => roleDetailLocation(fqn),
  policy: (fqn) => policyDetailLocation(fqn),
  team: (fqn) => ({ name: 'admin-team', params: { id: fqn } }),
  persona: (fqn) => ({ name: 'admin-settings-persona-detail', params: { fqn } }),
  kpi: (fqn) => ({ name: 'insights-kpi-detail', params: { fqn } }),
  eventSubscription: (_fqn, entityId) =>
    entityId ? { name: 'observability-alert', params: { fqn: entityId } } : null,
};

export function getTypedEntityLink(
  entityFQN: string | undefined,
  normalizedType: string | undefined,
  entityLabel: string | undefined,
  entityId?: string,
): AuditLogEntityLink | null {
  if (!normalizedType || !entityFQN) {
    return null;
  }
  let to: RouteLocationRaw | null = null;
  if (isDetailWired(normalizedType)) {
    to = assetLocation(normalizedType, entityFQN);
  } else {
    const resolver = TYPED_LINK_RESOLVERS[normalizedType];
    to = resolver ? resolver(entityFQN, entityId) : null;
  }
  if (!to) {
    return null;
  }
  return { kind: 'link', to, label: entityLabel ?? entityFQN };
}

export function getUserEntityLink(
  log: AuditLogEntry,
  entityLabel: string | undefined,
): AuditLogEntityLink | null {
  const userNameForLink =
    log.changeEvent?.entity?.name ??
    log.changeEvent?.entity?.fullyQualifiedName ??
    log.userName ??
    entityLabel;
  if (!userNameForLink) {
    return null;
  }
  return {
    kind: 'link',
    to: { name: 'admin-user', params: { fqn: userNameForLink } },
    label: entityLabel ?? userNameForLink,
  };
}

/** Pin `entityLink` memo: USER first, then the typed link, then plain text. */
export function getAuditLogEntityLink(
  log: AuditLogEntry,
  info: AuditLogDisplayInfo,
): AuditLogEntityLink {
  if (info.normalizedType === 'user') {
    const userLink = getUserEntityLink(log, info.entityLabel);
    if (userLink) {
      return userLink;
    }
  }
  const typedLink = getTypedEntityLink(info.entityFQN, info.normalizedType, info.entityLabel, info.entityId);
  if (typedLink) {
    return typedLink;
  }
  return { kind: 'text', label: info.entityLabel ?? info.entityFQN ?? '--' };
}

/** Header actor link: a link when the log carries a userName, else plain text. */
export function getAuditLogHeaderUserLink(
  log: AuditLogEntry,
  info: AuditLogDisplayInfo,
): AuditLogEntityLink {
  if (log.userName) {
    return {
      kind: 'link',
      to: { name: 'admin-user', params: { fqn: log.userName } },
      label: info.userName,
    };
  }
  return { kind: 'text', label: info.userName };
}
