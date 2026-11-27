import { describe, expect, it } from 'vitest';
import { aggregateTestResultsByEntity } from './testCaseSummary';

describe('aggregateTestResultsByEntity', () => {
  it('rolls official lowercase status rows into per-entity and total counts', () => {
    const result = aggregateTestResultsByEntity([
      {
        document_count: '2',
        entityFQN: 'sample.db.schema.table.address_id',
        'testCaseResult.testCaseStatus': 'success',
      },
      {
        document_count: '1',
        entityFQN: 'sample.db.schema.table.address_id',
        'testCaseResult.testCaseStatus': 'failed',
      },
      {
        document_count: '3',
        entityFQN: 'sample.db.schema.table',
        'testCaseResult.testCaseStatus': 'aborted',
      },
    ]);
    expect(result['sample.db.schema.table.address_id']).toEqual({
      success: 2,
      failed: 1,
      aborted: 0,
      total: 3,
    });
    expect(result['sample.db.schema.table']).toEqual({
      success: 0,
      failed: 0,
      aborted: 3,
      total: 3,
    });
    expect(result.total).toEqual({
      success: 2,
      failed: 1,
      aborted: 3,
      total: 6,
    });
  });

  it('skips rows that are missing an entity or a countable document_count', () => {
    const result = aggregateTestResultsByEntity([
      { document_count: '2', 'testCaseResult.testCaseStatus': 'success' },
      { entityFQN: 't', 'testCaseResult.testCaseStatus': 'failed', document_count: 'n/a' },
    ]);
    expect(result.total).toEqual({ failed: 0, success: 0, aborted: 0, total: 0 });
    expect(result.t).toBeUndefined();
  });
});
