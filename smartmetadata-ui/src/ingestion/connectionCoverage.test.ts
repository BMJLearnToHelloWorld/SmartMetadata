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
  CONNECTION_COVERAGE_ROWS,
  connectionBodyIsEmpty,
  coverageCounts,
  coverageFor,
  decideConnectionGuard,
} from './connectionCoverage';

describe('connectionCoverage ledger', () => {
  it('holds the 40-row universe with the t364 baseline counts', () => {
    expect(CONNECTION_COVERAGE_ROWS).toHaveLength(40);
    expect(coverageCounts()).toEqual({
      covered: 0,
      pending: 24,
      blocked: 16,
      total: 40,
      wizardExposed: 31,
      wizardExcluded: 9,
      noLoader: 6,
    });
  });

  it('keys rows by (kind, type): mlmodel VertexAI is a row, llm VertexAI is not', () => {
    expect(coverageFor('mlmodel', 'VertexAI')).toMatchObject({
      status: 'blocked',
      uncoveredClass: 'A',
      hasLoader: false,
      hasJsonFile: true,
      wizardExposed: false,
    });
    expect(coverageFor('llm', 'VertexAI')).toBeUndefined();
    expect(coverageFor('llm', 'OpenAI')).toBeUndefined();
    expect(coverageFor('mcp', 'Mcp')).toBeUndefined();
    expect(coverageFor('database', 'Nope')).toBeUndefined();
  });

  it('marks the six no-loader types (A/B classes)', () => {
    const noLoader = CONNECTION_COVERAGE_ROWS.filter((row) => !row.hasLoader).map(
      (row) => `${row.kind}:${row.type}`,
    );
    expect(noLoader.sort()).toEqual([
      'api:WEBHOOK',
      'drive:SharePoint',
      'metadata:Alation',
      'metadata:Collibra',
      'metadata:MetadataES',
      'mlmodel:VertexAI',
    ]);
    expect(coverageFor('api', 'WEBHOOK')).toMatchObject({
      uncoveredClass: 'B',
      hasJsonFile: false,
    });
  });

  it('marks the nine wizard-excluded types (Q8 convergence)', () => {
    const excluded = CONNECTION_COVERAGE_ROWS.filter((row) => !row.wizardExposed).map(
      (row) => `${row.kind}:${row.type}`,
    );
    expect(excluded.sort()).toEqual([
      'api:WEBHOOK',
      'drive:SharePoint',
      'metadata:Alation',
      'metadata:Collibra',
      'metadata:MetadataES',
      'metadata:OpenMetadata',
      'mlmodel:Sklearn',
      'mlmodel:VertexAI',
      'security:Ranger',
    ]);
  });

  it('gives every loader row a schema path and no-loader rows none', () => {
    for (const row of CONNECTION_COVERAGE_ROWS) {
      if (row.hasLoader) {
        expect(row.schemaPath).toMatch(/^connections\/[a-z]+\/[a-zA-Z0-9]+Connection\.json$/);
      } else {
        expect(row.schemaPath).toBeUndefined();
      }
    }
    expect(coverageFor('database', 'Postgres')?.schemaPath).toBe(
      'connections/database/postgresConnection.json',
    );
    expect(coverageFor('drive', 'Sftp')?.schemaPath).toBe('connections/drive/sftpConnection.json');
  });

  it('classifies the 16 blocked rows as 5 A + 1 B + 10 C', () => {
    const blocked = CONNECTION_COVERAGE_ROWS.filter((row) => row.status === 'blocked');
    const byClass = { A: 0, B: 0, C: 0 };
    for (const row of blocked) {
      if (row.uncoveredClass) byClass[row.uncoveredClass]++;
    }
    expect(byClass).toEqual({ A: 5, B: 1, C: 10 });
  });
});

describe('decideConnectionGuard', () => {
  it('blocks submit while loading, failed, or empty, whatever the row state', () => {
    for (const state of ['loading', 'failed', 'empty'] as const) {
      for (const coverage of ['covered', 'pending-static', 'blocked'] as const) {
        expect(decideConnectionGuard(state, coverage).connectionSubmitBlocked).toBe(true);
      }
    }
    expect(decideConnectionGuard('loading', 'covered')).toEqual({
      formArea: 'loader',
      connectionSubmitBlocked: true,
    });
    expect(decideConnectionGuard('failed', 'covered')).toEqual({
      formArea: 'load-failed',
      connectionSubmitBlocked: true,
    });
    expect(decideConnectionGuard('empty', 'covered')).toEqual({
      formArea: 'no-config',
      connectionSubmitBlocked: true,
    });
  });

  it('renders a read-only prompt and blocks submit for present + blocked', () => {
    expect(decideConnectionGuard('present', 'blocked')).toEqual({
      formArea: 'read-only-prompt',
      connectionSubmitBlocked: true,
    });
  });

  it('renders the staged form for present + pending-static / covered', () => {
    expect(decideConnectionGuard('present', 'pending-static')).toEqual({
      formArea: 'static-form',
      connectionSubmitBlocked: false,
    });
    expect(decideConnectionGuard('present', 'covered')).toEqual({
      formArea: 'schema-form',
      connectionSubmitBlocked: false,
    });
  });
});

describe('connectionBodyIsEmpty', () => {
  it('treats undefined, empty, and type-only bodies as empty', () => {
    expect(connectionBodyIsEmpty(undefined)).toBe(true);
    expect(connectionBodyIsEmpty({})).toBe(true);
    expect(connectionBodyIsEmpty({ type: 'Postgres' })).toBe(true);
    expect(connectionBodyIsEmpty({ type: 'Postgres', hostPort: undefined })).toBe(true);
  });

  it('treats a body with a filled declared field as non-empty', () => {
    expect(connectionBodyIsEmpty({ type: 'Postgres', hostPort: 'localhost:5432' })).toBe(false);
  });

  it('ignores caller-specified keys such as filter patterns', () => {
    expect(
      connectionBodyIsEmpty({ type: 'Postgres', tableFilterPattern: { includes: ['t'] } }, [
        'tableFilterPattern',
      ]),
    ).toBe(true);
  });
});
