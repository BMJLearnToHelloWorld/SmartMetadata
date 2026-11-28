/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official getSematicRuleFields field set + JSONLogic emit and the
 * getNegativeQueryForNotContainsReverserOperation rewrite used by
 * ContractSemanticFormTab.toNegatedRule.
 */
import { SEMANTIC_TAG_OPERATORS } from '@/catalog/dataContractTabs';

export type SemanticFieldType = 'text' | 'date' | 'select' | 'group';

export interface SemanticField {
  key: string;
  labelKey: string;
  type: SemanticFieldType;
  operators: string[];
  /** For !group fields (tags / glossary / tier / owners / domains / dataProducts). */
  groupVar?: string;
  subfield?: string;
  options?: Array<{ value: string; labelKey?: string; label?: string }>;
}

/**
 * Official getSematicRuleFields: getCommonConfig() minus extension, service.name,
 * and name, then tag / glossaryTerm / tier overrides. Labels use official i18n keys.
 */
export function getSematicRuleFields(): SemanticField[] {
  const textOps = ['equal', 'not_equal', 'like', 'not_like', 'is_null', 'is_not_null'];
  const dateOps = ['equal', 'not_equal', 'greater', 'greater_or_equal', 'less', 'less_or_equal', 'is_null', 'is_not_null'];
  const groupOps = [...SEMANTIC_TAG_OPERATORS, 'is_null', 'is_not_null'];
  return [
    { key: 'owners', labelKey: 'label.owner-plural', type: 'group', operators: groupOps, groupVar: 'owners', subfield: 'displayName' },
    { key: 'displayName', labelKey: 'label.display-name', type: 'text', operators: textOps },
    { key: 'description', labelKey: 'label.description', type: 'text', operators: textOps },
    { key: 'tags', labelKey: 'label.tag-plural', type: 'group', operators: groupOps, groupVar: 'tags', subfield: 'tagFQN' },
    { key: 'glossaryTerm', labelKey: 'label.glossary-term', type: 'group', operators: groupOps, groupVar: 'tags', subfield: 'tagFQN' },
    { key: 'tier', labelKey: 'label.tier', type: 'group', operators: groupOps, groupVar: 'tags', subfield: 'tagFQN' },
    { key: 'domains', labelKey: 'label.domain-plural', type: 'group', operators: groupOps, groupVar: 'domains', subfield: 'displayName' },
    { key: 'dataProducts', labelKey: 'label.data-product-plural', type: 'group', operators: groupOps, groupVar: 'dataProducts', subfield: 'displayName' },
    { key: 'updatedAt', labelKey: 'label.updated-at', type: 'date', operators: dateOps },
    { key: 'updatedBy', labelKey: 'label.updated-by', type: 'text', operators: textOps },
    { key: 'version', labelKey: 'label.version', type: 'text', operators: textOps },
    {
      key: 'entityStatus',
      labelKey: 'label.status',
      type: 'select',
      operators: ['equal', 'not_equal', 'is_null', 'is_not_null'],
      options: [
        { value: 'Draft', labelKey: 'label.draft' },
        { value: 'In Review', labelKey: 'label.in-review' },
        { value: 'Approved', labelKey: 'label.approved' },
        { value: 'Deprecated', labelKey: 'label.deprecated' },
      ],
    },
  ];
}

export const SEMANTIC_OPERATOR_LABEL_KEYS: Record<string, string> = {
  equal: 'label.equals',
  not_equal: 'label.not-equal',
  like: 'label.contains',
  not_like: 'label.not-contains',
  greater: 'label.greater-than',
  greater_or_equal: 'label.greater-than-or-equal-to',
  less: 'label.less-than',
  less_or_equal: 'label.less-than-or-equal-to',
  is_null: 'label.is-not-set',
  is_not_null: 'label.is-set',
  array_contains: 'label.contains',
  array_not_contains: 'label.not-contains',
};

export interface SemanticAtom {
  field: string;
  operator: string;
  value?: string;
}

export interface SemanticTree {
  combinator: 'and' | 'or';
  rules: SemanticAtom[];
}

export function emptySemanticTree(): SemanticTree {
  return { combinator: 'and', rules: [{ field: '', operator: 'equal', value: '' }] };
}

export function parseSemanticTree(jsonTree?: string): SemanticTree {
  if (!jsonTree) {
    return emptySemanticTree();
  }
  try {
    const parsed = JSON.parse(jsonTree) as SemanticTree;
    if (parsed && (parsed.combinator === 'and' || parsed.combinator === 'or') && Array.isArray(parsed.rules)) {
      return parsed;
    }
  } catch {
    /* fall through */
  }
  return emptySemanticTree();
}

function atomToJsonLogic(atom: SemanticAtom, fields: SemanticField[]): Record<string, unknown> | undefined {
  if (!atom.field || !atom.operator) {
    return undefined;
  }
  const field = fields.find((item) => item.key === atom.field);
  const variable = { var: field?.subfield && field.groupVar ? field.subfield : atom.field };
  const groupVar = field?.groupVar ? { var: field.groupVar } : undefined;
  const value = atom.value ?? '';

  const wrapGroup = (condition: Record<string, unknown>): Record<string, unknown> =>
    groupVar ? { some: [groupVar, condition] } : condition;

  switch (atom.operator) {
    case 'equal':
      return wrapGroup({ '==': [variable, value] });
    case 'not_equal':
      return wrapGroup({ '!=': [variable, value] });
    case 'like':
      return wrapGroup({ in: [value, variable] });
    case 'not_like':
      return wrapGroup({ '!': { in: [value, variable] } });
    case 'greater':
      return { '>': [variable, value] };
    case 'greater_or_equal':
      return { '>=': [variable, value] };
    case 'less':
      return { '<': [variable, value] };
    case 'less_or_equal':
      return { '<=': [variable, value] };
    case 'is_null':
      return wrapGroup({ '==': [variable, null] });
    case 'is_not_null':
      return wrapGroup({ '!=': [variable, null] });
    case 'array_contains':
      return wrapGroup({ in: [value, variable] });
    case 'array_not_contains':
      return wrapGroup({ '!': { in: [value, variable] } });
    default:
      return wrapGroup({ '==': [variable, value] });
  }
}

export function semanticTreeToJsonLogic(tree: SemanticTree, fields = getSematicRuleFields()): Record<string, unknown> {
  const atoms = tree.rules
    .map((rule) => atomToJsonLogic(rule, fields))
    .filter((item): item is Record<string, unknown> => Boolean(item));
  if (atoms.length === 0) {
    return {};
  }
  if (atoms.length === 1) {
    return atoms[0];
  }
  return { [tree.combinator]: atoms };
}

/** Official getNegativeQueryForNotContainsReverserOperation. */
export function getNegativeQueryForNotContainsReverserOperation(
  logic: Record<string, unknown>,
): Record<string, unknown> {
  const buildNegatedSome = (
    variable: unknown,
    negated: Record<string, unknown>,
  ): Record<string, unknown> | undefined => {
    if (negated.contains) {
      return { '!': { some: [variable, { contains: negated.contains }] } };
    }
    if (negated.in) {
      return { '!': { some: [variable, { in: negated.in }] } };
    }
    return undefined;
  };

  const handleSomeOperation = (node: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (!node.some || !Array.isArray(node.some)) {
      return undefined;
    }
    const [variable, condition] = node.some as [unknown, Record<string, unknown>];
    const negation = condition?.['!'];
    if (negation && typeof negation === 'object') {
      const result = buildNegatedSome(variable, negation as Record<string, unknown>);
      if (result) {
        return result;
      }
    }
    const equalsNullArgs = condition?.['=='];
    if (Array.isArray(equalsNullArgs) && equalsNullArgs.length === 2 && equalsNullArgs[1] === null) {
      const [field] = equalsNullArgs;
      return { '!': { some: [variable, { '!=': [field, null] }] } };
    }
    return undefined;
  };

  const processNotContains = (node: Record<string, unknown> | unknown): unknown => {
    if (!node || typeof node !== 'object') {
      return node;
    }
    const record = node as Record<string, unknown>;
    const someResult = handleSomeOperation(record);
    if (someResult !== undefined) {
      return someResult;
    }
    if (record.and && Array.isArray(record.and)) {
      return { and: record.and.map((item) => processNotContains(item)) };
    }
    if (record.or && Array.isArray(record.or)) {
      return { or: record.or.map((item) => processNotContains(item)) };
    }
    return record;
  };

  return processNotContains(logic) as Record<string, unknown>;
}

export function toNegatedRule(rule: string): string {
  if (!rule) {
    return '';
  }
  try {
    return JSON.stringify(getNegativeQueryForNotContainsReverserOperation(JSON.parse(rule) as Record<string, unknown>));
  } catch {
    return '';
  }
}

export function ruleStringFromTree(tree: SemanticTree): string {
  const logic = semanticTreeToJsonLogic(tree);
  if (!logic || Object.keys(logic).length === 0) {
    return '';
  }
  return toNegatedRule(JSON.stringify(logic));
}
