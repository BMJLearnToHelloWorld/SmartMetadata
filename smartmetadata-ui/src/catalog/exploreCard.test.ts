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
import type { SearchHit } from '@/types/api';
import {
  cardBreadcrumbs,
  cardDescriptionNeedles,
  cardDisplayName,
  cardMatches,
  cardNameNeedles,
  highlightNeedles,
  shouldPrefetchCard,
} from './exploreCard';

function hit(partial: Partial<SearchHit>): SearchHit {
  return {
    name: 'orders',
    fullyQualifiedName: 'svc.db.schema.orders',
    entityType: 'table',
    owners: [],
    tags: [],
    ...partial,
  };
}

describe('cardBreadcrumbs', () => {
  it('builds service → database → schema for tables, linking the FQN-addressed crumbs', () => {
    const crumbs = cardBreadcrumbs(
      hit({
        serviceName: 'BigQuery Prod',
        serviceFqn: 'bigquery',
        databaseName: 'analytics',
        databaseFqn: 'bigquery.analytics',
        schemaName: 'marts',
        schemaFqn: 'bigquery.analytics.marts',
      }),
    );
    expect(crumbs).toEqual([
      { label: 'BigQuery Prod' },
      { label: 'analytics', routeName: 'asset', routeParams: { entityType: 'database', fqn: 'bigquery.analytics' } },
      { label: 'marts', routeName: 'asset', routeParams: { entityType: 'databaseSchema', fqn: 'bigquery.analytics.marts' } },
    ]);
  });

  it('leaves crumbs unlinked when the source carries no FQN for them', () => {
    const crumbs = cardBreadcrumbs(
      hit({ serviceName: 'BigQuery Prod', databaseName: 'analytics', schemaName: 'marts' }),
    );
    expect(crumbs).toEqual([{ label: 'BigQuery Prod' }, { label: 'analytics' }, { label: 'marts' }]);
  });

  it('ends a column trail at the parent table, never the column itself', () => {
    const crumbs = cardBreadcrumbs(
      hit({
        entityType: 'tableColumn',
        name: 'order_id',
        fullyQualifiedName: 'svc.db.schema.orders.order_id',
        serviceName: 'BigQuery Prod',
        databaseName: 'analytics',
        schemaName: 'marts',
        tableName: 'Orders',
        tableFqn: 'svc.db.schema.orders',
      }),
    );
    expect(crumbs.map((crumb) => crumb.label)).toEqual(['BigQuery Prod', 'analytics', 'marts', 'Orders']);
    expect(crumbs[3]).toEqual({
      label: 'Orders',
      routeName: 'asset',
      routeParams: { entityType: 'table', fqn: 'svc.db.schema.orders' },
    });
  });

  it('shows service only for topics and other service-only types', () => {
    expect(
      cardBreadcrumbs(hit({ entityType: 'topic', fullyQualifiedName: 'kafka.events', serviceName: 'Kafka' })),
    ).toEqual([{ label: 'Kafka' }]);
    expect(
      cardBreadcrumbs(hit({ entityType: 'databaseSchema', serviceName: 'BigQuery Prod', databaseName: 'analytics', databaseFqn: 'bq.analytics' })),
    ).toEqual([
      { label: 'BigQuery Prod' },
      { label: 'analytics', routeName: 'asset', routeParams: { entityType: 'database', fqn: 'bq.analytics' } },
    ]);
  });

  it('renders no trail for glossary terms, tags and data products (no routable parent)', () => {
    expect(cardBreadcrumbs(hit({ entityType: 'glossaryTerm', serviceName: undefined }))).toEqual([]);
    expect(cardBreadcrumbs(hit({ entityType: 'tag' }))).toEqual([]);
    expect(cardBreadcrumbs(hit({ entityType: 'dataProduct' }))).toEqual([]);
  });
});

describe('cardMatches', () => {
  it('lists hit fields with fragment counts, excluding .ngram and name fields', () => {
    expect(
      cardMatches({
        description: ['<span class="text-highlighter">orders</span> daily'],
        'columns.name': ['a', 'b'],
        'columns.description.ngram': ['x'],
        table_name: ['Orders'],
        topic_name: ['events'],
        dashboard_name: ['Sales'],
        pipeline_name: ['etl'],
      }),
    ).toEqual([
      { key: 'description', label: 'Description', value: 1 },
      { key: 'columns.name', label: 'Columns Name', value: 2 },
    ]);
  });

  it('returns no rows without highlight', () => {
    expect(cardMatches(undefined)).toEqual([]);
    expect(cardMatches({})).toEqual([]);
  });
});

describe('highlightNeedles', () => {
  it('pulls the matched terms out of the ES highlight spans', () => {
    expect(
      highlightNeedles(
        {
          displayName: ['<span class="text-highlighter">Orders</span>'],
          description: [
            'Daily <span class="text-highlighter">orders</span> and <em>shipments</em> report',
          ],
        },
        ['displayName', 'description'],
      ),
    ).toEqual(['Orders', 'orders', 'shipments']);
  });

  it('dedupes needles and ignores fragments without a highlight wrapper', () => {
    expect(
      highlightNeedles({ description: ['plain text', '<span class="text-highlighter">orders</span>'] }, ['description']),
    ).toEqual(['orders']);
  });
});

describe('cardDisplayName', () => {
  it('prefers the ES highlight fragments over the stored display name', () => {
    expect(
      cardDisplayName(
        hit({
          displayName: 'Orders',
          highlight: { displayName: ['<span class="text-highlighter">Ord</span>ers'] },
        }),
      ),
    ).toBe('Orders');
    expect(cardDisplayName(hit({ displayName: 'Orders' }))).toBe('Orders');
    expect(cardDisplayName(hit({ displayName: undefined, name: 'orders' }))).toBe('orders');
  });
});

describe('cardNameNeedles / cardDescriptionNeedles', () => {
  it('splits needles by name vs description fields', () => {
    const source = hit({
      highlight: {
        name: ['<span class="text-highlighter">orders</span>'],
        description: ['Daily <span class="text-highlighter">orders</span>'],
      },
    });
    expect(cardNameNeedles(source)).toEqual(['orders']);
    expect(cardDescriptionNeedles(source)).toEqual(['orders']);
  });
});

describe('shouldPrefetchCard', () => {
  it('prefetches only table, dashboard, pipeline and topic', () => {
    for (const type of ['table', 'dashboard', 'pipeline', 'topic']) {
      expect(shouldPrefetchCard(type)).toBe(true);
    }
    for (const type of ['mlmodel', 'container', 'glossaryTerm', 'tableColumn']) {
      expect(shouldPrefetchCard(type)).toBe(false);
    }
  });
});
