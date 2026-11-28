/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official parseRule / getEntityRulesValidation (RuleEnforcementUtils).
 * Form-surface helper only: do not invent a product-wide RuleEnforcementProvider.
 */
import type { SemanticsRule } from '@/types/admin';

/** Official EntityType.TABLE — ContractDetailFormTab always fetches TABLE rules. */
export const ENTITY_TYPE_TABLE = 'table';

export enum RuleType {
  MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP = 'multipleUsersOrSingleTeamOwnership',
  MULTIPLE_DOMAINS_NOT_ALLOWED = 'multipleDomains',
  MULTIPLE_DATA_PRODUCTS_NOT_ALLOWED = 'multipleDataProducts',
  DATA_PRODUCT_DOMAIN_VALIDATION = 'dataProductDomainValidation',
  SINGLE_GLOSSARY_TERM_FOR_TABLE = 'singleGlossaryTermForTable',
}

export interface EntityRule {
  name: string;
  description: string;
  rule: string;
  enabled: boolean;
  ignoredEntities: string[];
}

export interface ParsedRule {
  type: RuleType | string;
  condition: Record<string, unknown>;
  enabled: boolean;
  ignoredEntities: string[];
  description: string;
  name: string;
}

export interface DataAssetRuleValidation {
  canAddMultipleUserOwners: boolean;
  canAddMultipleTeamOwner: boolean;
  canAddMultipleDomains: boolean;
  canAddMultipleDataProducts: boolean;
  maxDomains: number;
  maxDataProducts: number;
  canAddMultipleGlossaryTerm: boolean;
  requireDomainForDataProduct: boolean;
}

export function toEntityRule(rule: SemanticsRule): EntityRule {
  return {
    name: rule.name,
    description: rule.description ?? '',
    rule: rule.rule ?? '',
    enabled: Boolean(rule.enabled),
    ignoredEntities: rule.ignoredEntities ?? [],
  };
}

/**
 * Official parseRule: classify a JSON rule string without a RAQB / jsonTree clone.
 */
export function parseRule(rule: EntityRule): ParsedRule {
  const ruleObj = JSON.parse(rule.rule) as Record<string, unknown>;

  let ruleType: RuleType | string = 'custom';

  if (ruleObj.multipleUsersOrSingleTeamOwnership) {
    ruleType = RuleType.MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP;
  } else if (ruleObj['<='] && JSON.stringify(ruleObj).includes('domains')) {
    ruleType = RuleType.MULTIPLE_DOMAINS_NOT_ALLOWED;
  } else if (ruleObj['<='] && JSON.stringify(ruleObj).includes('dataProducts')) {
    ruleType = RuleType.MULTIPLE_DATA_PRODUCTS_NOT_ALLOWED;
  } else if (ruleObj.validateDataProductDomainMatch) {
    ruleType = RuleType.DATA_PRODUCT_DOMAIN_VALIDATION;
  } else if (
    ruleObj['<='] &&
    JSON.stringify(ruleObj).includes('filterTagsBySource') &&
    JSON.stringify(ruleObj).includes('Glossary')
  ) {
    ruleType = RuleType.SINGLE_GLOSSARY_TERM_FOR_TABLE;
  }

  return {
    type: ruleType,
    condition: ruleObj,
    enabled: rule.enabled,
    ignoredEntities: rule.ignoredEntities,
    description: rule.description,
    name: rule.name,
  };
}

/**
 * Official getEntityRulesValidation: UI hints used by hasOwnerRuleViolation.
 */
export function getEntityRulesValidation(
  rules: ParsedRule[],
  entityType: string,
): DataAssetRuleValidation {
  const hints: DataAssetRuleValidation = {
    canAddMultipleUserOwners: true,
    canAddMultipleTeamOwner: true,
    canAddMultipleDomains: true,
    canAddMultipleDataProducts: true,
    maxDomains: Infinity,
    maxDataProducts: Infinity,
    canAddMultipleGlossaryTerm: true,
    requireDomainForDataProduct: false,
  };

  rules.forEach((rule) => {
    if (rule.ignoredEntities.includes(entityType) || !rule.enabled) {
      return;
    }

    switch (rule.type) {
      case RuleType.MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP:
        hints.canAddMultipleUserOwners = true;
        hints.canAddMultipleTeamOwner = false;
        break;
      case RuleType.MULTIPLE_DOMAINS_NOT_ALLOWED:
        hints.canAddMultipleDomains = false;
        hints.maxDomains = 1;
        break;
      case RuleType.MULTIPLE_DATA_PRODUCTS_NOT_ALLOWED:
        hints.canAddMultipleDataProducts = false;
        hints.maxDataProducts = 1;
        break;
      case RuleType.DATA_PRODUCT_DOMAIN_VALIDATION:
        hints.requireDomainForDataProduct = true;
        break;
      case RuleType.SINGLE_GLOSSARY_TERM_FOR_TABLE:
        if (entityType.toLowerCase() === 'table') {
          hints.canAddMultipleGlossaryTerm = false;
        }
        break;
    }
  });

  return hints;
}
