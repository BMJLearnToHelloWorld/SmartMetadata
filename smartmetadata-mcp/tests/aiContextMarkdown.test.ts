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
  emptyFindContextMessage,
  renderFound,
  toJsonItem,
  type KnowledgeItem,
} from '../src/aiContextMarkdown.js';

const FOUND: KnowledgeItem[] = [
  {
    id: '1',
    type: 'glossaryTerm',
    name: 'Revenue',
    displayName: 'Revenue',
    fullyQualifiedName: 'Business.Revenue',
    parent: 'Business',
    childrenCount: 3,
    content: 'Revenue is the money a business earns.',
    contentTruncated: false,
    stale: false,
    staleReasons: [],
  },
  {
    id: '2',
    type: 'metric',
    name: 'total_revenue',
    fullyQualifiedName: 'Metrics.total_revenue',
    content: 'x'.repeat(2100),
    contentTruncated: true,
    stale: true,
    staleReasons: ['definition changed 2 days ago'],
  },
  {
    id: '3',
    type: 'page',
    name: 'Q3 report',
    fullyQualifiedName: 'Pages.q3-report',
    content: 'Quarterly numbers.',
    contentTruncated: false,
    stale: false,
  },
];

describe('renderFound', () => {
  it('renders definitions, metrics and articles in order with candidate assets', () => {
    const markdown = renderFound(FOUND, [
      { fqn: 'svc.db.orders', entityType: 'table', via: 'metric total_revenue' },
    ]);
    expect(markdown).toBe(
      '# Relevant Knowledge\n' +
        '\n### Revenue (Glossary Term)\n' +
        '`Business.Revenue`\n' +
        'parent: "Business"\n' +
        'childrenCount: 3\n' +
        'Revenue is the money a business earns.' +
        '\n### total_revenue (Metric)\n' +
        '`Metrics.total_revenue`\n' +
        'x'.repeat(2000) +
        '…' +
        '\n_⚠ Stale — definition changed 2 days ago. Weigh this against the asset\'s current state before relying on it for decisions._\n' +
        '\n_Excerpt — fetch the full content with get_knowledge_content(entityType="metric", fqn="Metrics.total_revenue")._\n' +
        '\n### Q3 report (Article)\n' +
        '`Pages.q3-report`\n' +
        'Quarterly numbers.' +
        '\n# Candidate Assets\n' +
        '\n- `svc.db.orders` (table) — via `metric total_revenue`\n',
    );
  });

  it('renders an empty result as a bare heading', () => {
    expect(renderFound([], [])).toBe('# Relevant Knowledge\n');
  });

  it('omits parent and childrenCount lines when absent', () => {
    const markdown = renderFound(
      [
        {
          type: 'contextMemory',
          name: 'pill',
          fullyQualifiedName: 'pill.one',
          content: 'c',
        },
      ],
      [],
    );
    expect(markdown).not.toContain('parent:');
    expect(markdown).not.toContain('childrenCount:');
    expect(markdown).toContain('### pill (Knowledge Pill)');
  });
});

describe('toJsonItem', () => {
  it('adds a 150-char summary and keeps metricGroup', () => {
    const item = toJsonItem({
      ...FOUND[1],
      metricGroup: { fullyQualifiedName: 'g' },
    });
    expect(item.summary).toBe('x'.repeat(150) + '…');
    expect(item.metricGroup).toEqual({ fullyQualifiedName: 'g' });
    expect(item.content).toBe('x'.repeat(2100));
  });
});

describe('emptyFindContextMessage', () => {
  it('names the query', () => {
    expect(emptyFindContextMessage('revenue')).toBe(
      'No company knowledge found for this query: revenue.',
    );
  });
});
