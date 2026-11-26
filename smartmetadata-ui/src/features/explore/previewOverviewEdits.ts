/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { getDataProductByName, patchDataProduct } from '@/api/dataProducts';
import { getDomainByName, patchDomain } from '@/api/domains';
import { fetchAssetDetail, patchAsset } from '@/api/entities';
import { getGlossaryTermByFqn, patchGlossaryTerm } from '@/api/glossaryTerms';
import { updateColumnDetails } from '@/api/columns';
import { isDetailWired } from '@/catalog/entityRoutes';
import {
  dataProductsPatch,
  descriptionPatch,
  domainsPatch,
  ownersPatch,
  tagsPatch,
  toTagLabel,
  type TagLabelInput,
} from '@/governance/assetPatch';
import { setFieldPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import type { EntityRef, SchemaRow, SearchHit, TagRef } from '@/types/api';

/**
 * E-3c: pin `DataAssetSummaryPanelV1.tsx` (a3012259ca) Overview-section
 * edits for the Explore preview. Every section PATCHes through the
 * entity's own patch endpoint and reports failure to the caller — the
 * widget cells keep their editor open on a thrown save, so a handler
 * here must never swallow a failure.
 *
 * Save routing mirrors E-3b's `patchPreviewExtension`: the 19
 * DETAIL_ENDPOINTS types go through `patchAsset`; domain / dataProduct /
 * glossaryTerm through their own patch APIs; tableColumn through
 * `updateTableColumn` (product `updateColumnDetails`, parent assumed to
 * be a table — the preview only ever carries a table parent FQN).
 * Pin's per-section save sites: description PATCHes inside
 * `DataAssetSummaryPanelV1.handleDescriptionUpdate` (`:261-321`,
 * `/description` replace/add, tableColumn via `updateTableColumn`);
 * owners/tags/glossary PATCH in `EntitySummaryPanel.handleOwnerUpdate` /
 * `handleTagsUpdate` / `handleGlossaryTermsUpdate` (tableColumn via
 * `updateTableColumn`); domains PATCH inside `DomainsSection`
 * (`handleDomainSave`, re-fetches the entity and diffs `domains`);
 * tier PATCHes inside `TierSection` (`updateEntityField` on `tags`,
 * tier label dropped/appended — the product's `WidgetTierCell` hands
 * the caller that same full list, so the tier save IS the tags save);
 * data products PATCH inside `DataProductsSection`
 * (`updateEntityField` on `dataProducts`).
 */

/** Governance types outside DETAIL_ENDPOINTS with their own patch API. */
export const PREVIEW_OVERVIEW_GOVERNANCE_EDIT_TYPES: ReadonlySet<string> = new Set([
  'domain',
  'dataProduct',
  'glossaryTerm',
]);

/**
 * Types the Overview can save for: a DETAIL_ENDPOINTS type (patchAsset),
 * a governance type (its own patch API), or a table column
 * (updateColumnDetails). Everything else (tag, testSuite, services,
 * user/team, page, …) has no patch endpoint wired in the product, so
 * its sections stay read-only — pin's `canEditSummary` gate
 * (`summaryEntityType === entityType`) is the same idea for extension
 * entities with mapped layouts.
 */
export function hasPreviewOverviewSavePath(entityType: string): boolean {
  return (
    isDetailWired(entityType) ||
    PREVIEW_OVERVIEW_GOVERNANCE_EDIT_TYPES.has(entityType) ||
    entityType === 'tableColumn'
  );
}

export interface PreviewOverviewEditFlags {
  /** P1 dual line (`isAdminUser` from the permission store). */
  isAdmin: boolean;
  /** Named `canEditDescription` flag (detail pages gate description bare). */
  canEditDescription: boolean;
  /** Named `canEditDisplayName` flag. */
  canEditDisplayName: boolean;
  /** Named `canEditAll` flag (detail pages gate data products on it). */
  canEditAll: boolean;
  /** Prioritized field check (`useEntityPermissions().can`). */
  can: (operation: string) => boolean;
}

export interface PreviewOverviewEditAccess {
  description: boolean;
  owners: boolean;
  domains: boolean;
  tier: boolean;
  glossaryTerms: boolean;
  tags: boolean;
  dataProducts: boolean;
  displayName: boolean;
}

/**
 * Per-section gates. The permission keys are the detail pages'
 * (D-2 batch 2 widget-cell gates, `isAdminUser ||` on top — except
 * description, which AssetDetailView gates bare on
 * `canEditDescription`): owners `EditOwners`, domains `EditDomains`,
 * tier `EditTier`, glossary `EditGlossaryTerms`, tags `EditTags`,
 * data products `EditAll`, display name `EditDisplayName`.
 *
 * Pin differences, kept deliberately: pin gates domains on `canEditAll`
 * (`DataAssetSummaryPanelV1.tsx:199-206`) while the product detail
 * pages gate on `canEditDomains` — the preview follows the detail
 * pages. Columns inherit owners, domains, tier and data products from
 * their parent table, so those four are never editable on a column
 * (`:490-493`); description and tags are (`:199-206`, `:261-321`).
 * A domain has no `domains` field and no `dataProducts` field, and a
 * glossary term has no `dataProducts` field, so those cells stay
 * read-only there (the section still renders, as in pin's common
 * layout).
 */
export function previewOverviewEditAccess(
  entityType: string,
  flags: PreviewOverviewEditFlags,
): PreviewOverviewEditAccess {
  const canSave = hasPreviewOverviewSavePath(entityType);
  const isColumn = entityType === 'tableColumn';
  const orAdmin = (flag: boolean): boolean => flags.isAdmin || flag;
  return {
    description: canSave && flags.canEditDescription,
    owners: canSave && !isColumn && orAdmin(flags.can('EditOwners')),
    domains:
      canSave && !isColumn && entityType !== 'domain' && orAdmin(flags.can('EditDomains')),
    tier: canSave && !isColumn && orAdmin(flags.can('EditTier')),
    glossaryTerms: canSave && orAdmin(flags.can('EditGlossaryTerms')),
    tags: canSave && orAdmin(flags.can('EditTags')),
    dataProducts:
      canSave &&
      !isColumn &&
      entityType !== 'domain' &&
      entityType !== 'glossaryTerm' &&
      orAdmin(flags.canEditAll),
    displayName: canSave && orAdmin(flags.canEditDisplayName),
  };
}

/**
 * One field's JSON PATCH through the entity's own endpoint. Domain /
 * dataProduct / glossaryTerm each have theirs (mirroring the detail
 * pages and E-3b's `patchPreviewExtension`); everything else with a
 * save path goes through `patchAsset`, which throws for a type with no
 * patch endpoint — the caller gates on `hasPreviewOverviewSavePath`
 * first, so a throw here is a real regression, not a user error.
 */
export async function patchPreviewOverviewEntity(
  hit: SearchHit,
  entityId: string | undefined,
  ops: JsonPatchOp[],
): Promise<void> {
  if (!entityId) {
    throw new Error(`Cannot save ${hit.entityType} without an entity id`);
  }
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

/** Pin `handleDescriptionUpdate`: `/description` replace/add, tableColumn via `updateTableColumn`. */
export async function savePreviewDescription(
  hit: SearchHit,
  entityId: string | undefined,
  currentDescription: string | undefined,
  nextDescription: string,
): Promise<void> {
  if (hit.entityType === 'tableColumn') {
    await updateColumnDetails(hit.fullyQualifiedName, 'table', { description: nextDescription });
    return;
  }
  await patchPreviewOverviewEntity(
    hit,
    entityId,
    descriptionPatch(currentDescription, nextDescription),
  );
}

/**
 * Pin `handleTagsUpdate` / `handleGlossaryTermsUpdate` /
 * `handleTierUpdate` (the tier cell hands over the full list with the
 * tier label already dropped/appended): whole-`tags` PATCH, tableColumn
 * via `updateTableColumn`.
 */
export async function savePreviewTags(
  hit: SearchHit,
  entityId: string | undefined,
  currentTags: TagRef[] | undefined,
  nextTags: TagLabelInput[],
): Promise<void> {
  if (hit.entityType === 'tableColumn') {
    await updateColumnDetails(hit.fullyQualifiedName, 'table', {
      tags: nextTags.map(toTagLabel),
    });
    return;
  }
  await patchPreviewOverviewEntity(hit, entityId, tagsPatch(currentTags, nextTags));
}

/** Pin `handleOwnerUpdate`: whole-`owners` PATCH (columns inherit — never called for them). */
export async function savePreviewOwners(
  hit: SearchHit,
  entityId: string | undefined,
  currentOwners: EntityRef[] | undefined,
  nextOwners: Array<{ id: string; type: 'user' | 'team' }>,
): Promise<void> {
  await patchPreviewOverviewEntity(hit, entityId, ownersPatch(currentOwners, nextOwners));
}

/** Pin `DomainsSection.handleDomainSave`: whole-`domains` PATCH (columns inherit — never called for them). */
export async function savePreviewDomains(
  hit: SearchHit,
  entityId: string | undefined,
  currentDomains: EntityRef[] | undefined,
  nextDomainIds: string[],
): Promise<void> {
  await patchPreviewOverviewEntity(hit, entityId, domainsPatch(currentDomains, nextDomainIds));
}

/**
 * Pin `DataProductsSection`: whole-`dataProducts` PATCH. The cell emits
 * EntityRefs; a stored ref without a type is a data product in this
 * cell's context, and a ref without an id cannot be written at all
 * (same mapping as AssetDetailView `onDataProductsChange`).
 */
export async function savePreviewDataProducts(
  hit: SearchHit,
  entityId: string | undefined,
  currentProducts: EntityRef[] | undefined,
  nextProducts: EntityRef[],
): Promise<void> {
  const refs = nextProducts.flatMap((product) =>
    product.id ? [{ id: product.id, type: product.type ?? 'dataProduct' }] : [],
  );
  await patchPreviewOverviewEntity(
    hit,
    entityId,
    dataProductsPatch(currentProducts, refs),
  );
}

/**
 * Pin `EntityTitleSection.tsx:187,206` (`edit-displayName-button` +
 * `EntityNameModal` `onSave`): the display name edits inline. Pin's
 * Explore panel only writes it to local panel state
 * (`EntitySummaryPanel.handleDisplayNameUpdate` → `updateEntityData`,
 * with neither `onEntityUpdate` nor `afterEntityUpdate` wired by
 * ExploreV1) — the edit silently vanishes on the next fetch. The
 * product persists it instead (the detail pages' `setFieldPatch`
 * `/displayName` shape, e.g. PolicyDetailView `onEditDisplayName`),
 * tableColumn via `updateColumnDetails`.
 */
export async function savePreviewDisplayName(
  hit: SearchHit,
  entityId: string | undefined,
  currentDisplayName: string | undefined,
  nextDisplayName: string,
): Promise<void> {
  if (hit.entityType === 'tableColumn') {
    await updateColumnDetails(hit.fullyQualifiedName, 'table', { displayName: nextDisplayName });
    return;
  }
  await patchPreviewOverviewEntity(
    hit,
    entityId,
    setFieldPatch('/displayName', currentDisplayName, nextDisplayName),
  );
}

/** The column row matching `columnFqn` (recursing into STRUCT children), or undefined. */
export function findPreviewColumnRow(
  rows: SchemaRow[],
  columnFqn: string,
): SchemaRow | undefined {
  for (const row of rows) {
    if (row.fullyQualifiedName === columnFqn) {
      return row;
    }
    if (row.children?.length) {
      const found = findPreviewColumnRow(row.children, columnFqn);
      if (found) {
        return found;
      }
    }
  }
  return undefined;
}

/**
 * Fields a post-save refresh can return for a hit whose Overview does
 * NOT come from E-3a's `fetchAssetDetail` (domain / dataProduct /
 * glossaryTerm / tableColumn). DETAIL_ENDPOINTS types return null —
 * their refetch is the existing `detailRefresh` watcher.
 */
export interface PreviewOverviewRefresh {
  id?: string;
  displayName?: string;
  description?: string;
  owners?: EntityRef[];
  domains?: EntityRef[];
  tags?: TagRef[];
  dataProducts?: EntityRef[];
}

/**
 * Post-save read-back for the four non-endpoint types, from the same
 * by-name getters the detail pages (and E-3b's extension fetch) use.
 * A failed read returns null rather than throwing — the save already
 * succeeded, and the merged view keeps the pre-save values instead of
 * surfacing a read error as a save failure.
 */
export async function fetchPreviewOverviewRefresh(
  hit: SearchHit,
): Promise<PreviewOverviewRefresh | null> {
  try {
    switch (hit.entityType) {
      case 'domain': {
        const domain = await getDomainByName(hit.fullyQualifiedName);
        return {
          id: domain.id,
          displayName: domain.displayName,
          description: domain.description,
          owners: domain.owners,
          tags: domain.tags,
        };
      }
      case 'dataProduct': {
        const product = await getDataProductByName(hit.fullyQualifiedName);
        return {
          id: product.id,
          displayName: product.displayName,
          description: product.description,
          owners: product.owners,
          domains: product.domains,
          tags: product.tags,
        };
      }
      case 'glossaryTerm': {
        const term = await getGlossaryTermByFqn(hit.fullyQualifiedName);
        return {
          id: term.id,
          displayName: term.displayName,
          description: term.description,
          owners: term.owners,
          domains: term.domains,
          tags: term.tags,
        };
      }
      case 'tableColumn': {
        if (!hit.tableFqn) {
          return null;
        }
        const parent = await fetchAssetDetail('table', hit.tableFqn);
        const row = findPreviewColumnRow(parent.schemaRows, hit.fullyQualifiedName);
        if (!row) {
          return null;
        }
        return { displayName: row.displayName, description: row.description, tags: row.tags };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
