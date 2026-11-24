/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { EMPTY_QUERY_FILTER_STRINGS } from './curatedAssets';

/**
 * Advanced-search QueryBuilder tree, ported from the official framework
 * (openmetadata-ui `AdvanceSearchProvider` + `AdvanceSearchModal` +
 * `AdvancedSearchClassBase`, pin a3012259ca).
 *
 * The official builder is `@react-awesome-query-builder/ui` (React), which
 * cannot run in this Vue console, so the tree is this console's own model
 * with the same semantics: nested groups, an editable AND/OR conjunction
 * per group (`conjunctionMode="editable"`, `groupMode="nested"` in the
 * official modal), per-field-type operators, an ES `query_filter` JSON
 * output (`elasticSearchFormat`) and a readable SQL rendering
 * (`QbUtils.sqlFormat`). Field definitions live in
 * `catalog/advancedSearchFields.ts`; this module only consumes them.
 */
export type QueryConjunction = 'AND' | 'OR';

export type QueryFieldType = 'text' | 'select' | 'multiselect' | 'number' | 'date' | 'boolean';

export type QueryOperator =
  | 'equal'
  | 'not_equal'
  | 'like'
  | 'not_like'
  | 'regexp'
  | 'match_phrase'
  | 'not_match_phrase'
  | 'is_null'
  | 'is_not_null'
  | 'between'
  | 'not_between'
  | 'select_equals'
  | 'select_not_equals'
  | 'select_any_in'
  | 'select_not_any_in'
  | 'multiselect_contains'
  | 'multiselect_not_contains'
  | 'multiselect_equals'
  | 'multiselect_not_equals';

/** `null` is an unfinished value (no value picked yet). A `between` pair holds numbers, or date strings (`YYYY-MM-DD`) for date fields; either bound may be `null` while the user is still filling the range in. */
export type QueryValue = string | string[] | number | [number | null, number | null] | [string | null, string | null] | boolean | null;

export interface QueryRule {
  kind: 'rule';
  field: string;
  operator: QueryOperator;
  value: QueryValue;
}

export interface QueryGroup {
  kind: 'group';
  conjunction: QueryConjunction;
  children: QueryNode[];
}

export type QueryNode = QueryRule | QueryGroup;

export interface QueryFieldOption {
  value: string;
  label: string;
  /** i18n key for the label; the plain `label` is the fallback. */
  labelKey?: string;
}

export interface QueryBuilderFieldDef {
  /** ES field key, e.g. `ownerDisplayName`; extension fields are `extension.<entityType>.<esField>`. */
  key: string;
  /** i18n key for the field label; server-driven labels use `label` instead. */
  labelKey?: string;
  /** Plain label for server-driven (custom-property) fields. */
  label?: string;
  type: QueryFieldType;
  operators: QueryOperator[];
  /** Fixed options (pin `fieldSettings.listValues`); absent means async aggregate options. */
  listValues?: QueryFieldOption[];
  /** Aggregate field for value options; defaults to the ES field. */
  aggregateField?: string;
  /** Custom-property entity type; only set on `extension.*` fields. */
  entityType?: string;
  /** Real ES field for `extension.*` fields. */
  esField?: string;
  /** i18n key of the option group the field belongs to (extension fields). */
  optGroupKey?: string;
}

/**
 * Official operator sets (`constants/AdvancedSearch.constants.ts`).
 */
export const TEXT_FIELD_OPERATORS: readonly QueryOperator[] = [
  'equal',
  'not_equal',
  'like',
  'not_like',
  'is_null',
  'is_not_null',
];

export const TEXT_DESCRIPTION_OPERATORS: readonly QueryOperator[] = [
  'match_phrase',
  'not_match_phrase',
  'is_null',
  'is_not_null',
];

export const MULTISELECT_FIELD_OPERATORS: readonly QueryOperator[] = [
  'multiselect_contains',
  'multiselect_not_contains',
  'multiselect_equals',
  'multiselect_not_equals',
  'is_null',
  'is_not_null',
];

export const NUMBER_FIELD_OPERATORS: readonly QueryOperator[] = [
  'equal',
  'not_equal',
  'between',
  'not_between',
  'is_null',
  'is_not_null',
];

export const LIST_VALUE_OPERATORS: readonly QueryOperator[] = ['select_equals', 'select_not_equals'];

export const NULL_CHECK_OPERATORS: readonly QueryOperator[] = ['is_null', 'is_not_null'];

/** Official default select operators (the name/displayName selects add like/not_like/regexp). */
export const SELECT_FIELD_OPERATORS: readonly QueryOperator[] = [
  'select_equals',
  'select_not_equals',
  'select_any_in',
  'select_not_any_in',
];

/** Official displayName/name selects: default select operators + text search. */
export const NAME_FIELD_OPERATORS: readonly QueryOperator[] = [
  'select_equals',
  'select_not_equals',
  'select_any_in',
  'select_not_any_in',
  'like',
  'not_like',
  'regexp',
];

export const BOOLEAN_FIELD_OPERATORS: readonly QueryOperator[] = ['equal', 'not_equal'];

const NULL_CHECK_OPERATOR_SET = new Set<QueryOperator>(['is_null', 'is_not_null']);

export function emptyQueryGroup(): QueryGroup {
  return { kind: 'group', conjunction: 'AND', children: [] };
}

export function createQueryRule(field: QueryBuilderFieldDef): QueryRule {
  const operator = field.operators[0] ?? 'equal';
  return { kind: 'rule', field: field.key, operator, value: defaultRuleValue(field, operator) };
}

export function defaultRuleValue(field: QueryBuilderFieldDef, operator: QueryOperator): QueryValue {
  if (NULL_CHECK_OPERATOR_SET.has(operator)) {
    return null;
  }
  if (operator === 'between' || operator === 'not_between') {
    return null;
  }
  if (
    operator === 'select_any_in' ||
    operator === 'select_not_any_in' ||
    operator === 'multiselect_contains' ||
    operator === 'multiselect_not_contains' ||
    operator === 'multiselect_equals' ||
    operator === 'multiselect_not_equals'
  ) {
    return [];
  }
  if (field.type === 'boolean') {
    return true;
  }
  if (field.type === 'number') {
    return null;
  }
  return '';
}

export function fieldLabel(field: QueryBuilderFieldDef, translate: (key: string) => string): string {
  if (field.label !== undefined) {
    return field.label;
  }
  return field.labelKey ? translate(field.labelKey) : field.key;
}

export function findFieldDef(
  fields: readonly QueryBuilderFieldDef[],
  key: string,
): QueryBuilderFieldDef | undefined {
  return fields.find((field) => field.key === key);
}

/** The ES field a rule constrains (`esField` for extension fields, else the key). */
export function ruleEsField(field: QueryBuilderFieldDef): string {
  return field.esField ?? field.key;
}

export function isRuleComplete(rule: QueryRule, field?: QueryBuilderFieldDef): boolean {
  if (!field || !field.operators.includes(rule.operator)) {
    return false;
  }
  if (NULL_CHECK_OPERATOR_SET.has(rule.operator)) {
    return true;
  }
  const value = rule.value;
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (Array.isArray(value)) {
    if (rule.operator === 'between' || rule.operator === 'not_between') {
      // Number bounds, or date bounds as `YYYY-MM-DD` strings.
      return (
        value.length === 2 &&
        value.every(
          (item) =>
            (typeof item === 'number' && Number.isFinite(item)) ||
            (typeof item === 'string' && item.trim().length > 0),
        )
      );
    }
    return value.length > 0 && value.every((item) => typeof item === 'string' && item.trim().length > 0);
  }
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  return true;
}

export function isTreeComplete(node: QueryNode, fields: readonly QueryBuilderFieldDef[]): boolean {
  if (node.kind === 'rule') {
    return isRuleComplete(node, findFieldDef(fields, node.field));
  }
  if (node.children.length === 0) {
    return false;
  }
  return node.children.every((child) => isTreeComplete(child, fields));
}

/**
 * Drops rules whose field (or operator) is not in the current tab's field
 * set and rules left unfinished, and drops groups emptied by that —
 * the pin `QbUtils.checkTree` / `sanitizeTree` analogue. Returns null when
 * nothing survives.
 */
export function sanitizeTree(node: QueryNode, fields: readonly QueryBuilderFieldDef[]): QueryNode | null {
  if (node.kind === 'rule') {
    const field = findFieldDef(fields, node.field);
    return field && isRuleComplete(node, field) ? { ...node } : null;
  }
  const children: QueryNode[] = [];
  for (const child of node.children) {
    const sanitized = sanitizeTree(child, fields);
    if (sanitized) {
      children.push(sanitized);
    }
  }
  return children.length ? { kind: 'group', conjunction: node.conjunction, children } : null;
}

function sqlQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function sqlValue(value: QueryValue): string {
  if (typeof value === 'number') {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (Array.isArray(value)) {
    // Partial between pairs never reach here (sqlRule handles between
    // separately, and sqlFormat sanitizes first); `NULL` only guards the type.
    return `(${value.map((item) => (typeof item === 'number' ? String(item) : item === null ? 'NULL' : sqlQuote(item))).join(', ')})`;
  }
  return sqlQuote(value ?? '');
}

function sqlOperatorPhrase(operator: QueryOperator): string {
  switch (operator) {
    case 'equal':
    case 'select_equals':
      return '=';
    case 'not_equal':
    case 'select_not_equals':
      return '<>';
    case 'like':
      return 'LIKE';
    case 'not_like':
      return 'NOT LIKE';
    case 'regexp':
      return 'REGEXP';
    case 'match_phrase':
      return 'CONTAINS';
    case 'not_match_phrase':
      return 'NOT CONTAINS';
    case 'is_null':
      return 'IS NULL';
    case 'is_not_null':
      return 'IS NOT NULL';
    case 'between':
      return 'BETWEEN';
    case 'not_between':
      return 'NOT BETWEEN';
    case 'select_any_in':
    case 'multiselect_contains':
    case 'multiselect_equals':
      return 'IN';
    case 'select_not_any_in':
    case 'multiselect_not_contains':
    case 'multiselect_not_equals':
      return 'NOT IN';
  }
}

function sqlRule(rule: QueryRule, fields: readonly QueryBuilderFieldDef[]): string {
  const field = findFieldDef(fields, rule.field);
  if (!field) {
    return '';
  }
  const esField = ruleEsField(field);
  if (rule.operator === 'is_null' || rule.operator === 'is_not_null') {
    return `${esField} ${sqlOperatorPhrase(rule.operator)}`;
  }
  if (rule.operator === 'between' || rule.operator === 'not_between') {
    const pair = rule.value as [number | string | null, number | string | null];
    // `sqlFormat` sanitizes first, so both bounds are present here; the
    // guard only keeps the type checker honest about partial pairs.
    if (pair[0] === null || pair[1] === null) {
      return '';
    }
    const formatBound = (bound: number | string): string =>
      typeof bound === 'number' ? String(bound) : sqlQuote(bound);
    return `${esField} ${sqlOperatorPhrase(rule.operator)} ${formatBound(pair[0])} AND ${formatBound(pair[1])}`;
  }
  if (rule.operator === 'like' || rule.operator === 'not_like') {
    return `${esField} ${sqlOperatorPhrase(rule.operator)} ${sqlQuote(`%${String(rule.value)}%`)}`;
  }
  return `${esField} ${sqlOperatorPhrase(rule.operator)} ${sqlValue(rule.value)}`;
}

/**
 * Readable SQL text for the applied filter — the pin `QbUtils.sqlFormat`
 * analogue. Empty for an empty or invalid tree.
 */
export function sqlFormat(node: QueryNode, fields: readonly QueryBuilderFieldDef[]): string {
  const sanitized = sanitizeTree(node, fields);
  if (!sanitized) {
    return '';
  }
  return sqlNode(sanitized, fields, true);
}

function sqlNode(node: QueryNode, fields: readonly QueryBuilderFieldDef[], isRoot: boolean): string {
  if (node.kind === 'rule') {
    return sqlRule(node, fields);
  }
  const parts = node.children.map((child) => sqlNode(child, fields, false)).filter(Boolean);
  if (!parts.length) {
    return '';
  }
  const joined = parts.join(` ${node.conjunction} `);
  return parts.length > 1 && !isRoot ? `(${joined})` : joined;
}

type EsClause = Record<string, unknown>;

function wrapNot(clause: EsClause): EsClause {
  return { bool: { must_not: clause } };
}

function esLeafClause(
  field: QueryBuilderFieldDef,
  operator: QueryOperator,
  value: QueryValue,
): EsClause | undefined {
  const esField = ruleEsField(field);
  switch (operator) {
    case 'equal':
      return { term: { [esField]: value } };
    case 'not_equal':
      return wrapNot({ term: { [esField]: value } });
    case 'like':
      return { wildcard: { [esField]: { value: `*${String(value)}*` } } };
    case 'not_like':
      return wrapNot({ wildcard: { [esField]: { value: `*${String(value)}*` } } });
    case 'regexp':
      return { regexp: { [esField]: { value: String(value), case_insensitive: true } } };
    case 'match_phrase':
      return { match_phrase: { [esField]: value } };
    case 'not_match_phrase':
      return wrapNot({ match_phrase: { [esField]: value } });
    case 'is_null':
      return { bool: { must_not: { exists: { field: esField } } } };
    case 'is_not_null':
      return { exists: { field: esField } };
    case 'between': {
      const pair = value as [number | string | null, number | string | null];
      return pair[0] === null || pair[1] === null
        ? undefined
        : { range: { [esField]: { gte: pair[0], lte: pair[1] } } };
    }
    case 'not_between': {
      const pair = value as [number | string | null, number | string | null];
      return pair[0] === null || pair[1] === null
        ? undefined
        : wrapNot({ range: { [esField]: { gte: pair[0], lte: pair[1] } } });
    }
    case 'select_equals':
      return { term: { [esField]: value } };
    case 'select_not_equals':
      return wrapNot({ term: { [esField]: value } });
    case 'select_any_in':
      return { terms: { [esField]: value } };
    case 'select_not_any_in':
      return wrapNot({ terms: { [esField]: value } });
    case 'multiselect_contains':
      return {
        bool: { should: (value as string[]).map((item) => ({ term: { [esField]: item } })) },
      };
    case 'multiselect_not_contains':
      // De Morgan (pin `buildMultiselectEsRule`): "none of these" is a
      // conjunction of per-option `must_not` clauses, not a `should`.
      return {
        bool: { must: (value as string[]).map((item) => wrapNot({ term: { [esField]: item } })) },
      };
    case 'multiselect_equals':
      return {
        bool: { must: (value as string[]).map((item) => ({ term: { [esField]: item } })) },
      };
    case 'multiselect_not_equals':
      return {
        bool: { must: (value as string[]).map((item) => wrapNot({ term: { [esField]: item } })) },
      };
  }
}

function esRuleClause(rule: QueryRule, fields: readonly QueryBuilderFieldDef[]): EsClause | undefined {
  const field = findFieldDef(fields, rule.field);
  if (!field || !isRuleComplete(rule, field)) {
    return undefined;
  }
  const clause = esLeafClause(field, rule.operator, rule.value);
  if (!clause || !field.entityType) {
    return clause;
  }
  // Pin extension rules tie the property clause to its entity type, so a
  // custom property on tables never matches the same-named property on
  // dashboards (`QueryBuilderElasticsearchFormatUtils.js` extension wrap).
  return { bool: { must: [clause, { term: { entityType: field.entityType } }] } };
}

function esNode(node: QueryNode, fields: readonly QueryBuilderFieldDef[]): EsClause | undefined {
  if (node.kind === 'rule') {
    return esRuleClause(node, fields);
  }
  const clauses = node.children
    .map((child) => esNode(child, fields))
    .filter((clause): clause is EsClause => clause !== undefined);
  if (!clauses.length) {
    return undefined;
  }
  return { bool: { [node.conjunction === 'AND' ? 'must' : 'should']: clauses } };
}

/**
 * The ES filter for `query_filter` — the pin `elasticSearchFormat` analogue:
 * `{ query: <bool tree> }`, or undefined when the tree constrains nothing.
 * The caller JSON-stringifies it into the `query_filter` URL param / search
 * request, the same transport `catalog/curatedAssets.ts` already uses.
 */
export function elasticSearchFormat(
  node: QueryNode,
  fields: readonly QueryBuilderFieldDef[],
): { query: EsClause } | undefined {
  const clause = esNode(node, fields);
  return clause ? { query: clause } : undefined;
}

/** Serializes a tree into the `query_filter` URL value, or undefined when empty. */
export function buildQueryFilter(node: QueryNode, fields: readonly QueryBuilderFieldDef[]): string | undefined {
  const formatted = elasticSearchFormat(node, fields);
  return formatted ? JSON.stringify(formatted) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function invertOperator(operator: QueryOperator): QueryOperator | null {
  switch (operator) {
    case 'equal':
      return 'not_equal';
    case 'not_equal':
      return 'equal';
    case 'like':
      return 'not_like';
    case 'not_like':
      return 'like';
    case 'match_phrase':
      return 'not_match_phrase';
    case 'not_match_phrase':
      return 'match_phrase';
    case 'between':
      return 'not_between';
    case 'not_between':
      return 'between';
    case 'is_null':
      return 'is_not_null';
    case 'is_not_null':
      return 'is_null';
    case 'select_equals':
      return 'select_not_equals';
    case 'select_not_equals':
      return 'select_equals';
    case 'select_any_in':
      return 'select_not_any_in';
    case 'select_not_any_in':
      return 'select_any_in';
    case 'multiselect_contains':
      return 'multiselect_not_contains';
    case 'multiselect_not_contains':
      return 'multiselect_contains';
    case 'multiselect_equals':
      return 'multiselect_not_equals';
    case 'multiselect_not_equals':
      return 'multiselect_equals';
    default:
      return null;
  }
}

function operatorForLeaf(
  field: QueryBuilderFieldDef,
  queryType: string,
  inverted: boolean,
  multi: boolean,
): QueryOperator | null {
  let operator: QueryOperator | null = null;
  if (queryType === 'term') {
    if (field.type === 'select') {
      operator = multi ? null : 'select_equals';
    } else if (field.type === 'multiselect') {
      operator = 'multiselect_contains';
    } else {
      operator = 'equal';
    }
  } else if (queryType === 'terms') {
    if (field.type === 'select') {
      operator = 'select_any_in';
    } else if (field.type === 'multiselect') {
      operator = 'multiselect_contains';
    }
  } else if (queryType === 'match_phrase') {
    operator = 'match_phrase';
  } else if (queryType === 'wildcard') {
    operator = 'like';
  } else if (queryType === 'regexp') {
    operator = 'regexp';
  } else if (queryType === 'range') {
    operator = 'between';
  } else if (queryType === 'exists') {
    operator = inverted ? 'is_null' : 'is_not_null';
    return field.operators.includes(operator) ? operator : null;
  }
  if (!operator) {
    return null;
  }
  if (inverted) {
    operator = invertOperator(operator);
  }
  return operator && field.operators.includes(operator) ? operator : null;
}

function coerceValue(field: QueryBuilderFieldDef, operator: QueryOperator, raw: unknown): QueryValue | undefined {
  if (operator === 'is_null' || operator === 'is_not_null') {
    return null;
  }
  if (operator === 'between' || operator === 'not_between') {
    const rec = asRecord(raw);
    if (!rec) {
      return undefined;
    }
    // Number bounds, or date bounds as `YYYY-MM-DD` strings.
    const bound = (value: unknown): number | string | undefined =>
      typeof value === 'number' && Number.isFinite(value)
        ? value
        : typeof value === 'string' && value.trim().length > 0
          ? value
          : undefined;
    const lo = bound(rec.gte ?? rec.gt);
    const hi = bound(rec.lte ?? rec.lt);
    // A stored filter may mix bound types; the UI only ever writes
    // homogeneous pairs (numbers, or date strings for date fields).
    return lo !== undefined && hi !== undefined ? ([lo, hi] as QueryValue) : undefined;
  }
  if (
    operator === 'select_any_in' ||
    operator === 'select_not_any_in' ||
    operator === 'multiselect_contains' ||
    operator === 'multiselect_not_contains' ||
    operator === 'multiselect_equals' ||
    operator === 'multiselect_not_equals'
  ) {
    if (typeof raw === 'string' && raw.length > 0) {
      // A single `term` leaf on a multiselect field is a one-option rule.
      return [raw];
    }
    return Array.isArray(raw) && raw.every((item) => typeof item === 'string' && item.length > 0)
      ? [...raw]
      : undefined;
  }
  if (field.type === 'number') {
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined;
  }
  if (field.type === 'boolean') {
    return typeof raw === 'boolean' ? raw : undefined;
  }
  return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
}

function findExtensionField(
  fields: readonly QueryBuilderFieldDef[],
  esField: string,
  entityType?: string,
): QueryBuilderFieldDef | undefined {
  const candidates = fields.filter((field) => field.esField === esField && field.entityType !== undefined);
  if (entityType !== undefined) {
    return candidates.find((field) => field.entityType === entityType);
  }
  return candidates.length === 1 ? candidates[0] : undefined;
}

/**
 * Parses one ES leaf clause into a rule. `inverted` marks a `must_not`
 * context. Returns null for any shape this builder does not emit (the
 * whole parse then fails rather than silently rewriting the filter).
 */
function parseLeaf(
  clause: Record<string, unknown>,
  fields: readonly QueryBuilderFieldDef[],
  inverted: boolean,
  entityType?: string,
): QueryRule | null {
  const entries = Object.entries(clause);
  if (entries.length !== 1) {
    return null;
  }
  const [queryType, body] = entries[0];
  // Resolves an ES field to a builder field. Pin saved filters address
  // `entityType` bare while the builder field is `entityType.keyword`;
  // the `.keyword` fallback keeps those filters editable.
  const resolveField = (fieldName: string): QueryBuilderFieldDef | undefined =>
    findFieldDef(fields, fieldName) ??
    findFieldDef(fields, `${fieldName}.keyword`) ??
    findExtensionField(fields, fieldName, entityType);
  if (queryType === 'exists') {
    const fieldName = asRecord(body)?.field;
    if (typeof fieldName !== 'string') {
      return null;
    }
    const field = resolveField(fieldName);
    if (!field) {
      return null;
    }
    const operator = operatorForLeaf(field, 'exists', inverted, false);
    return operator ? { kind: 'rule', field: field.key, operator, value: null } : null;
  }
  if (queryType === 'range') {
    const rec = asRecord(body);
    if (!rec) {
      return null;
    }
    const fieldNames = Object.keys(rec);
    if (fieldNames.length !== 1) {
      return null;
    }
    const fieldName = fieldNames[0];
    const field = resolveField(fieldName);
    if (!field) {
      return null;
    }
    const operator = operatorForLeaf(field, 'range', inverted, false);
    if (!operator) {
      return null;
    }
    const value = coerceValue(field, operator, rec[fieldName]);
    return value !== undefined ? { kind: 'rule', field: field.key, operator, value } : null;
  }
  if (queryType === 'term' || queryType === 'terms' || queryType === 'match_phrase' || queryType === 'wildcard' || queryType === 'regexp') {
    const rec = asRecord(body);
    if (!rec) {
      return null;
    }
    const fieldNames = Object.keys(rec);
    if (fieldNames.length !== 1) {
      return null;
    }
    const fieldName = fieldNames[0];
    const raw = rec[fieldName];
    const field = resolveField(fieldName);
    if (!field) {
      return null;
    }
    const multi = queryType === 'terms';
    if (queryType === 'wildcard') {
      const wildcard = asRecord(raw)?.value;
      if (typeof wildcard !== 'string') {
        return null;
      }
      const stripped = wildcard.replace(/^\*+/, '').replace(/\*+$/, '');
      const operator = operatorForLeaf(field, 'wildcard', inverted, false);
      if (!operator) {
        return null;
      }
      const value = coerceValue(field, operator, stripped);
      return value !== undefined ? { kind: 'rule', field: field.key, operator, value } : null;
    }
    if (queryType === 'regexp') {
      const pattern = asRecord(raw)?.value;
      if (typeof pattern !== 'string') {
        return null;
      }
      const operator = operatorForLeaf(field, 'regexp', inverted, false);
      if (!operator) {
        return null;
      }
      const value = coerceValue(field, operator, pattern);
      return value !== undefined ? { kind: 'rule', field: field.key, operator, value } : null;
    }
    const operator = operatorForLeaf(field, queryType, inverted, multi);
    if (!operator) {
      return null;
    }
    const value = coerceValue(field, operator, raw);
    return value !== undefined ? { kind: 'rule', field: field.key, operator, value } : null;
  }
  return null;
}

function collectRules(node: QueryNode, out: QueryRule[] = []): QueryRule[] {
  if (node.kind === 'rule') {
    out.push(node);
  } else {
    node.children.forEach((child) => collectRules(child, out));
  }
  return out;
}

function parseBoolNode(
  bool: Record<string, unknown>,
  fields: readonly QueryBuilderFieldDef[],
  inverted: boolean,
  entityType?: string,
): QueryNode | null {
  const must = Array.isArray(bool.must) ? bool.must : undefined;
  const should = Array.isArray(bool.should) ? bool.should : undefined;
  const mustNot = bool.must_not;
  // Extension wrap: bool.must [property clause, { term: { entityType } }].
  // The sibling term supplies the entity-type context the property clause
  // resolves against; when the other clause is not an extension rule of
  // that type, fall through to the generic must handling below (e.g. a
  // saved filter ANDing an owner term with an entityType term).
  if (must && must.length === 2 && !should && mustNot === undefined) {
    const termClause = must.find(
      (item) => asRecord(asRecord(item)?.term)?.entityType !== undefined,
    );
    const other = must.find((item) => item !== termClause);
    const extracted = termClause ? asRecord(asRecord(termClause)?.term)?.entityType : undefined;
    if (typeof extracted === 'string' && other !== undefined) {
      const parsed = parseClause(other, fields, inverted, extracted);
      if (parsed) {
        const rules = collectRules(parsed);
        const isExtension = rules.some(
          (rule) => findFieldDef(fields, rule.field)?.entityType === extracted,
        );
        if (isExtension) {
          return parsed;
        }
      }
    }
  }
  if (must && should) {
    return null;
  }
  // This builder never emits a negated group (pin `showNot: false`), and
  // De Morgan would flip its conjunction — refuse instead of mistranslating.
  if (inverted && (must || should)) {
    return null;
  }
  if (must) {
    if (!must.length) {
      return null;
    }
    const children: QueryNode[] = [];
    for (const item of must) {
      const parsed = parseClause(item, fields, inverted, entityType);
      if (!parsed) {
        return null;
      }
      children.push(parsed);
    }
    return { kind: 'group', conjunction: 'AND', children };
  }
  if (should) {
    if (!should.length) {
      return null;
    }
    const children: QueryNode[] = [];
    for (const item of should) {
      const parsed = parseClause(item, fields, inverted, entityType);
      if (!parsed) {
        return null;
      }
      children.push(parsed);
    }
    return { kind: 'group', conjunction: 'OR', children };
  }
  if (mustNot !== undefined) {
    const items = Array.isArray(mustNot) ? mustNot : [mustNot];
    if (!items.length) {
      return null;
    }
    // A negated group is a conjunction of inverted rules (De Morgan).
    const children: QueryNode[] = [];
    for (const item of items) {
      const parsed = parseClause(item, fields, !inverted, entityType);
      if (!parsed) {
        return null;
      }
      children.push(parsed);
    }
    return children.length === 1
      ? children[0]
      : { kind: 'group', conjunction: 'AND', children };
  }
  return null;
}

function parseClause(
  clause: unknown,
  fields: readonly QueryBuilderFieldDef[],
  inverted: boolean,
  entityType?: string,
): QueryNode | null {
  const rec = asRecord(clause);
  if (!rec) {
    return null;
  }
  if (rec.bool) {
    const bool = asRecord(rec.bool);
    return bool ? parseBoolNode(bool, fields, inverted, entityType) : null;
  }
  const rule = parseLeaf(rec, fields, inverted, entityType);
  return rule;
}

/**
 * Inverse of `elasticSearchFormat` for the shapes this builder emits plus
 * the saved-filter shapes `catalog/curatedAssets.ts` produces (`term` /
 * `terms` / `bool` / `exists` leaves). Returns null when the filter uses a
 * shape the builder cannot edit — callers then keep the filter applied but
 * offer no (lossy) edit, instead of rewriting it.
 */
export function parseElasticsearchQuery(
  input: string | unknown,
  fields: readonly QueryBuilderFieldDef[],
): QueryGroup | null {
  let parsed: unknown = input;
  if (typeof input === 'string') {
    if (!input.trim() || EMPTY_QUERY_FILTER_STRINGS.includes(input.trim())) {
      return null;
    }
    try {
      parsed = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }
  const rec = asRecord(parsed);
  if (!rec) {
    return null;
  }
  const query = rec.query !== undefined ? rec.query : rec;
  const node = parseClause(query, fields, false);
  if (!node) {
    return null;
  }
  if (node.kind === 'rule') {
    return { kind: 'group', conjunction: 'AND', children: [node] };
  }
  return node;
}

/** Readable SQL text for an applied `query_filter` string, or '' when it cannot be rendered. */
export function queryFilterToSql(queryFilter: string | undefined, fields: readonly QueryBuilderFieldDef[]): string {
  if (!queryFilter) {
    return '';
  }
  const tree = parseElasticsearchQuery(queryFilter, fields);
  return tree ? sqlFormat(tree, fields) : '';
}
