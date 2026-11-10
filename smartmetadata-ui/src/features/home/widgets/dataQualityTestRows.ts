/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { TestCase } from '@/types/quality';

/** How the card's test list is arranged. */
export type DataQualityGroupBy = 'table' | 'testCase';

export interface DataQualityTableGroup {
  tableFqn: string;
  tests: TestCase[];
  passed: number;
  failed: number;
  aborted: number;
}

/**
 * The table a test runs on, read off the entity link
 * (`<#E::table::{fqn}::columns::{column}>`) directly rather than through
 * the ANTLR parser, which this card has no other reason to load.
 */
export function getTestTableFqn(entityLink?: string): string {
  const parts = (entityLink ?? '').replace(/^<#E::|>$/g, '').split('::');
  return parts[1] ?? '';
}

/**
 * The column a test runs on, or none for a table-level test. Read off the
 * entity link directly rather than through the ANTLR parser, which this
 * card has no other reason to load.
 */
export function getTestColumnName(entityLink?: string): string | undefined {
  const parts = (entityLink ?? '').replace(/^<#E::|>$/g, '').split('::');
  return parts[2] === 'columns' ? parts[3] : undefined;
}

function statusOf(test: TestCase): string | undefined {
  return test.testCaseResult?.testCaseStatus;
}

/**
 * The tests under the table each runs on, tables in the order their first
 * test appears — the rows arrive failures first, so the table needing the most
 * attention leads.
 */
export function groupTestsByTable(tests: TestCase[]): DataQualityTableGroup[] {
  const groups = new Map<string, DataQualityTableGroup>();

  for (const test of tests) {
    const tableFqn = getTestTableFqn(test.entityLink);
    const group: DataQualityTableGroup = groups.get(tableFqn) ?? {
      tableFqn,
      tests: [],
      passed: 0,
      failed: 0,
      aborted: 0,
    };
    group.tests.push(test);
    const status = statusOf(test);
    if (status === 'Success') {
      group.passed += 1;
    } else if (status === 'Failed') {
      group.failed += 1;
    } else if (status === 'Aborted') {
      group.aborted += 1;
    }
    groups.set(tableFqn, group);
  }

  return Array.from(groups.values());
}
