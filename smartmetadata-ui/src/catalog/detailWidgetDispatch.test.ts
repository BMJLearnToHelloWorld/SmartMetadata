/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { DetailWidgetKeys, resolveWidgetContentKey } from './detailWidgetDispatch';

describe('DetailWidgetKeys', () => {
  it('carries exactly the official key strings the dispatch can return', () => {
    expect(DetailWidgetKeys).toEqual({
      LEFT_PANEL: 'KnowledgePanel.LeftPanel',
      DESCRIPTION: 'KnowledgePanel.Description',
      TABLE_SCHEMA: 'KnowledgePanel.TableSchema',
      TOPIC_SCHEMA: 'KnowledgePanel.TopicSchema',
      DATABASE_SCHEMA: 'KnowledgePanel.DatabaseSchema',
      CHARTS_TABLE: 'KnowledgePanel.ChartsTable',
      FREQUENTLY_JOINED_TABLES: 'KnowledgePanel.FrequentlyJoinedTables',
      DATA_PRODUCTS: 'KnowledgePanel.DataProducts',
      TAGS: 'KnowledgePanel.Tags',
      DOMAIN: 'KnowledgePanel.Domain',
      GLOSSARY_TERMS: 'KnowledgePanel.GlossaryTerms',
      CUSTOM_PROPERTIES: 'KnowledgePanel.CustomProperties',
      TABLE_CONSTRAINTS: 'KnowledgePanel.TableConstraints',
      PARTITIONED_KEYS: 'KnowledgePanel.PartitionedKeys',
      TABLE_ALIASES: 'KnowledgePanel.TableAliases',
      STORED_PROCEDURE_CODE: 'KnowledgePanel.StoredProcedureCode',
      DATA_MODEL: 'KnowledgePanel.DataModel',
      CONTAINER_CHILDREN: 'KnowledgePanel.ContainerChildren',
      PIPELINE_TASKS: 'KnowledgePanel.PipelineTasks',
      SEARCH_INDEX_FIELDS: 'KnowledgePanel.SearchIndexFields',
      OWNERS: 'KnowledgePanel.Owners',
      EXPERTS: 'KnowledgePanel.Experts',
      DOMAIN_TYPE: 'KnowledgePanel.DomainType',
      TABLES: 'KnowledgePanel.Tables',
      API_ENDPOINTS: 'KnowledgePanel.APIEndpoints',
      API_SCHEMA: 'KnowledgePanel.APISchema',
      RELATED_METRICS: 'KnowledgePanel.RelatedMetrics',
      METRIC_HIERARCHY: 'KnowledgePanel.MetricHierarchy',
      METRIC_DEFINITION: 'KnowledgePanel.MetricDefinition',
      ML_MODEL_FEATURES: 'KnowledgePanel.MlModelFeatures',
      CONTAINER_SCHEMA: 'KnowledgePanel.ContainerSchema',
      TIER: 'KnowledgePanel.Tier',
      CERTIFICATION: 'KnowledgePanel.Certification',
      MARKETPLACE_DATA_PRODUCTS: 'KnowledgePanel.MarketplaceDataProducts',
      MARKETPLACE_DOMAINS: 'KnowledgePanel.MarketplaceDomains',
      KNOWLEDGE_ARTICLE: 'KnowledgePanel.KnowledgeArticle',
      ASSET_HEALTH: 'KnowledgePanel.AssetHealth',
      SYNONYMS: 'KnowledgePanel.Synonyms',
      RELATED_TERMS: 'KnowledgePanel.RelatedTerms',
      REFERENCES: 'KnowledgePanel.References',
      OWNER: 'KnowledgePanel.Owner',
      REVIEWER: 'KnowledgePanel.Reviewer',
      TERMS_TABLE: 'KnowledgePanel.TermsTable',
      WORKFLOW_HISTORY: 'KnowledgePanel.WorkflowHistory',
    });
  });
});

describe('resolveWidgetContentKey', () => {
  it('matches per-type keys by plain startsWith, including duplicate suffixes', () => {
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.TableSchema')).toBe(
      DetailWidgetKeys.TABLE_SCHEMA,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.TableSchema-1')).toBe(
      DetailWidgetKeys.TABLE_SCHEMA,
    );
    // Official per-type checks are unguarded startsWith: any suffix matches.
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.TableSchemaXYZ')).toBe(
      DetailWidgetKeys.TABLE_SCHEMA,
    );
    expect(resolveWidgetContentKey('Topic', 'KnowledgePanel.TopicSchema-2')).toBe(
      DetailWidgetKeys.TOPIC_SCHEMA,
    );
    expect(resolveWidgetContentKey('Container', 'KnowledgePanel.ContainerChildren')).toBe(
      DetailWidgetKeys.CONTAINER_CHILDREN,
    );
    expect(resolveWidgetContentKey('Container', 'KnowledgePanel.ContainerSchema')).toBe(
      DetailWidgetKeys.CONTAINER_SCHEMA,
    );
    expect(resolveWidgetContentKey('Metric', 'KnowledgePanel.MetricDefinition')).toBe(
      DetailWidgetKeys.METRIC_DEFINITION,
    );
    expect(resolveWidgetContentKey('Metric', 'KnowledgePanel.MetricHierarchy-1')).toBe(
      DetailWidgetKeys.METRIC_HIERARCHY,
    );
    expect(resolveWidgetContentKey('Metric', 'KnowledgePanel.RelatedMetrics')).toBe(
      DetailWidgetKeys.RELATED_METRICS,
    );
  });

  it('covers every per-type specific key', () => {
    const cases: Array<[string, string, string]> = [
      ['Table', 'KnowledgePanel.TableConstraints', DetailWidgetKeys.TABLE_CONSTRAINTS],
      ['Table', 'KnowledgePanel.FrequentlyJoinedTables', DetailWidgetKeys.FREQUENTLY_JOINED_TABLES],
      ['Table', 'KnowledgePanel.PartitionedKeys', DetailWidgetKeys.PARTITIONED_KEYS],
      ['Table', 'KnowledgePanel.TableAliases', DetailWidgetKeys.TABLE_ALIASES],
      ['Table', 'KnowledgePanel.AssetHealth', DetailWidgetKeys.ASSET_HEALTH],
      ['StoredProcedure', 'KnowledgePanel.StoredProcedureCode', DetailWidgetKeys.STORED_PROCEDURE_CODE],
      ['DashboardDataModel', 'KnowledgePanel.DataModel', DetailWidgetKeys.DATA_MODEL],
      ['Dashboard', 'KnowledgePanel.ChartsTable', DetailWidgetKeys.CHARTS_TABLE],
      ['Pipeline', 'KnowledgePanel.PipelineTasks', DetailWidgetKeys.PIPELINE_TASKS],
      ['DatabaseSchema', 'KnowledgePanel.Tables', DetailWidgetKeys.TABLES],
      ['Database', 'KnowledgePanel.DatabaseSchema', DetailWidgetKeys.DATABASE_SCHEMA],
      ['SearchIndex', 'KnowledgePanel.SearchIndexFields', DetailWidgetKeys.SEARCH_INDEX_FIELDS],
      ['MlModel', 'KnowledgePanel.MlModelFeatures', DetailWidgetKeys.ML_MODEL_FEATURES],
      ['APIEndpoint', 'KnowledgePanel.APISchema', DetailWidgetKeys.API_SCHEMA],
      ['APICollection', 'KnowledgePanel.APIEndpoints', DetailWidgetKeys.API_ENDPOINTS],
      ['Domain', 'KnowledgePanel.DomainType', DetailWidgetKeys.DOMAIN_TYPE],
      ['Glossary', 'KnowledgePanel.TermsTable', DetailWidgetKeys.TERMS_TABLE],
      ['GlossaryTerm', 'KnowledgePanel.WorkflowHistory', DetailWidgetKeys.WORKFLOW_HISTORY],
      ['GlossaryTerm', 'KnowledgePanel.RelatedTerms', DetailWidgetKeys.RELATED_TERMS],
      ['GlossaryTerm', 'KnowledgePanel.Synonyms', DetailWidgetKeys.SYNONYMS],
      ['GlossaryTerm', 'KnowledgePanel.References', DetailWidgetKeys.REFERENCES],
      ['GlossaryTerm', 'KnowledgePanel.Owner', DetailWidgetKeys.OWNER],
      ['DataMarketplace', 'KnowledgePanel.MarketplaceDataProducts', DetailWidgetKeys.MARKETPLACE_DATA_PRODUCTS],
      ['DataMarketplace', 'KnowledgePanel.MarketplaceDomains', DetailWidgetKeys.MARKETPLACE_DOMAINS],
    ];
    for (const [pageType, widgetKey, expected] of cases) {
      expect(resolveWidgetContentKey(pageType, widgetKey)).toBe(expected);
    }
  });

  it('checks per-type keys before common keys where a specific key prefixes another', () => {
    // GlossaryTerm OWNER startsWith swallows OWNERS, as officially.
    expect(resolveWidgetContentKey('GlossaryTerm', 'KnowledgePanel.Owners')).toBe(
      DetailWidgetKeys.OWNER,
    );
    expect(resolveWidgetContentKey('GlossaryTerm', 'KnowledgePanel.Owners-1')).toBe(
      DetailWidgetKeys.OWNER,
    );
    expect(resolveWidgetContentKey('GlossaryTerm', 'KnowledgePanel.DomainType')).toBe(
      DetailWidgetKeys.DOMAIN,
    );
    // The same ids resolve to their own keys where no specific check prefixes them.
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Owners')).toBe(
      DetailWidgetKeys.OWNERS,
    );
    expect(resolveWidgetContentKey('Domain', 'KnowledgePanel.DomainType')).toBe(
      DetailWidgetKeys.DOMAIN_TYPE,
    );
  });

  it('falls back to common keys for page types without a specific branch', () => {
    expect(resolveWidgetContentKey('Chart', 'KnowledgePanel.Description')).toBe(
      DetailWidgetKeys.DESCRIPTION,
    );
    expect(resolveWidgetContentKey('Chart', 'KnowledgePanel.Tags-1')).toBe(DetailWidgetKeys.TAGS);
    expect(resolveWidgetContentKey('Tag', 'KnowledgePanel.Description')).toBe(
      DetailWidgetKeys.DESCRIPTION,
    );
    expect(resolveWidgetContentKey('Tag', 'KnowledgePanel.Owners')).toBe(DetailWidgetKeys.OWNERS);
    expect(resolveWidgetContentKey('Tag', 'KnowledgePanel.Domain')).toBe(DetailWidgetKeys.DOMAIN);
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.LeftPanel')).toBe(
      DetailWidgetKeys.LEFT_PANEL,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Tier')).toBe(DetailWidgetKeys.TIER);
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Certification')).toBe(
      DetailWidgetKeys.CERTIFICATION,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Experts')).toBe(
      DetailWidgetKeys.EXPERTS,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.CustomProperties')).toBe(
      DetailWidgetKeys.CUSTOM_PROPERTIES,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.DataProducts')).toBe(
      DetailWidgetKeys.DATA_PRODUCTS,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.GlossaryTerms')).toBe(
      DetailWidgetKeys.GLOSSARY_TERMS,
    );
  });

  it('resolves the description key on every wired page type', () => {
    const wired = [
      'Table',
      'Topic',
      'StoredProcedure',
      'DashboardDataModel',
      'Dashboard',
      'Pipeline',
      'DatabaseSchema',
      'Database',
      'Container',
      'SearchIndex',
      'Metric',
      'MlModel',
      'APIEndpoint',
      'APICollection',
      'Chart',
      'Domain',
      'DataProduct',
      'Glossary',
      'GlossaryTerm',
      'Tag',
    ];
    for (const pageType of wired) {
      expect(resolveWidgetContentKey(pageType, 'KnowledgePanel.Description')).toBe(
        DetailWidgetKeys.DESCRIPTION,
      );
    }
  });

  it('guards common matches with the duplicate-suffix dash rule', () => {
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Description-1')).toBe(
      DetailWidgetKeys.DESCRIPTION,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.DescriptionX')).toBeNull();
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.OwnersX')).toBeNull();
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.TagsExtra')).toBeNull();
  });

  it('resolves knowledge articles through the case-insensitive fallback', () => {
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.KnowledgeArticle')).toBe(
      DetailWidgetKeys.KNOWLEDGE_ARTICLE,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.KnowledgeArticle-2')).toBe(
      DetailWidgetKeys.KNOWLEDGE_ARTICLE,
    );
    expect(resolveWidgetContentKey('Table', 'knowledgepanel.knowledgearticle')).toBe(
      DetailWidgetKeys.KNOWLEDGE_ARTICLE,
    );
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.KnowledgeArticleX')).toBeNull();
  });

  it('returns null for unknown ids and unknown page types', () => {
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Nope')).toBeNull();
    expect(resolveWidgetContentKey('Table', '')).toBeNull();
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Tabs')).toBeNull();
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Header')).toBeNull();
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Announcements')).toBeNull();
    expect(resolveWidgetContentKey('Table', 'ExtraWidget.EmptyWidgetPlaceholder')).toBeNull();
    expect(resolveWidgetContentKey('NoSuchPage', 'KnowledgePanel.Description')).toBeNull();
    expect(resolveWidgetContentKey('Classification', 'KnowledgePanel.Description')).toBeNull();
    expect(resolveWidgetContentKey('LandingPage', 'KnowledgePanel.Description')).toBeNull();
  });

  it('returns null for keys with no dispatch branch on that page type', () => {
    // StoredProcedure dispatches only its code key; TableSchema falls to common, which has none.
    expect(resolveWidgetContentKey('StoredProcedure', 'KnowledgePanel.TableSchema')).toBeNull();
    // GlossaryTerm has no TermsTable branch; Glossary does.
    expect(resolveWidgetContentKey('GlossaryTerm', 'KnowledgePanel.TermsTable')).toBeNull();
    // Metric dimensions/measures are enum-only at pin: no branch renders them.
    expect(resolveWidgetContentKey('Metric', 'KnowledgePanel.MetricDimensions')).toBeNull();
    expect(resolveWidgetContentKey('Metric', 'KnowledgePanel.MetricMeasures')).toBeNull();
    // TableSchema on a Topic page, Tables on a Table page: wrong page type, no match.
    expect(resolveWidgetContentKey('Topic', 'KnowledgePanel.TableSchema')).toBeNull();
    expect(resolveWidgetContentKey('Table', 'KnowledgePanel.Tables')).toBeNull();
  });

  it('gives DataMarketplace only its marketplace keys, with no common fallback', () => {
    expect(resolveWidgetContentKey('DataMarketplace', 'KnowledgePanel.MarketplaceDomains-1')).toBe(
      DetailWidgetKeys.MARKETPLACE_DOMAINS,
    );
    expect(resolveWidgetContentKey('DataMarketplace', 'KnowledgePanel.Description')).toBeNull();
    expect(resolveWidgetContentKey('DataMarketplace', 'KnowledgePanel.KnowledgeArticle')).toBeNull();
    expect(
      resolveWidgetContentKey('DataMarketplace', 'KnowledgePanel.MarketplaceAnnouncements'),
    ).toBeNull();
  });

  it('matches DataProduct DOMAIN exactly, with common handling for suffixed ids', () => {
    expect(resolveWidgetContentKey('DataProduct', 'KnowledgePanel.Domain')).toBe(
      DetailWidgetKeys.DOMAIN,
    );
    expect(resolveWidgetContentKey('DataProduct', 'KnowledgePanel.Domain-1')).toBe(
      DetailWidgetKeys.DOMAIN,
    );
    expect(resolveWidgetContentKey('DataProduct', 'KnowledgePanel.DomainType')).toBeNull();
    expect(resolveWidgetContentKey('DataProduct', 'KnowledgePanel.DomainXYZ')).toBeNull();
  });

  it('maps the Drive leaves to null: no product detail views exist for them', () => {
    expect(resolveWidgetContentKey('Directory', 'KnowledgePanel.DirectoryChildren')).toBeNull();
    expect(resolveWidgetContentKey('Directory', 'KnowledgePanel.Description')).toBeNull();
    expect(resolveWidgetContentKey('File', 'KnowledgePanel.Description')).toBeNull();
    expect(resolveWidgetContentKey('Spreadsheet', 'KnowledgePanel.Worksheets')).toBeNull();
    expect(resolveWidgetContentKey('Worksheet', 'KnowledgePanel.WorksheetColumns')).toBeNull();
  });
});
