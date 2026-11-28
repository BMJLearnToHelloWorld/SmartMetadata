import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DQ_DASHBOARD_FILTER_PAGE_SIZE,
  composeDqFilterSearchQ,
  fetchDqDashboardCertificationOptions,
  fetchDqDashboardDataProductOptions,
  fetchDqDashboardGlossaryTermOptions,
  fetchDqDashboardTagOptions,
  fetchDqDashboardTierOptions,
} from './dqDashboardFilterOptions';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}

describe('dqDashboardFilterOptions (official useDataQualityDashboardFilters)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses official PAGE_SIZE_BASE and concatenates Lucene filters onto q', () => {
    expect(DQ_DASHBOARD_FILTER_PAGE_SIZE).toBe(15);
    expect(composeDqFilterSearchQ('*', 'disabled:false AND classification.name:Tier')).toBe(
      '* AND disabled:false AND classification.name:Tier',
    );
    expect(composeDqFilterSearchQ('gold', 'disabled:false AND classification.name:Tier')).toBe(
      '*gold* AND disabled:false AND classification.name:Tier',
    );
    expect(composeDqFilterSearchQ('gold')).toBe('*gold*');
  });

  it('queries tag/tier/cert indexes with official filter strings', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://local.test');
        calls.push(`${url.searchParams.get('index')}|${url.searchParams.get('q')}`);
        const index = url.searchParams.get('index');
        const name = index === 'dataProduct' ? 'dp' : 'Sensitive';
        const fqn = index === 'dataProduct' ? 'Domain.dp' : 'PII.Sensitive';
        return jsonResponse({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _source: {
                  name,
                  displayName: name,
                  fullyQualifiedName: fqn,
                  classification: { name: 'PII' },
                },
              },
            ],
          },
        });
      }),
    );

    const tags = await fetchDqDashboardTagOptions();
    expect(tags[0]).toEqual({ value: 'PII.Sensitive', label: 'PII.Sensitive' });
    expect(calls[0]).toContain('tag|');
    expect(calls[0]).toContain('!classification.name:Tier');

    await fetchDqDashboardTierOptions('gold');
    expect(calls[1]).toContain('tag|*gold* AND disabled:false AND classification.name:Tier');

    await fetchDqDashboardCertificationOptions();
    expect(calls[2]).toContain('classification.name:Certification');

    const glossary = await fetchDqDashboardGlossaryTermOptions('term');
    expect(glossary[0]?.value).toBe('PII.Sensitive');
    expect(calls[3]).toBe('glossaryTerm|*term*');

    const products = await fetchDqDashboardDataProductOptions();
    expect(products[0]?.label).toBe('dp');
    expect(calls[4]).toBe('dataProduct|*');
  });

  it('swallows search failures and returns an empty list', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    await expect(fetchDqDashboardTagOptions('x')).resolves.toEqual([]);
  });
});