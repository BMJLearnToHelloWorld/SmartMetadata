/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */
import type { CsvHeaderDocumentation } from '@/api/csvImport';
import type { Metric } from '@/api/metrics';
import type { EntityRef } from '@/types/api';

/**
 * Metric bulk-edit CSV helpers (official utils/CSV/CSV.utils.tsx:
 * METRIC_CSV_VALUE_BY_COLUMN + getMetricCsvRowsFromMetrics, and
 * CSVUtilsClassBase owner/glossary editors).
 *
 * Encodings, verbatim from official:
 * - owners/reviewers: `type:name` entries joined by ';' (CSV_FIELD_SEPARATOR
 *   ';', CSV_ENTITY_TYPE_SEPARATOR ':'); the owner editor splits on ';'
 *   then on the first ':'.
 * - entity references (domains, dataProducts, relatedMetrics, experts,
 *   parent, metricGroup): fullyQualifiedName values joined by ';'.
 * - tags: tagFQN values joined by ';'; glossaryTerms keeps only
 *   Glossary-source tags, tags keeps only Classification-source tags
 *   (official joinMetricTags filters by TagSource; tiers are a separate
 *   Classification-tag subset and are NOT reconstructed here — the
 *   documentation headers drive which columns exist, and tiers are
 *   edited as plain text when present).
 * - extension: `key=value` pairs joined by ';' (official
 *   formatMetricExtension); unparseable pairs survive as plain text.
 */

export function ownersToCell(owners: EntityRef[] | undefined): string {
  if (!owners?.length) {
    return '';
  }
  return owners
    .map((owner) => [owner.type, owner.name].filter(Boolean).join(':'))
    .filter(Boolean)
    .join(';');
}

export function ownersFromCell(value: string): Array<{ type: string; name: string }> {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const sep = part.indexOf(':');
      return sep >= 0
        ? { type: part.slice(0, sep), name: part.slice(sep + 1) }
        : { type: '', name: part };
    })
    .filter((owner) => owner.name.length > 0);
}

export function refsToCell(refs: EntityRef[] | undefined): string {
  if (!refs?.length) {
    return '';
  }
  return refs
    .map((ref) => ref.fullyQualifiedName ?? ref.name)
    .filter(Boolean)
    .join(';');
}

export function fqnListFromCell(value: string): string[] {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function tagsToCell(
  metric: Metric,
  source: 'Classification' | 'Glossary',
): string {
  return (metric.tags ?? [])
    .filter((tag) => tag.source === source)
    .map((tag) => tag.tagFQN)
    .filter(Boolean)
    .join(';');
}

export function extensionToCell(extension: Record<string, unknown> | undefined): string {
  if (!extension) {
    return '';
  }
  return Object.entries(extension)
    .map(([key, val]) => `${key}=${String(val)}`)
    .join(';');
}

/**
 * The metric CSV value for one documentation header, mirroring official's
 * METRIC_CSV_VALUE_BY_COLUMN. Unknown columns yield '' — and callers must
 * NOT drop unknown columns from the round-trip, because bulk edit posts
 * every column back and a missing column would be sent empty (official
 * comment on getMetricCsvRowsFromMetrics: a missing column clears it).
 */
export function metricCsvValue(metric: Metric, headerName: string): string {
  switch (headerName) {
    case 'name':
      return metric.name;
    case 'displayName':
      return metric.displayName ?? '';
    case 'description':
      return metric.description ?? '';
    case 'metricType':
      return metric.metricType ?? '';
    case 'unitOfMeasurement':
      return metric.unitOfMeasurement ?? '';
    case 'customUnitOfMeasurement':
      return metric.customUnitOfMeasurement ?? '';
    case 'granularity':
      return metric.granularity ?? '';
    case 'expressionLanguage':
      return metric.expressionLanguage ?? '';
    case 'expressionCode':
      return metric.expressionCode ?? '';
    case 'relatedMetrics':
      return refsToCell(metric.relatedMetrics);
    case 'tags':
      return tagsToCell(metric, 'Classification');
    case 'glossaryTerms':
      return tagsToCell(metric, 'Glossary');
    case 'owners':
      return ownersToCell(metric.owners);
    case 'reviewers':
      return ownersToCell(metric.reviewers);
    case 'domains':
      return refsToCell(metric.domains);
    case 'dataProducts':
      return refsToCell(metric.dataProducts);
    case 'entityStatus':
      return metric.entityStatus ?? '';
    case 'extension':
      return extensionToCell(metric.extension);
    case 'parent':
      return metric.parent?.fullyQualifiedName ?? '';
    case 'experts':
      return refsToCell(metric.experts);
    case 'metricGroup':
      return metric.metricGroup?.fullyQualifiedName ?? '';
    default:
      return '';
  }
}

export function metricToCsvRow(metric: Metric, headers: CsvHeaderDocumentation[]): string[] {
  return headers.map((header) => metricCsvValue(metric, header.name));
}

/** Rows whose cells differ from the loaded snapshot, by row index. */
export function changedRowIndices(initial: string[][], current: string[][]): number[] {
  const changed: number[] = [];
  current.forEach((row, index) => {
    const before = initial[index];
    if (!before || before.length !== row.length || before.some((cell, col) => cell !== row[col])) {
      changed.push(index);
    }
  });
  return changed;
}

/** Leaf column name: official editors key on the last segment (column.name*). */
export function csvColumnLeaf(header: string): string {
  const parts = header.split('.');
  return parts[parts.length - 1] ?? header;
}
