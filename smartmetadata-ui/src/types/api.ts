/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

export interface JwtResponse {
  accessToken?: string;
  refreshToken?: string;
  tokenType?: string;
  expiryDuration?: number;
}

export interface LoginUser {
  id?: string;
  name?: string;
  email?: string;
  displayName?: string;
}

export interface EntityRef {
  id?: string;
  name: string;
  displayName?: string;
  type?: string;
  fullyQualifiedName?: string;
}

export interface TagRef {
  tagFQN: string;
  name: string;
  source?: 'Classification' | 'Glossary';
}

export interface SearchHit {
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  entityType: string;
  description?: string;
  owners: EntityRef[];
  tags: TagRef[];
}

export interface SearchPage {
  total: number;
  hits: SearchHit[];
}

export interface SchemaRow {
  name: string;
  dataType: string;
  description?: string;
}

export interface AssetDetail {
  entityType: string;
  id?: string;
  name: string;
  displayName?: string;
  fullyQualifiedName: string;
  description?: string;
  owners: EntityRef[];
  tags: TagRef[];
  domains: EntityRef[];
  schemaRows: SchemaRow[];
  schemaLabel: string;
  extension?: Record<string, unknown>;
}
