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
 * Axiom (openmetadata-spec entity/data/ontologyAxiom.json): a statement
 * about an ontology's concepts, e.g. a subclass or property restriction.
 */
export interface OntologyAxiom {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  ontology?: EntityRef;
  axiomType?: string;
  subjectIri?: string;
  expressions?: string[];
  propertyIri?: string;
  targetIri?: string;
  literal?: string;
  owners: EntityRef[];
}

/**
 * Sealed release (openmetadata-spec entity/data/ontologyRelease.json):
 * a published snapshot of an ontology.
 */
export interface OntologyRelease {
  id: string;
  name: string;
  displayName?: string;
  fullyQualifiedName?: string;
  description?: string;
  ontology?: EntityRef;
  semanticVersion?: string;
  releaseNotes?: string;
  sealedAt?: number;
  sealedBy?: string;
  memberCount?: number;
  entityStatus?: string;
  owners: EntityRef[];
  reviewers: EntityRef[];
}

/** Library pack module (openmetadata-spec type/ontologyPackModule.json). */
export interface OntologyPackModule {
  id?: string;
  name: string;
  description?: string;
  format?: string;
  conceptCount?: number;
  relationshipCount?: number;
  selectedByDefault?: boolean;
}

/** Library pack manifest (openmetadata-spec api/data/ontologyPackManifest.json). */
export interface OntologyPack {
  id?: string;
  name: string;
  abbreviation?: string;
  standard?: string;
  industry?: string;
  layer?: string;
  version?: string;
  description?: string;
  license?: string;
  sourceUrl?: string;
  bundled?: boolean;
  modules: OntologyPackModule[];
}

/** One bound catalog asset of a concept (type/ontologyConceptBindingsResponse.json). */
export interface OntologyConceptBinding {
  assetType?: string;
  assetId?: string;
  asset?: EntityRef;
  columnCount?: number;
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
