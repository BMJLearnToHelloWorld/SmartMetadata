/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official RuleEnforcementUtils parseRule / getEntityRulesValidation cases.
 */
import { describe, expect, it } from 'vitest';
import {
  ENTITY_TYPE_TABLE,
  RuleType,
  getEntityRulesValidation,
  parseRule,
  type EntityRule,
  type ParsedRule,
} from './entityRules';

const TABLE = ENTITY_TYPE_TABLE;
const DASHBOARD = 'dashboard';

describe('official parseRule', () => {
  it('parses MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP', () => {
    const entityRule: EntityRule = {
      name: 'Ownership Rule',
      description: 'Multiple users or single team ownership',
      rule: JSON.stringify({ multipleUsersOrSingleTeamOwnership: true }),
      enabled: true,
      ignoredEntities: [],
    };
    expect(parseRule(entityRule)).toEqual({
      type: RuleType.MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP,
      condition: { multipleUsersOrSingleTeamOwnership: true },
      enabled: true,
      ignoredEntities: [],
      description: 'Multiple users or single team ownership',
      name: 'Ownership Rule',
    });
  });

  it('parses MULTIPLE_DOMAINS_NOT_ALLOWED', () => {
    const result = parseRule({
      name: 'Domain Rule',
      description: 'Limit domains',
      rule: JSON.stringify({ '<=': 1, var: 'domains' }),
      enabled: true,
      ignoredEntities: [],
    });
    expect(result.type).toBe(RuleType.MULTIPLE_DOMAINS_NOT_ALLOWED);
    expect(result.condition).toEqual({ '<=': 1, var: 'domains' });
    expect(result.name).toBe('Domain Rule');
  });

  it('parses MULTIPLE_DATA_PRODUCTS_NOT_ALLOWED', () => {
    const result = parseRule({
      name: 'Data Product Rule',
      description: 'Limit data products',
      rule: JSON.stringify({ '<=': 1, var: 'dataProducts' }),
      enabled: true,
      ignoredEntities: [],
    });
    expect(result.type).toBe(RuleType.MULTIPLE_DATA_PRODUCTS_NOT_ALLOWED);
    expect(result.condition).toEqual({ '<=': 1, var: 'dataProducts' });
    expect(result.name).toBe('Data Product Rule');
  });

  it('parses DATA_PRODUCT_DOMAIN_VALIDATION', () => {
    const result = parseRule({
      name: 'Domain Validation Rule',
      description: 'Validate data product domain',
      rule: JSON.stringify({ validateDataProductDomainMatch: true }),
      enabled: true,
      ignoredEntities: [],
    });
    expect(result.type).toBe(RuleType.DATA_PRODUCT_DOMAIN_VALIDATION);
    expect(result.condition).toEqual({ validateDataProductDomainMatch: true });
    expect(result.name).toBe('Domain Validation Rule');
  });

  it('parses SINGLE_GLOSSARY_TERM_FOR_TABLE', () => {
    const result = parseRule({
      name: 'Glossary Term Rule',
      description: 'Single glossary term for table',
      rule: JSON.stringify({ '<=': 1, filterTagsBySource: 'Glossary' }),
      enabled: true,
      ignoredEntities: [],
    });
    expect(result.type).toBe(RuleType.SINGLE_GLOSSARY_TERM_FOR_TABLE);
    expect(result.condition).toEqual({ '<=': 1, filterTagsBySource: 'Glossary' });
    expect(result.name).toBe('Glossary Term Rule');
  });

  it('parses a custom rule when no known pattern matches', () => {
    const result = parseRule({
      name: 'Custom Rule',
      description: 'A custom validation rule',
      rule: JSON.stringify({ customValidation: true }),
      enabled: true,
      ignoredEntities: [],
    });
    expect(result.type).toBe('custom');
    expect(result.condition).toEqual({ customValidation: true });
    expect(result.name).toBe('Custom Rule');
  });

  it('preserves enabled, ignoredEntities, name, and description', () => {
    const ignoredEntities = [TABLE, DASHBOARD];
    const result = parseRule({
      name: 'My Test Rule',
      description: 'This is a detailed description',
      rule: JSON.stringify({ test: true }),
      enabled: false,
      ignoredEntities,
    });
    expect(result.enabled).toBe(false);
    expect(result.ignoredEntities).toEqual(ignoredEntities);
    expect(result.name).toBe('My Test Rule');
    expect(result.description).toBe('This is a detailed description');
  });

  it('handles complex JSON rule structures', () => {
    const result = parseRule({
      name: 'Complex Rule',
      description: 'Complex validation',
      rule: JSON.stringify({
        and: [{ '>=': 1 }, { '<=': 5 }],
        nested: { deep: { property: true } },
      }),
      enabled: true,
      ignoredEntities: [],
    });
    expect(result.condition).toEqual({
      and: [{ '>=': 1 }, { '<=': 5 }],
      nested: { deep: { property: true } },
    });
  });
});

describe('official getEntityRulesValidation', () => {
  it('returns default hints when no rules are provided', () => {
    expect(getEntityRulesValidation([], TABLE)).toEqual({
      canAddMultipleUserOwners: true,
      canAddMultipleTeamOwner: true,
      canAddMultipleDomains: true,
      canAddMultipleDataProducts: true,
      maxDomains: Infinity,
      maxDataProducts: Infinity,
      canAddMultipleGlossaryTerm: true,
      requireDomainForDataProduct: false,
    });
  });

  it('applies MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP constraints', () => {
    const rules: ParsedRule[] = [
      {
        type: RuleType.MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP,
        condition: { multipleUsersOrSingleTeamOwnership: true },
        enabled: true,
        ignoredEntities: [],
        description: 'Ownership rule',
        name: 'Ownership Rule',
      },
    ];
    const hints = getEntityRulesValidation(rules, TABLE);
    expect(hints.canAddMultipleUserOwners).toBe(true);
    expect(hints.canAddMultipleTeamOwner).toBe(false);
  });

  it('restricts multiple domains', () => {
    const hints = getEntityRulesValidation(
      [
        {
          type: RuleType.MULTIPLE_DOMAINS_NOT_ALLOWED,
          condition: { '<=': 1 },
          enabled: true,
          ignoredEntities: [],
          description: 'Domain rule',
          name: 'Domain Rule',
        },
      ],
      TABLE,
    );
    expect(hints.canAddMultipleDomains).toBe(false);
    expect(hints.maxDomains).toBe(1);
  });

  it('restricts multiple data products', () => {
    const hints = getEntityRulesValidation(
      [
        {
          type: RuleType.MULTIPLE_DATA_PRODUCTS_NOT_ALLOWED,
          condition: { '<=': 1 },
          enabled: true,
          ignoredEntities: [],
          description: 'Data product rule',
          name: 'Data Product Rule',
        },
      ],
      TABLE,
    );
    expect(hints.canAddMultipleDataProducts).toBe(false);
    expect(hints.maxDataProducts).toBe(1);
  });

  it('requires a domain for a data product', () => {
    const hints = getEntityRulesValidation(
      [
        {
          type: RuleType.DATA_PRODUCT_DOMAIN_VALIDATION,
          condition: { validateDataProductDomainMatch: true },
          enabled: true,
          ignoredEntities: [],
          description: 'Domain validation',
          name: 'Domain Validation',
        },
      ],
      TABLE,
    );
    expect(hints.requireDomainForDataProduct).toBe(true);
  });

  it('restricts glossary terms for table but not other entity types', () => {
    const rules: ParsedRule[] = [
      {
        type: RuleType.SINGLE_GLOSSARY_TERM_FOR_TABLE,
        condition: { '<=': 1, filterTagsBySource: 'Glossary' },
        enabled: true,
        ignoredEntities: [],
        description: 'Glossary term rule',
        name: 'Glossary Term Rule',
      },
    ];
    expect(getEntityRulesValidation(rules, TABLE).canAddMultipleGlossaryTerm).toBe(false);
    expect(getEntityRulesValidation(rules, DASHBOARD).canAddMultipleGlossaryTerm).toBe(true);
    expect(getEntityRulesValidation(rules, 'TABLE').canAddMultipleGlossaryTerm).toBe(false);
  });

  it('skips disabled rules', () => {
    const hints = getEntityRulesValidation(
      [
        {
          type: RuleType.MULTIPLE_USERS_OR_SINGLE_TEAM_OWNERSHIP,
          condition: { multipleUsersOrSingleTeamOwnership: true },
          enabled: false,
          ignoredEntities: [],
          description: 'Ownership rule',
          name: 'Ownership Rule',
        },
      ],
      TABLE,
    );
    expect(hints.canAddMultipleUserOwners).toBe(true);
    expect(hints.canAddMultipleTeamOwner).toBe(true);
  });

  it('skips rules for ignored entity types and applies them otherwise', () => {
    const ignored: ParsedRule[] = [
      {
        type: RuleType.MULTIPLE_DOMAINS_NOT_ALLOWED,
        condition: { '<=': 1 },
        enabled: true,
        ignoredEntities: [TABLE],
        description: 'Domain rule',
        name: 'Domain Rule',
      },
    ];
    expect(getEntityRulesValidation(ignored, TABLE).canAddMultipleDomains).toBe(true);
    expect(getEntityRulesValidation(ignored, TABLE).maxDomains).toBe(Infinity);

    const applied = getEntityRulesValidation(
      [
        {
          type: RuleType.MULTIPLE_DOMAINS_NOT_ALLOWED,
          condition: { '<=': 1 },
          enabled: true,
          ignoredEntities: [DASHBOARD],
          description: 'Domain rule',
          name: 'Domain Rule',
        },
      ],
      TABLE,
    );
    expect(applied.canAddMultipleDomains).toBe(false);
    expect(applied.maxDomains).toBe(1);
  });
});
