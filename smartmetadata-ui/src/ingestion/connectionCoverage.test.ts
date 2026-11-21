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
  it('holds the 39-row universe with the T-2 counts (39 covered, WEBHOOK removed)', () => {
    expect(CONNECTION_COVERAGE_ROWS).toHaveLength(39);
    expect(coverageCounts()).toEqual({
      covered: 39,
      pending: 0,
      blocked: 0,
      total: 39,
      wizardExposed: 31,
      wizardExcluded: 8,
      noLoader: 5,
    });
  });

  it('gives every row a filled six-grid verdict (T-2 §1.4)', () => {
    for (const row of CONNECTION_COVERAGE_ROWS) {
      expect(row.status).toBe('covered');
      expect(row.verdict).toBeDefined();
      for (const cell of [
        'schemaSource',
        'branches',
        'required',
        'secretKeep',
        'serialization',
        'tests',
      ] as const) {
        expect(row.verdict?.[cell].length).toBeGreaterThan(0);
      }
    }
  });

  it('keys rows by (kind, type): mlmodel VertexAI is a covered row, llm VertexAI is not', () => {
    expect(coverageFor('mlmodel', 'VertexAI')).toMatchObject({
      status: 'covered',
      hasLoader: false,
      hasJsonFile: true,
      hasStaticGroup: true,
      wizardExposed: false,
      schemaPath: 'connections/mlmodel/vertexaiConnection.json',
    });
    expect(coverageFor('mlmodel', 'VertexAI')?.uncoveredClass).toBeUndefined();
    expect(coverageFor('llm', 'VertexAI')).toBeUndefined();
    expect(coverageFor('llm', 'OpenAI')).toBeUndefined();
    expect(coverageFor('mcp', 'Mcp')).toBeUndefined();
    expect(coverageFor('database', 'Nope')).toBeUndefined();
  });

  it('has no WEBHOOK row: the type exists only in the enum, with no connection form', () => {
    expect(coverageFor('api', 'WEBHOOK')).toBeUndefined();
    expect(
      CONNECTION_COVERAGE_ROWS.some((row) => row.type === 'WEBHOOK'),
    ).toBe(false);
  });

  it('marks the five no-loader types (A class, all covered by the A2 ruling)', () => {
    const noLoader = CONNECTION_COVERAGE_ROWS.filter((row) => !row.hasLoader).map(
      (row) => `${row.kind}:${row.type}`,
    );
    expect(noLoader.sort()).toEqual([
      'drive:SharePoint',
      'metadata:Alation',
      'metadata:Collibra',
      'metadata:MetadataES',
      'mlmodel:VertexAI',
    ]);
    for (const row of CONNECTION_COVERAGE_ROWS.filter((entry) => !entry.hasLoader)) {
      expect(row.status).toBe('covered');
      expect(row.hasStaticGroup).toBe(true);
    }
  });

  it('marks the eight wizard-excluded types (Q8 convergence)', () => {
    const excluded = CONNECTION_COVERAGE_ROWS.filter((row) => !row.wizardExposed).map(
      (row) => `${row.kind}:${row.type}`,
    );
    expect(excluded.sort()).toEqual([
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

  it('gives every row a well-formed schema path; no-loader rows carry the A-class product equivalent', () => {
    for (const row of CONNECTION_COVERAGE_ROWS) {
      expect(row.schemaPath).toMatch(/^connections\/[a-z]+\/[a-zA-Z0-9]+Connection\.json$/);
    }
    expect(coverageFor('database', 'Postgres')?.schemaPath).toBe(
      'connections/database/postgresConnection.json',
    );
    expect(coverageFor('drive', 'Sftp')?.schemaPath).toBe('connections/drive/sftpConnection.json');
    expect(coverageFor('metadata', 'Alation')?.schemaPath).toBe(
      'connections/metadata/alationConnection.json',
    );
    expect(coverageFor('metadata', 'MetadataES')?.schemaPath).toBe(
      'connections/metadata/metadataESConnection.json',
    );
  });

  it('has no blocked rows left: the T-2 flip cleared the 10 class-C rows', () => {
    expect(CONNECTION_COVERAGE_ROWS.filter((row) => row.status === 'blocked')).toEqual([]);
    expect(
      CONNECTION_COVERAGE_ROWS.filter((row) => row.uncoveredClass !== undefined),
    ).toEqual([]);
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
