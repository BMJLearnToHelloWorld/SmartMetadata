/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AggregateCapacityError,
  buildAggregateGraph,
  countAggregateOntologies,
  loadAggregateModels,
  loadOntologyModel,
  MAX_AGGREGATE_DEFINITIONS,
  type OntologyStudioModel,
} from './ontologyAggregate';
import * as ontologyApi from '@/api/ontology';
import { ApiError } from '@/api/client';
import type { Paged } from '@/types/admin';
import type { Ontology, OntologyConcept } from '@/types/ontology';

function ontology(partial: Partial<Ontology> = {}): Ontology {
  return {
    id: 'o1',
    name: 'sales',
    fullyQualifiedName: 'sales',
    owners: [],
    reviewers: [],
    ...partial,
  } as Ontology;
}

function concept(partial: Partial<OntologyConcept> = {}): OntologyConcept {
  return {
    id: 'c1',
    name: 'Customer',
    owners: [],
    ...partial,
  };
}

function paged<T>(data: T[], total?: number): Paged<T> {
  return {
    data,
    total: total ?? data.length,
    after: undefined,
    before: undefined,
  };
}

describe('loadOntologyModel', () => {
  beforeEach(() => {
    vi.spyOn(ontologyApi, 'listOntologyConcepts').mockResolvedValue(paged([concept()]));
    vi.spyOn(ontologyApi, 'listOntologyProperties').mockResolvedValue(paged([]));
    vi.spyOn(ontologyApi, 'listOntologyAxioms').mockResolvedValue(paged([]));
  });
  afterEach(() => vi.restoreAllMocks());

  it('pages all three definition lists in parallel for one ontology', async () => {
    const ont = ontology();
    const model = await loadOntologyModel(ont);
    expect(ontologyApi.listOntologyConcepts).toHaveBeenCalledWith({
      after: undefined,
      limit: 1000,
      ontology: 'sales',
    });
    expect(ontologyApi.listOntologyProperties).toHaveBeenCalledWith({
      after: undefined,
      limit: 1000,
      ontology: 'sales',
    });
    expect(ontologyApi.listOntologyAxioms).toHaveBeenCalledWith({
      after: undefined,
      limit: 1000,
      ontologyId: 'o1',
    });
    expect(model?.concepts).toHaveLength(1);
    expect(model?.ontology).toBe(ont);
  });

  it('follows cursors to the full list', async () => {
    vi.mocked(ontologyApi.listOntologyConcepts)
      .mockResolvedValueOnce({ data: [concept({ id: 'c1', name: 'A' })], total: 2, after: 'cursor-1', before: undefined })
      .mockResolvedValueOnce(paged([concept({ id: 'c2', name: 'B' })], 2));
    const model = await loadOntologyModel(ontology());
    expect(model?.concepts.map((concept) => concept.id)).toEqual(['c1', 'c2']);
    expect(ontologyApi.listOntologyConcepts).toHaveBeenCalledWith({
      after: 'cursor-1',
      limit: 1000,
      ontology: 'sales',
    });
  });
});

describe('countAggregateOntologies / loadAggregateModels', () => {
  beforeEach(() => {
    vi.spyOn(ontologyApi, 'listOntologies').mockResolvedValue(paged([]));
    vi.spyOn(ontologyApi, 'listOntologyConcepts').mockResolvedValue(paged([]));
    vi.spyOn(ontologyApi, 'listOntologyProperties').mockResolvedValue(paged([]));
    vi.spyOn(ontologyApi, 'listOntologyAxioms').mockResolvedValue(paged([]));
  });
  afterEach(() => vi.restoreAllMocks());

  it('sums probe totals and refuses a missing total', async () => {
    vi.mocked(ontologyApi.listOntologyConcepts).mockResolvedValue(paged([], 40));
    vi.mocked(ontologyApi.listOntologyProperties).mockResolvedValue(paged([], 3));
    vi.mocked(ontologyApi.listOntologyAxioms).mockResolvedValue(paged([], 7));
    const present = await countAggregateOntologies([ontology(), ontology({ id: 'o2' })]);
    expect(present.map((item) => item.id)).toEqual(['o1', 'o2']);
    vi.mocked(ontologyApi.listOntologyConcepts).mockResolvedValue({ data: [], total: undefined, after: undefined, before: undefined });
    await expect(countAggregateOntologies([ontology()])).rejects.toThrow('Missing definition count');
  });

  it('throws AggregateCapacityError when probe totals pass 2000', async () => {
    vi.mocked(ontologyApi.listOntologyConcepts).mockResolvedValue(paged([], MAX_AGGREGATE_DEFINITIONS + 1));
    await expect(countAggregateOntologies([ontology()])).rejects.toBeInstanceOf(AggregateCapacityError);
    await expect(loadAggregateModels([ontology()])).rejects.toBeInstanceOf(AggregateCapacityError);
  });

  it('throws mid-load when the running count passes 2000 even with small probes', async () => {
    // Probe totals say 10, but the full page carries 2001 concepts.
    const many = Array.from({ length: MAX_AGGREGATE_DEFINITIONS + 1 }, (_, i) => concept({ id: `c${i}`, name: `C${i}` }));
    vi.mocked(ontologyApi.listOntologyConcepts).mockImplementation(async (_query) => {
      if (!_query.after) return { data: many, total: 10, after: undefined, before: undefined };
      return paged([]);
    });
    await expect(loadAggregateModels([ontology()])).rejects.toBeInstanceOf(AggregateCapacityError);
  });

  it('skips a deleted ontology (404) instead of failing the aggregate', async () => {
    const gone = new ApiError(404, 'Not found');
    vi.mocked(ontologyApi.listOntologyConcepts)
      .mockRejectedValueOnce(gone)
      .mockResolvedValue(paged([]));
    vi.mocked(ontologyApi.listOntologyProperties).mockRejectedValueOnce(gone).mockResolvedValue(paged([]));
    vi.mocked(ontologyApi.listOntologyAxioms).mockRejectedValueOnce(gone).mockResolvedValue(paged([]));
    const models = await loadAggregateModels([ontology({ id: 'gone' }), ontology({ id: 'o2' })]);
    expect(models).toHaveLength(1);
    expect(models[0]?.ontology.id).toBe('o2');
  });

  it('refuses more than 20 ontologies up front', async () => {
    const ontologies = Array.from({ length: 21 }, (_, i) => ontology({ id: `o${i}` }));
    await expect(loadAggregateModels(ontologies)).rejects.toBeInstanceOf(AggregateCapacityError);
    expect(ontologyApi.listOntologyConcepts).not.toHaveBeenCalled();
  });
});

describe('buildAggregateGraph', () => {
  it('concatenates per-model graphs', () => {
    const modelA: OntologyStudioModel = {
      ontology: ontology(),
      concepts: [{ id: 'c1', name: 'Customer', iri: 'https://example.com#Customer', owners: [] }],
      properties: [],
      axioms: [],
    };
    const modelB: OntologyStudioModel = {
      ontology: ontology({ id: 'o2', name: 'shop' }),
      concepts: [{ id: 'c2', name: 'Order', iri: 'https://example.com#Order', owners: [] }],
      properties: [],
      axioms: [],
    };
    const graph = buildAggregateGraph([modelA, modelB]);
    expect(graph.nodes.map((node) => node.id)).toEqual(['c1', 'c2']);
    expect(graph.nodes[1]?.ontologyId).toBe('o2');
  });
});
