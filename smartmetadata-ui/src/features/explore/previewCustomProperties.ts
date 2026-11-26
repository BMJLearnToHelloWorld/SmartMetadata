/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getMetadataTypeByName } from '@/api/customProperties';
import { getDataProductByName, patchDataProduct } from '@/api/dataProducts';
import { getDomainByName, patchDomain } from '@/api/domains';
import { fetchAssetDetail, patchAsset } from '@/api/entities';
import { getGlossaryTermByFqn, patchGlossaryTerm } from '@/api/glossaryTerms';
import { updateColumnDetails } from '@/api/columns';
import { extensionPatch } from '@/governance/assetPatch';
import type { CustomPropertyDef, MetadataType } from '@/types/collaboration';
import type { SchemaRow, SearchHit } from '@/types/api';

/**
 * E-3b: pin `CustomPropertiesSection.tsx` (a3012259ca) for the Explore
 * preview's Custom Properties tab — definitions from
 * `GET /v1/metadata/types/{entityType}` (pin `fetchEntityTypeDetail` /
 * `getTypeByFQN`), values from the entity's `extension` object, search
 * by name / displayName / property-type name, per-type value summaries
 * (pin `CustomPropertyListItem` + `getPropertyValueSummary`), and save
 * via JSON PATCH on `extension` (pin `buildUpdatedExtension` →
 * `handleExtensionUpdate`; tableColumn goes through
 * `updateTableColumn`).
 */

/**
 * Pin `getTypeByFQN` takes the entity type name; the product's column
 * type is named `column` (AssetDetailView loads column definitions via
 * `listCustomProperties('column')`), so tableColumn maps to it. Every
 * other preview type passes through unchanged.
 */
export function customPropertyTypeNameFor(entityType: string): string {
  return entityType === 'tableColumn' ? 'column' : entityType;
}

/** Definitions for an entity type (pin `fetchEntityTypeDetail`). */
export async function fetchPreviewTypeDetail(entityType: string): Promise<MetadataType> {
  return getMetadataTypeByName(customPropertyTypeNameFor(entityType));
}

/**
 * The Custom Properties tab's 23 types whose `extension` does NOT come
 * from E-3a's `fetchAssetDetail`: glossaryTerm / dataProduct / domain
 * stay out of DETAIL_ENDPOINTS on purpose (their detail pages live on
 * governance routes, and adding them there would reroute
 * `detailLocationForHit` onto the generic asset route), and tableColumn
 * has no standalone API (pin uses the search-hit data as-is). Their
 * extension is fetched here, from the same by-name getters the detail
 * pages use; the other 19 types return null and keep E-3a's merged
 * entity data.
 */
export const PREVIEW_CUSTOM_PROPERTIES_EXTRA_EXTENSION_TYPES: ReadonlySet<string> = new Set([
  'dataProduct',
  'domain',
  'glossaryTerm',
  'tableColumn',
]);

export interface PreviewExtensionSource {
  id?: string;
  extension?: Record<string, unknown>;
}

export async function fetchPreviewExtensionSource(
  hit: SearchHit,
): Promise<PreviewExtensionSource | null> {
  switch (hit.entityType) {
    case 'dataProduct': {
      const product = await getDataProductByName(hit.fullyQualifiedName);
      return { id: product.id, extension: product.extension };
    }
    case 'domain': {
      const domain = await getDomainByName(hit.fullyQualifiedName);
      return { id: domain.id, extension: domain.extension };
    }
    case 'glossaryTerm': {
      const term = await getGlossaryTermByFqn(hit.fullyQualifiedName);
      return { id: term.id, extension: term.extension };
    }
    case 'tableColumn': {
      // Pin reads the column from the search hit; the product's hit
      // carries no `extension`, so the value comes from the parent
      // table's fetched columns (SchemaRow carries `extension`, mapped
      // by `mapColumns`). A missing parent FQN, a failed fetch, or a
      // column the parent does not list yields no values rather than a
      // guessed extension.
      if (!hit.tableFqn) {
        return { extension: undefined };
      }
      const parent = await fetchAssetDetail('table', hit.tableFqn);
      return { extension: findColumnExtension(parent.schemaRows, hit.fullyQualifiedName) };
    }
    default:
      return null;
  }
}

/** The column row matching `columnFqn` (recursing into STRUCT children), or undefined. */
export function findColumnExtension(
  rows: SchemaRow[],
  columnFqn: string,
): Record<string, unknown> | undefined {
  for (const row of rows) {
    if (row.fullyQualifiedName === columnFqn) {
      return row.extension;
    }
    if (row.children?.length) {
      const found = findColumnExtension(row.children, columnFqn);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Pin `CustomPropertiesSection.tsx:120-150` search: name, displayName,
 * or property-type name, case-insensitive. (The product's
 * `filterCustomProperties` in `api/customProperties.ts` covers only
 * name/displayName, so the tab filter lives here.)
 */
export function filterPreviewCustomProperties(
  defs: CustomPropertyDef[],
  searchText: string,
): CustomPropertyDef[] {
  const query = searchText.trim().toLowerCase();
  if (!query) {
    return defs;
  }
  return defs.filter(
    (def) =>
      def.name.toLowerCase().includes(query) ||
      (def.displayName ?? '').toLowerCase().includes(query) ||
      (def.propertyType ?? '').toLowerCase().includes(query),
  );
}

/**
 * Pin `isPropertyValueEmpty` (CustomPropertyCard.utils.ts): nil or an
 * empty string is empty; a table property is empty when it has no rows;
 * a hyperlink is empty without a URL; any other object value is empty
 * when it has no entries.
 */
export function isCustomPropertyValueEmpty(
  propertyType: string | undefined,
  value: unknown,
): boolean {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  if (propertyType === 'table-cp') {
    const rows = (value as { rows?: unknown[] } | undefined)?.rows;
    return !Array.isArray(rows) || rows.length === 0;
  }
  if (propertyType === 'hyperlink-cp') {
    return !(value as { url?: string } | undefined)?.url;
  }
  return (
    typeof value === 'object' &&
    (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0)
  );
}

function entityReferenceNames(value: unknown): string {
  const refs = Array.isArray(value) ? value : [value];
  return refs
    .flatMap((ref) => {
      if (!ref || typeof ref !== 'object') {
        return [];
      }
      const record = ref as Record<string, unknown>;
      const name =
        (typeof record.displayName === 'string' && record.displayName) ||
        (typeof record.name === 'string' && record.name) ||
        (typeof record.fullyQualifiedName === 'string' && record.fullyQualifiedName) ||
        '';
      return name ? [name] : [];
    })
    .join(', ');
}

export type PreviewTranslate = (key: string, params?: Record<string, string | number>) => string;

/**
 * Pin `getPropertyValueSummary` (CustomPropertyListItem.utils.ts): one
 * line of text for a property value. Entity references collapse to
 * names, enums join with commas, hyperlinks show their display text
 * (else URL), table properties show their row count, SQL properties
 * their line count; anything else renders as its plain string form.
 * Dates/timestamps render as the stored value (pin formats them; the
 * product has no shared date formatter on this surface).
 */
export function summarizeCustomPropertyValue(
  propertyType: string | undefined,
  value: unknown,
  t: PreviewTranslate,
): string {
  if (propertyType === 'table-cp') {
    const rows = (value as { rows?: unknown[] } | undefined)?.rows;
    return t('label.count-row-plural', { count: Array.isArray(rows) ? rows.length : 0 });
  }
  if (propertyType === 'sqlQuery') {
    return t('label.count-line-plural', { count: String(value).split('\n').length });
  }
  if (propertyType === 'hyperlink-cp') {
    const record = value as { url?: string; displayText?: string } | undefined;
    return record?.displayText || record?.url || '';
  }
  if (propertyType === 'entityReference' || propertyType === 'entityReferenceList') {
    return entityReferenceNames(value);
  }
  if (propertyType === 'enum') {
    return Array.isArray(value) ? value.join(', ') : String(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function resolveSavedValue(propertyTypeName: string, value: unknown): unknown {
  if (propertyTypeName === 'enum') {
    return (Array.isArray(value) ? value : [value]).filter(Boolean);
  }
  if (
    (propertyTypeName === 'integer' || propertyTypeName === 'number') &&
    value !== undefined &&
    value !== null &&
    value !== ''
  ) {
    return Number(value);
  }
  // A table's column list is always present, so only its rows say whether it holds a value.
  if (propertyTypeName === 'table-cp') {
    const rows = (value as { rows?: unknown[] } | undefined)?.rows;
    if (!rows?.length) {
      return undefined;
    }
  }
  return value;
}

function isPrunedEntry(entry: unknown): boolean {
  return (
    entry === '' ||
    entry === undefined ||
    entry === null ||
    (typeof entry === 'object' &&
      (Array.isArray(entry) ? entry.length === 0 : Object.keys(entry).length === 0))
  );
}

/**
 * Pin `buildUpdatedExtension` (CustomProperty.utils.ts): merge one
 * edited value into the extension, prune empty entries across the
 * whole extension, and return undefined when nothing is left (so the
 * PATCH clears it).
 */
export function buildUpdatedExtension(
  extension: Record<string, unknown> | undefined,
  propertyName: string,
  propertyTypeName: string,
  value: unknown,
): Record<string, unknown> | undefined {
  const next: Record<string, unknown> = {
    ...extension,
    [propertyName]: resolveSavedValue(propertyTypeName, value),
  };
  for (const key of Object.keys(next)) {
    if (isPrunedEntry(next[key])) {
      delete next[key];
    }
  }
  return Object.keys(next).length ? next : undefined;
}

/**
 * The same prune applied to a whole-record save (the edit modal emits
 * the full next extension, already typed per property): empty entries
 * are dropped, and an extension with nothing left becomes undefined.
 */
export function pruneUpdatedExtension(
  extension: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const next = { ...extension };
  for (const key of Object.keys(next)) {
    if (isPrunedEntry(next[key])) {
      delete next[key];
    }
  }
  return Object.keys(next).length ? next : undefined;
}

/**
 * Pin `handleExtensionUpdate` (EntitySummaryPanel.component.tsx): JSON
 * PATCH on `extension` through the entity's own patch endpoint
 * (domain / dataProduct / glossaryTerm each have theirs, mirroring the
 * detail pages' `onSaveCustomProperties`); tableColumn goes through
 * `updateTableColumn` (product `updateColumnDetails`, parent assumed
 * to be a table — the preview only ever carries a table parent FQN).
 * `next` is the modal's whole-record extension; `current` is the
 * extension the PATCH is diffed against.
 */
export async function patchPreviewExtension(
  hit: SearchHit,
  entityId: string | undefined,
  currentExtension: Record<string, unknown> | undefined,
  next: Record<string, unknown>,
): Promise<void> {
  const pruned = pruneUpdatedExtension(next) ?? {};
  if (hit.entityType === 'tableColumn') {
    await updateColumnDetails(hit.fullyQualifiedName, 'table', { extension: pruned });
    return;
  }
  if (!entityId) {
    throw new Error(`Cannot save custom properties without an entity id for "${hit.entityType}"`);
  }
  const ops = extensionPatch(currentExtension, pruned);
  switch (hit.entityType) {
    case 'domain':
      await patchDomain(entityId, ops);
      return;
    case 'dataProduct':
      await patchDataProduct(entityId, ops);
      return;
    case 'glossaryTerm':
      await patchGlossaryTerm(entityId, ops);
      return;
    default:
      await patchAsset(hit.entityType, entityId, ops);
  }
}
