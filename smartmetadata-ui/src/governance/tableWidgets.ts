/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { splitFqn } from '@/catalog/fqn';
import type { SchemaRow, TableConstraint } from '@/types/api';

/**
 * Table widget pure helpers (D-2 batch 5a): mapping for the three Table
 * widgets pin renders from the table payload, plus the constraint-modal
 * form mapping. Pin sources (upstream pin a3012259ca,
 * `openmetadata-ui/src/main/resources/ui/src/`):
 *
 * - `pages/TableDetailsPageV1/TableConstraints/TableConstraints.tsx:35`
 *   (render: five key types via `tableConstraintRendererBasedOnType`,
 *   ForeignKey with referred-column links; unknown types render null).
 * - `pages/TableDetailsPageV1/TableConstraints/TableConstraintsModal/TableConstraintsModal.utils.ts`
 *   (`toConstraintFormValues`) and `.component.tsx` (`handleSubmit`).
 * - `utils/TablePureUtils.ts:333` (`createTableConstraintObject`).
 * - `pages/TableDetailsPageV1/PartitionedKeys/PartitionedKeys.component.tsx:26`
 *   (columns / intervalType, `--` when missing).
 * - `pages/TableDetailsPageV1/TableAliases/TableAliases.component.tsx:51`
 *   (last FQN segment via quote-aware `Fqn.split` + `unquoteName`).
 */

export const TABLE_CONSTRAINT_TYPES = [
  'PRIMARY_KEY',
  'FOREIGN_KEY',
  'UNIQUE',
  'DIST_KEY',
  'CLUSTER_KEY',
  'SORT_KEY',
] as const;
export type TableConstraintType = (typeof TABLE_CONSTRAINT_TYPES)[number];

export const TABLE_RELATIONSHIP_TYPES = [
  'ONE_TO_ONE',
  'ONE_TO_MANY',
  'MANY_TO_ONE',
  'MANY_TO_MANY',
] as const;
export type TableRelationshipType = (typeof TABLE_RELATIONSHIP_TYPES)[number];

/** Key-constraint form fields, in pin `TABLE_CONSTRAINTS_TYPE_OPTIONS` order. */
export const KEY_CONSTRAINT_FIELDS = [
  'primaryConstraints',
  'uniqueConstraints',
  'sortConstraints',
  'distConstraints',
  'clusterConstraints',
] as const;
export type ConstraintKeyField = (typeof KEY_CONSTRAINT_FIELDS)[number];

/** Key constraint type → its form field (pin `KEY_FIELDS`). */
export const KEY_FIELD_BY_CONSTRAINT_TYPE: Record<
  Exclude<TableConstraintType, 'FOREIGN_KEY'>,
  ConstraintKeyField
> = {
  PRIMARY_KEY: 'primaryConstraints',
  UNIQUE: 'uniqueConstraints',
  SORT_KEY: 'sortConstraints',
  DIST_KEY: 'distConstraints',
  CLUSTER_KEY: 'clusterConstraints',
};

export interface ForeignConstraintFormValues {
  columns?: string;
  relationshipType?: TableRelationshipType;
  referredColumns?: string;
}

export type TableConstraintFormValues = Record<ConstraintKeyField, string[] | undefined> & {
  constraintType?: TableConstraintType;
  foreignConstraints: ForeignConstraintFormValues[];
};

export const EMPTY_FOREIGN_CONSTRAINT: ForeignConstraintFormValues = {
  columns: undefined,
  relationshipType: undefined,
  referredColumns: undefined,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function isConstraintType(value: string): value is TableConstraintType {
  return (TABLE_CONSTRAINT_TYPES as readonly string[]).includes(value);
}

function isRelationshipType(value: string): value is TableRelationshipType {
  return (TABLE_RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

/**
 * Maps the wire `tableConstraints` array, dropping items pin never
 * renders: unknown `constraintType` values (pin `TableConstraints.tsx`
 * renders null for them) and empty column lists. A foreign key keeps
 * only a valid `relationshipType`.
 */
export function mapTableConstraints(value: unknown): TableConstraint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): TableConstraint[] => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const constraintType = asString(rec.constraintType);
    if (!isConstraintType(constraintType)) {
      return [];
    }
    const columns = stringList(rec.columns);
    const referredColumns = stringList(rec.referredColumns);
    const relationshipType = asString(rec.relationshipType);
    return [
      {
        constraintType,
        columns: columns.length ? columns : undefined,
        referredColumns: referredColumns.length ? referredColumns : undefined,
        relationshipType: isRelationshipType(relationshipType) ? relationshipType : undefined,
      },
    ];
  });
}

export interface TablePartitionColumn {
  columnName: string;
  interval?: string;
  intervalType?: string;
}

/**
 * Maps the wire `tablePartition` object. Unnamed rows are dropped
 * (pin renders `columnName` as the row key; a row without one carries
 * nothing to show).
 */
export function mapTablePartition(value: unknown): { columns: TablePartitionColumn[] } | undefined {
  const rec = asRecord(value);
  const rawColumns = rec ? rec.columns : undefined;
  if (!Array.isArray(rawColumns)) {
    return undefined;
  }
  const columns = rawColumns.flatMap((item): TablePartitionColumn[] => {
    const row = asRecord(item);
    if (!row) {
      return [];
    }
    const columnName = asString(row.columnName);
    if (!columnName) {
      return [];
    }
    return [
      {
        columnName,
        interval: asString(row.interval) || undefined,
        intervalType: asString(row.intervalType) || undefined,
      },
    ];
  });
  return columns.length ? { columns } : undefined;
}

/** Maps the wire `aliases` array (FQN strings, non-empty only). */
export function mapTableAliases(value: unknown): string[] {
  return stringList(value);
}

/**
 * The display name of an alias: its last FQN segment, quote-aware
 * (pin `getAliasName`: `Fqn.split` keeps quoted dots whole,
 * `Fqn.unquoteName` strips the quotes; a malformed name falls back to
 * the raw value). The product has no `unquoteName`; a segment wrapped
 * in a matching pair of quotes is unwrapped, anything else is kept
 * verbatim.
 */
export function aliasDisplayName(fqn: string): string {
  try {
    const parts = splitFqn(fqn);
    if (parts.length === 0) {
      return fqn;
    }
    const last = parts[parts.length - 1];
    if (last.length >= 2 && last.startsWith('"') && last.endsWith('"')) {
      return last.slice(1, -1);
    }
    return last;
  } catch {
    return fqn;
  }
}

/**
 * The parent-table FQN of a referred column (`service.database.schema.table`),
 * for the foreign-key link (pin `getPartialNameFromTableFQN` with
 * `[Service, Database, Schema, Table]`). Returns undefined when the
 * value has fewer than four segments, so the cell renders plain text
 * instead of a dead link.
 */
export function referredTableFqn(referredColumn: string): string | undefined {
  const parts = splitFqn(referredColumn);
  if (parts.length < 4) {
    return undefined;
  }
  return parts.slice(0, 4).join('.');
}

/** Pin `createTableConstraintObject`: an empty column list saves as nothing. */
export function createTableConstraintObject(
  columns: string[] | undefined,
  type: TableConstraintType,
): TableConstraint[] {
  return columns?.length ? [{ columns, constraintType: type }] : [];
}

/**
 * Saved table constraints → modal form values (pin
 * `toConstraintFormValues`): the editor opens on primary keys; each
 * key type takes the first matching constraint's columns; every
 * non-key constraint becomes one foreign row (first column /
 * relationship / first referred column); with no foreign rows the form
 * still carries one empty row.
 */
export function toConstraintFormValues(
  constraints: TableConstraint[] = [],
): TableConstraintFormValues {
  const columnsOf = (type: TableConstraintType): string[] | undefined =>
    constraints.find((item) => item.constraintType === type)?.columns;
  const foreign = constraints
    .filter(
      (item) =>
        !(['PRIMARY_KEY', 'DIST_KEY', 'CLUSTER_KEY', 'SORT_KEY', 'UNIQUE'] as string[]).includes(
          item.constraintType,
        ),
    )
    .map((item) => ({
      columns: item.columns?.[0],
      relationshipType: item.relationshipType as TableRelationshipType | undefined,
      referredColumns: item.referredColumns?.[0],
    }));
  return {
    constraintType: 'PRIMARY_KEY',
    primaryConstraints: columnsOf('PRIMARY_KEY'),
    distConstraints: columnsOf('DIST_KEY'),
    clusterConstraints: columnsOf('CLUSTER_KEY'),
    sortConstraints: columnsOf('SORT_KEY'),
    uniqueConstraints: columnsOf('UNIQUE'),
    foreignConstraints: foreign.length ? foreign : [{ ...EMPTY_FOREIGN_CONSTRAINT }],
  };
}

/**
 * Modal form values → saved table constraints (pin `handleSubmit`):
 * one object per non-empty key field, then the complete foreign rows
 * only (a row missing column, relationship, or referred column is
 * dropped, not saved half-filled).
 */
export function buildTableConstraints(values: TableConstraintFormValues): TableConstraint[] {
  const foreignConstraints = values.foreignConstraints
    .filter((item) => item.columns && item.relationshipType && item.referredColumns)
    .map(
      (item): TableConstraint => ({
        columns: [item.columns as string],
        relationshipType: item.relationshipType as TableRelationshipType,
        referredColumns: [item.referredColumns as string],
        constraintType: 'FOREIGN_KEY',
      }),
    );
  return [
    ...createTableConstraintObject(values.primaryConstraints, 'PRIMARY_KEY'),
    ...createTableConstraintObject(values.distConstraints, 'DIST_KEY'),
    ...createTableConstraintObject(values.clusterConstraints, 'CLUSTER_KEY'),
    ...createTableConstraintObject(values.sortConstraints, 'SORT_KEY'),
    ...createTableConstraintObject(values.uniqueConstraints, 'UNIQUE'),
    ...foreignConstraints,
  ];
}

/**
 * Flattens the schema rows (top-level + nested STRUCT children) to the
 * column names the constraint modal offers (pin
 * `getColumnOptionsFromTableColumn`, which likewise descends into
 * children).
 */
export function flattenColumnNames(rows: SchemaRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    names.push(row.name);
    if (row.children?.length) {
      names.push(...flattenColumnNames(row.children));
    }
  }
  return names;
}
