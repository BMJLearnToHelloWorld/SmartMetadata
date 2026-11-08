/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { ApiError } from '@/api/client';
import { listGlossaries } from '@/api/glossaries';
import {
  listOntologies,
  listOntologyAxioms,
  listOntologyConcepts,
  listOntologyProperties,
} from '@/api/ontology';
import type { Paged } from '@/types/admin';
import type { Glossary } from '@/types/governance';
import type { Ontology } from '@/types/ontology';
import {
  buildOntologyModelGraph,
  type OntologyGraphData,
  type OntologyStudioModel,
} from './ontologyGraph';

/** Re-exported: the loaders return this model, so callers import it here. */
export type { OntologyStudioModel } from './ontologyGraph';

/**
 * Aggregate ontology loading (official hooks/governance/ontology/
 * useOntologyStudioModel.ts: useAllOntologyStudioModels /
 * countAggregateOntologies / loadOntologyStudioModel, Vue port).
 *
 * Budget (ADR:2026-11-08-ontology-browser-aggregate-capacity): per
 * ontology PAGE_SIZE 1000 with a 10-page cap; the aggregate holds at
 * most 20 ontologies and 2000 definitions. Past the budget the loader
 * throws AggregateCapacityError and the page shows a capacity
 * placeholder with per-ontology open actions — never a silent
 * truncation. An ontology deleted between the list and its definition
 * requests (404) is skipped, not fatal.
 */
export class AggregateCapacityError extends Error {
  constructor() {
    super('Ontology aggregate exceeds the 2000-definition capacity');
    this.name = 'AggregateCapacityError';
  }
}

export const ONTOLOGY_PAGE_SIZE = 1000;
export const MAX_ONTOLOGY_DEFINITION_PAGES = 10;
export const MAX_AGGREGATE_ONTOLOGIES = 20;
export const MAX_AGGREGATE_DEFINITIONS = 2000;
export const SCOPE_PAGE_SIZE = 100;
export const MAX_SCOPE_PAGES = 100;

/** Official skipDeleted: a 404 means "gone since the list", skip it. */
async function skipDeleted<T>(load: () => Promise<T>): Promise<T | undefined> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return undefined;
    }
    throw error;
  }
}

/** Cursor pager with a hard page cap; consume sees every page's size. */
export async function loadPagedAll<T>(
  loadPage: (after?: string) => Promise<Paged<T>>,
  maxPages: number,
  consume?: (count: number) => void,
): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const response = await loadPage(after);
    items.push(...response.data);
    consume?.(response.data.length);
    after = response.after;
    if (!after) {
      break;
    }
  }
  return items;
}

/** One ontology's full model: concepts/properties/axioms paged in full. */
export async function loadOntologyModel(
  ontology: Ontology,
  consume?: (count: number) => void,
): Promise<OntologyStudioModel | undefined> {
  return skipDeleted(async () => {
    const fqn = ontology.fullyQualifiedName || ontology.name;
    const loadPages = <T>(loadPage: (after?: string) => Promise<Paged<T>>): Promise<T[]> =>
      loadPagedAll(loadPage, MAX_ONTOLOGY_DEFINITION_PAGES, consume);
    const [concepts, properties, axioms] = await Promise.all([
      loadPages((after) =>
        listOntologyConcepts({ after, limit: ONTOLOGY_PAGE_SIZE, ontology: fqn }),
      ),
      loadPages((after) =>
        listOntologyProperties({ after, limit: ONTOLOGY_PAGE_SIZE, ontology: fqn }),
      ),
      loadPages((after) =>
        listOntologyAxioms({ after, limit: ONTOLOGY_PAGE_SIZE, ontologyId: ontology.id }),
      ),
    ]);
    return { axioms, concepts, ontology, properties };
  });
}

/**
 * Official countAggregateOntologies: sequential limit:1 probes per
 * ontology; the summed paging.total decides the budget before any
 * definition is fetched. A missing total is an error, not a zero.
 */
export async function countAggregateOntologies(
  ontologies: readonly Ontology[],
): Promise<Ontology[]> {
  let total = 0;
  const present: Ontology[] = [];
  for (const ontology of ontologies) {
    const fqn = ontology.fullyQualifiedName || ontology.name;
    if (!fqn) {
      throw new Error('Missing ontology name');
    }
    const countPages = (): Promise<Array<Paged<unknown>>> =>
      Promise.all([
        listOntologyConcepts({ limit: 1, ontology: fqn }),
        listOntologyProperties({ limit: 1, ontology: fqn }),
        listOntologyAxioms({ limit: 1, ontologyId: ontology.id }),
      ]);
    const pages = await skipDeleted(countPages);
    if (!pages) {
      continue;
    }
    present.push(ontology);
    for (const page of pages) {
      if (!Number.isFinite(page.total) || (page.total ?? 0) < 0) {
        throw new Error('Missing definition count');
      }
      total += page.total ?? 0;
    }
    if (total > MAX_AGGREGATE_DEFINITIONS) {
      throw new AggregateCapacityError();
    }
  }
  return present;
}

/** Official useAllOntologyStudioModels query: budget, then sequential loads. */
export async function loadAggregateModels(
  ontologies: readonly Ontology[],
): Promise<OntologyStudioModel[]> {
  if (ontologies.length > MAX_AGGREGATE_ONTOLOGIES) {
    throw new AggregateCapacityError();
  }
  const present = await countAggregateOntologies(ontologies);
  let loaded = 0;
  const consume = (count: number): void => {
    loaded += count;
    if (loaded > MAX_AGGREGATE_DEFINITIONS) {
      throw new AggregateCapacityError();
    }
  };
  const models: OntologyStudioModel[] = [];
  for (const ontology of present) {
    const model = await skipDeleted(() => loadOntologyModel(ontology, consume));
    if (model) {
      models.push(model);
    }
  }
  return models;
}

/** The aggregate graph is the per-ontology model graphs concatenated. */
export function buildAggregateGraph(models: readonly OntologyStudioModel[]): OntologyGraphData {
  const graphs = models.map((model) => buildOntologyModelGraph(model));
  return {
    edges: graphs.flatMap((graph) => graph.edges),
    nodes: graphs.flatMap((graph) => graph.nodes),
  };
}

/** Scope-menu lists (official useOntologyStudioScopes: SCOPE_PAGE_SIZE). */
export async function listAllOntologies(): Promise<Ontology[]> {
  return loadPagedAll((after) => listOntologies({ after, limit: SCOPE_PAGE_SIZE }), MAX_SCOPE_PAGES);
}

export async function listAllGlossaries(): Promise<Glossary[]> {
  return loadPagedAll((after) => listGlossaries({ after, limit: SCOPE_PAGE_SIZE }), MAX_SCOPE_PAGES);
}
