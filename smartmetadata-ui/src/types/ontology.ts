/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from './api';

/**
 * Ontology entity shape (openmetadata-spec entity/data/ontology.json):
 * identity + description + iri/namespace/layer + owners/reviewers +
 * publicationStatus. Concepts and properties are separate collections
 * filtered by the ontology fqn.
 */
export interface Ontology {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  owners: EntityRef[];
  reviewers: EntityRef[];
  version?: number;
  updatedAt?: number;
  updatedBy?: string;
  iri?: string;
  namespace?: string;
  layer?: string;
  publicationStatus?: string;
  deleted?: boolean;
}

export interface OntologyConcept {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  iri?: string;
  conceptType?: string;
  synonyms?: string[];
  superClasses?: EntityRef[];
  subClasses?: EntityRef[];
  lifecycleStatus?: string;
  deprecated?: boolean;
  owners: EntityRef[];
}

export interface OntologyProperty {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  iri?: string;
  kind?: string;
  domain?: string;
  range?: string;
  enumValues?: string[];
  unit?: string;
  isIdentifier?: boolean;
  owners: EntityRef[];
}

/**
 * Create contract (openmetadata-spec api/data/createOntology.json):
 * only name, iri and namespace are required.
 */
export interface CreateOntologyRequest {
  name: string;
  iri: string;
  namespace: string;
  displayName?: string;
  description?: string;
}
