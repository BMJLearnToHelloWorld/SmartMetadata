/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  branchChildPrefix,
  branchFocusKeyPrefix,
  branchTypeKey,
  childLabelPrefix,
  enumOptionKey,
  fieldLabelPrefix,
  formDisplayLabel,
  resolveBranchDescription,
  resolveBranchFocusMeta,
  resolveBranchTitle,
  resolveEnumOptionLabel,
  resolveFieldDescription,
  resolveFieldFocusMeta,
  resolveFieldLabel,
  schemaSlugFor,
  type Exists,
  type Translate,
} from './schemaFieldLabels';

/** Fake `t`/`te` over a small dictionary; `{n}` interpolation included. */
function fakeI18n(dict: Record<string, string>): { t: Translate; te: Exists } {
  const te: Exists = (key) => key in dict;
  const t: Translate = (key, named) => {
    let value = dict[key] ?? key;
    if (named !== undefined) {
      for (const [name, replacement] of Object.entries(named)) {
        value = value.replace(`{${name}}`, String(replacement));
      }
    }
    return value;
  };
  return { t, te };
}

describe('schemaFieldLabels', () => {
  it('maps the nine metadata root titles to slugs and nothing else', () => {
    expect(schemaSlugFor({ title: 'DatabaseServiceMetadataPipeline' })).toBe('database');
    expect(schemaSlugFor({ title: 'DashboardServiceMetadataPipeline' })).toBe('dashboard');
    expect(schemaSlugFor({ title: 'ApiServiceMetadataPipeline' })).toBe('api');
    expect(schemaSlugFor({ title: 'MessagingServiceMetadataPipeline' })).toBe('messaging');
    expect(schemaSlugFor({ title: 'MlModelServiceMetadataPipeline' })).toBe('mlmodel');
    expect(schemaSlugFor({ title: 'PipelineServiceMetadataPipeline' })).toBe('pipeline');
    expect(schemaSlugFor({ title: 'StorageServiceMetadataPipeline' })).toBe('storage');
    expect(schemaSlugFor({ title: 'SearchServiceMetadataPipeline' })).toBe('search');
    expect(schemaSlugFor({ title: 'DriveServiceMetadataPipeline' })).toBe('drive');
    expect(schemaSlugFor({ title: 'DatabaseServiceProfilerPipeline' })).toBeUndefined();
    expect(schemaSlugFor({ title: 'DatabaseServiceQueryUsagePipeline' })).toBeUndefined();
    expect(schemaSlugFor({ title: 'DatabaseServiceQueryLineagePipeline' })).toBeUndefined();
    expect(schemaSlugFor({ title: 'DatabaseServiceAutoClassificationPipeline' })).toBeUndefined();
    expect(schemaSlugFor({ title: 'dbtPipeline' })).toBeUndefined();
    expect(schemaSlugFor({ title: 'TestSuitePipeline' })).toBeUndefined();
    expect(schemaSlugFor({ title: 'DataInsightPipeline' })).toBeUndefined();
    expect(schemaSlugFor({})).toBeUndefined();
  });

  it('builds field, child, branch-child and branch-focus-key prefixes', () => {
    const prefix = fieldLabelPrefix('database', 'ownerConfig');
    expect(prefix).toBe('forms.schemaFields.database.ownerConfig');
    expect(childLabelPrefix(prefix, 'default')).toBe(
      'forms.schemaFields.database.ownerConfig.default',
    );
    expect(branchChildPrefix(prefix, 2)).toBe('forms.schemaFields.database.ownerConfig.b2');
    expect(branchFocusKeyPrefix(prefix, 2)).toBe(
      'forms.schemaFields.database.ownerConfig.branches.b2',
    );
    expect(childLabelPrefix(undefined, 'default')).toBeUndefined();
    expect(branchChildPrefix(undefined, 0)).toBeUndefined();
    expect(branchFocusKeyPrefix(undefined, 0)).toBeUndefined();
    expect(enumOptionKey(prefix, 'replace')).toBe(
      'forms.schemaFields.database.ownerConfig.options.replace',
    );
    expect(enumOptionKey(undefined, 'replace')).toBeUndefined();
    expect(branchTypeKey('string')).toBe('forms.schemaFields.branchTypes.string');
    expect(branchTypeKey('object')).toBe('forms.schemaFields.branchTypes.object');
    expect(branchTypeKey('integer')).toBe('forms.schemaFields.branchTypes.integer');
    expect(branchTypeKey('number')).toBe('forms.schemaFields.branchTypes.number');
    expect(branchTypeKey('boolean')).toBe('forms.schemaFields.branchTypes.boolean');
    expect(branchTypeKey('array')).toBe('forms.schemaFields.branchTypes.array');
    expect(branchTypeKey('null')).toBeUndefined();
    expect(branchTypeKey('something-else')).toBeUndefined();
  });

  it('formDisplayLabel matches the official vectors', () => {
    // formBuilderV1LabelUtils.test.ts, assertion for assertion.
    expect(formDisplayLabel('hostPort')).toBe('Host Port');
    expect(formDisplayLabel('supportsMetadataExtraction')).toBe('Supports Metadata Extraction');
    expect(formDisplayLabel('connection_options')).toBe('Connection Options');
    expect(formDisplayLabel('apiVersion')).toBe('API Version');
    expect(formDisplayLabel('awsRegion')).toBe('AWS Region');
    expect(formDisplayLabel('sslMode')).toBe('SSL Mode');
    expect(formDisplayLabel('dbtConfigSource')).toBe('dbt Config Source');
    expect(formDisplayLabel('DBT Cloud Config')).toBe('dbt Cloud Config');
    expect(formDisplayLabel('s3Config')).toBe('S3 Config');
    expect(formDisplayLabel('DBT S3 Config')).toBe('dbt S3 Config');
    expect(formDisplayLabel('oAuthToken')).toBe('OAuth Token');
    expect(formDisplayLabel('oauthConfig')).toBe('OAuth Config');
    const rendered = formDisplayLabel('DBT S3 Config');
    expect(formDisplayLabel(rendered)).toBe(rendered);
    for (const title of ['DBT S3 Config', 'Backend Connection', 'Local Path']) {
      expect(formDisplayLabel(title).toLowerCase()).toBe(title.toLowerCase());
    }
    // Tokenizer edges from the design: acronym runs, letter/digit splits.
    expect(formDisplayLabel('XMLHttpRequest')).toBe('XML Http Request');
    expect(formDisplayLabel('x509Certificate')).toBe('X509 Certificate');
    expect(formDisplayLabel('')).toBe('');
    expect(formDisplayLabel('FOO')).toBe('FOO');
  });

  it('formDisplayLabel leaves every in-scope branch title unchanged', () => {
    const titles = [
      'No Global Manifest',
      'Storage Metadata Local Config',
      'Storage Metadata Http Config',
      'Storage Metadata S3 Config',
      'Storage Metadata ADLS Config',
      'Storage Metadata GCS Config',
      'GCP Credentials Values',
      'GCP Credentials Path',
      'GCP External Account',
      'GCP Application Default Credentials',
      'Single Project ID',
      'Multiple Project ID',
    ];
    for (const title of titles) {
      expect(formDisplayLabel(title)).toBe(title);
    }
  });

  it('formDisplayLabel formats bare type words', () => {
    expect(formDisplayLabel('string')).toBe('String');
    expect(formDisplayLabel('object')).toBe('Object');
    expect(formDisplayLabel('integer')).toBe('Integer');
    expect(formDisplayLabel('number')).toBe('Number');
    expect(formDisplayLabel('boolean')).toBe('Boolean');
    expect(formDisplayLabel('array')).toBe('Array');
  });

  it('resolveFieldLabel prefers the key, then title, then startCase', () => {
    const { t, te } = fakeI18n({
      'forms.schemaFields.database.threads.label': '线程数',
    });
    const prefix = 'forms.schemaFields.database.threads';
    expect(
      resolveFieldLabel({ labelKeyPrefix: prefix, path: ['threads'], title: 'Threads', key: 'threads', t, te }),
    ).toBe('线程数');
    expect(
      resolveFieldLabel({ labelKeyPrefix: 'forms.schemaFields.database.other', path: ['other'], title: 'Other Title', key: 'other', t, te }),
    ).toBe('Other Title');
    expect(
      resolveFieldLabel({ labelKeyPrefix: 'forms.schemaFields.database.other', path: ['other'], title: undefined, key: 'someField', t, te }),
    ).toBe('Some Field');
    expect(
      resolveFieldLabel({ labelKeyPrefix: undefined, path: ['threads'], title: 'Threads', key: 'threads', t, te }),
    ).toBe('Threads');
    // Numeric last segment: the key lookup is skipped even when a key exists.
    expect(
      resolveFieldLabel({ labelKeyPrefix: prefix, path: ['rows', '0'], title: 'Row', key: '0', t, te }),
    ).toBe('Row');
  });

  it('resolveFieldDescription returns undefined when neither key nor description exists', () => {
    const { t, te } = fakeI18n({
      'forms.schemaFields.database.threads.description': '线程描述',
    });
    const prefix = 'forms.schemaFields.database.threads';
    expect(
      resolveFieldDescription({ labelKeyPrefix: prefix, path: ['threads'], description: 'Thread desc', t, te }),
    ).toBe('线程描述');
    expect(
      resolveFieldDescription({ labelKeyPrefix: 'forms.schemaFields.database.other', path: ['other'], description: 'Other desc', t, te }),
    ).toBe('Other desc');
    expect(
      resolveFieldDescription({ labelKeyPrefix: 'forms.schemaFields.database.other', path: ['other'], description: undefined, t, te }),
    ).toBeUndefined();
    expect(
      resolveFieldDescription({ labelKeyPrefix: undefined, path: ['threads'], description: 'Thread desc', t, te }),
    ).toBe('Thread desc');
    expect(
      resolveFieldDescription({ labelKeyPrefix: prefix, path: ['rows', '0'], description: 'Row desc', t, te }),
    ).toBe('Row desc');
  });

  it('resolveFieldFocusMeta never fills a missing title with startCase', () => {
    const { t, te } = fakeI18n({
      'forms.schemaFields.database.threads.label': '线程数',
      'forms.schemaFields.database.threads.description': '线程描述',
    });
    const prefix = 'forms.schemaFields.database.threads';
    expect(
      resolveFieldFocusMeta({ labelKeyPrefix: prefix, path: ['threads'], title: 'Threads', description: 'Thread desc', t, te }),
    ).toEqual({ title: '线程数', description: '线程描述' });
    expect(
      resolveFieldFocusMeta({ labelKeyPrefix: 'forms.schemaFields.database.other', path: ['other'], title: undefined, description: undefined, t, te }),
    ).toEqual({ title: undefined, description: undefined });
    expect(
      resolveFieldFocusMeta({ labelKeyPrefix: 'forms.schemaFields.database.other', path: ['other'], title: 'Other', description: undefined, t, te }),
    ).toEqual({ title: 'Other', description: undefined });
    expect(
      resolveFieldFocusMeta({ labelKeyPrefix: prefix, path: ['rows', '0'], title: 'Row', description: 'Row desc', t, te }),
    ).toEqual({ title: 'Row', description: 'Row desc' });
  });

  it('resolveBranchFocusMeta keeps an untitled branch titleless', () => {
    const { t, te } = fakeI18n({
      'forms.schemaFields.database.ownerConfig.branches.b0.label': '分支零',
      'forms.schemaFields.database.ownerConfig.branches.b0.description': '分支零描述',
    });
    const branchFocusPrefix = 'forms.schemaFields.database.ownerConfig.branches.b0';
    expect(
      resolveBranchFocusMeta({ branchFocusPrefix, title: 'Branch Zero', description: 'Branch zero desc', t, te }),
    ).toEqual({ title: '分支零', description: '分支零描述' });
    expect(
      resolveBranchFocusMeta({ branchFocusPrefix, title: undefined, description: 'Branch zero desc', t, te }),
    ).toEqual({ title: undefined, description: '分支零描述' });
    expect(
      resolveBranchFocusMeta({ branchFocusPrefix: 'forms.schemaFields.database.ownerConfig.branches.b1', title: 'Branch One', description: undefined, t, te }),
    ).toEqual({ title: 'Branch One', description: undefined });
    expect(
      resolveBranchFocusMeta({ branchFocusPrefix: undefined, title: 'Branch', description: 'Desc', t, te }),
    ).toEqual({ title: 'Branch', description: 'Desc' });
  });

  it('resolveBranchTitle follows title, type key, formatted type, Option N', () => {
    const { t, te } = fakeI18n({
      'forms.schemaFields.database.ownerConfig.branches.b0.label': '分支标签',
      'forms.schemaFields.branchTypes.string': '字符串',
      'forms.schemaFields.branchTypes.object': '对象',
      'forms.schemaFields.branchOption': '选项 {n}',
    });
    const prefix = 'forms.schemaFields.database.ownerConfig';
    // Key beats the branch title.
    expect(
      resolveBranchTitle({ labelKeyPrefix: prefix, branchIndex: 0, branch: { title: 'Branch Zero' }, t, te }),
    ).toBe('分支标签');
    // Titled branch without a key: formatted title.
    expect(
      resolveBranchTitle({ labelKeyPrefix: prefix, branchIndex: 1, branch: { title: 'DBT S3 Config' }, t, te }),
    ).toBe('dbt S3 Config');
    // Untitled branch with a string type: type key.
    expect(
      resolveBranchTitle({ labelKeyPrefix: prefix, branchIndex: 1, branch: { type: 'string' }, t, te }),
    ).toBe('字符串');
    // Untitled branch whose type has no key: formatted type.
    expect(
      resolveBranchTitle({ labelKeyPrefix: prefix, branchIndex: 1, branch: { type: 'null' }, t, te }),
    ).toBe('Null');
    // Array type or missing type: Option N.
    expect(
      resolveBranchTitle({ labelKeyPrefix: prefix, branchIndex: 1, branch: { type: ['string', 'null'] }, t, te }),
    ).toBe('选项 2');
    expect(
      resolveBranchTitle({ labelKeyPrefix: prefix, branchIndex: 2, branch: {}, t, te }),
    ).toBe('选项 3');
    // No prefix at all: the chain still applies from the title on.
    expect(
      resolveBranchTitle({ labelKeyPrefix: undefined, branchIndex: 0, branch: { type: 'object' }, t, te }),
    ).toBe('对象');
    expect(
      resolveBranchTitle({ labelKeyPrefix: undefined, branchIndex: 2, branch: {}, t, te }),
    ).toBe('选项 3');
  });

  it('resolveBranchDescription requires multiple branches and a string description', () => {
    const { t, te } = fakeI18n({
      'forms.schemaFields.database.ownerConfig.branches.b0.description': '分支零描述',
    });
    const prefix = 'forms.schemaFields.database.ownerConfig';
    expect(
      resolveBranchDescription({ labelKeyPrefix: prefix, branchIndex: 0, branchCount: 1, branch: { description: 'Desc' }, t, te }),
    ).toBeUndefined();
    expect(
      resolveBranchDescription({ labelKeyPrefix: prefix, branchIndex: 0, branchCount: 2, branch: {}, t, te }),
    ).toBeUndefined();
    expect(
      resolveBranchDescription({ labelKeyPrefix: prefix, branchIndex: 0, branchCount: 2, branch: { description: 'Desc' }, t, te }),
    ).toBe('分支零描述');
    expect(
      resolveBranchDescription({ labelKeyPrefix: prefix, branchIndex: 1, branchCount: 2, branch: { description: 'Desc' }, t, te }),
    ).toBe('Desc');
    expect(
      resolveBranchDescription({ labelKeyPrefix: undefined, branchIndex: 0, branchCount: 2, branch: { description: 'Desc' }, t, te }),
    ).toBe('Desc');
  });

  it('resolveEnumOptionLabel prefers the option key over the classificationLanguage special case', () => {
    const { t, te } = fakeI18n({
      'forms.schemaFields.pipeline.ownershipUpdateMode.options.replace': '替换',
    });
    const prefix = 'forms.schemaFields.pipeline.ownershipUpdateMode';
    expect(
      resolveEnumOptionLabel({ labelKeyPrefix: prefix, value: 'replace', key: 'ownershipUpdateMode', t, te }),
    ).toBe('替换');
    expect(
      resolveEnumOptionLabel({ labelKeyPrefix: prefix, value: 'append', key: 'ownershipUpdateMode', t, te }),
    ).toBe('append');
    expect(
      resolveEnumOptionLabel({ labelKeyPrefix: undefined, value: 'english', key: 'classificationLanguage', t, te }),
    ).toBe('English');
    expect(
      resolveEnumOptionLabel({ labelKeyPrefix: undefined, value: 'Auto', key: 'type', t, te }),
    ).toBe('Auto');
    // enumOptionKey rejects values that cannot be key segments.
    expect(enumOptionKey(prefix, 'has space')).toBeUndefined();
    expect(enumOptionKey(prefix, 'has.dot')).toBeUndefined();
    expect(enumOptionKey(prefix, 'ok-value_1')).toBe(
      'forms.schemaFields.pipeline.ownershipUpdateMode.options.ok-value_1',
    );
  });
});
