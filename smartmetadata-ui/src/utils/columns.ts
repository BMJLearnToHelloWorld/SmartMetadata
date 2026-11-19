/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityListColumn } from '@/features/crud/types';

/**
 * Shared list-column builders (PAT-COLUMNS, 00-systemic D10).
 *
 * Ported from official `utils/TableColumn.util.tsx`
 * (`descriptionTableObject`), `pages/RolesPage/RolesListPage/` and
 * `pages/PoliciesPage/PoliciesListPage/` (name link cells, reference
 * lists, permission-degraded tooltips) at pin a3012259ca, and
 * `components/Settings/Bot/BotListV1/` (the Actions-column tooltip
 * exception). Builders return one-element column arrays, mirroring the
 * official `ColumnsType` arrays; overrides spread last, so a caller
 * override (e.g. `width`) wins exactly like official `...args`.
 *
 * Rendering lives in the companion cell components
 * (`DescriptionCell.vue`, `EntityNameLink.vue`, `ReferenceListCell.vue`)
 * used from the table `bodyCell` slot keyed by column key — the
 * product's list pattern (`EntityListShell` + `SmTable`).
 *
 * Held (not in this batch's enumeration): `ownerTableObject`,
 * `domainTableObject`, `dataProductTableObject`, `tagTableObject`,
 * `tierTableObject`, `certificationTableObject` — each needs its viewer
 * component (Owner / DomainLabel / TagsViewer equivalents), which do
 * not exist as shared product components yet.
 */

/** Official `LIST_CAP` (`utils/PermissionsUtils.ts`): visible references before `+N more`. */
export const LIST_CAP = 1;

/** Official empty reference-list cell (`RolesListPage.tsx` / `PoliciesListPage.tsx`). */
export const EMPTY_REFERENCE_LIST_TEXT = '-- ';

export interface ColumnEntityReference {
  displayName?: string;
  fullyQualifiedName?: string;
  name?: string;
}

export interface SplitReferenceList<T> {
  visible: T[];
  overflow: T[];
  hasMore: boolean;
  overflowCount: number;
  isEmpty: boolean;
}

/** Splits a reference list into the visible prefix and the popover remainder. */
export function splitReferenceList<T>(
  references: readonly T[] | undefined | null,
): SplitReferenceList<T> {
  const list = references ?? [];
  return {
    visible: list.slice(0, LIST_CAP),
    overflow: list.slice(LIST_CAP),
    hasMore: list.length > LIST_CAP,
    overflowCount: list.length - LIST_CAP,
    isEmpty: list.length === 0,
  };
}

export interface TooltipTitleRule {
  matches: boolean;
  title: string;
}

/**
 * First matching rule wins, else the fallback. This table form is what
 * lets the Bot list's three-state Actions tooltip (system bot /
 * admin-only / Delete) share the helper with the two-state COL-4
 * pattern instead of hardcoding either vocabulary.
 */
export function resolveTooltipTitle(
  rules: readonly TooltipTitleRule[],
  fallback: string,
): string {
  return rules.find((rule) => rule.matches)?.title ?? fallback;
}

/** COL-4 two-state form: permitted title when allowed, denied title otherwise. */
export function actionTooltipTitle(
  hasPermission: boolean,
  permittedTitle: string,
  deniedTitle: string,
): string {
  return resolveTooltipTitle([{ matches: hasPermission, title: permittedTitle }], deniedTitle);
}

/**
 * Description column (official `descriptionTableObject`: title
 * `label.description`, `dataIndex`/`key` `description`, no width).
 * The caller passes the already-translated title, as every product
 * list page computes its column titles with `t()`.
 */
export function descriptionColumnDef(
  title: string,
  overrides: Partial<EntityListColumn> = {},
): EntityListColumn[] {
  return [{ title, dataIndex: 'description', key: 'description', ...overrides }];
}

/**
 * Name link column (official Roles/Policies name columns: `dataIndex`/
 * `key` `name`, width 200). Pages whose official name column differs
 * (e.g. Bots: `displayName` key) pass the difference as overrides.
 */
export function entityNameColumnDef(
  title: string,
  overrides: Partial<EntityListColumn> = {},
): EntityListColumn[] {
  return [{ title, dataIndex: 'name', key: 'name', width: 200, ...overrides }];
}

/**
 * Reference-list column (official Roles Policies / Policies Roles
 * columns: width 250, `dataIndex`/`key` = the reference field).
 */
export function referenceListColumnDef(
  title: string,
  fieldKey: string,
  overrides: Partial<EntityListColumn> = {},
): EntityListColumn[] {
  return [{ title, dataIndex: fieldKey, key: fieldKey, width: 250, ...overrides }];
}
