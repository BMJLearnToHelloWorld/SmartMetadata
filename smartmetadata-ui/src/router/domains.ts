/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * Domain split scheme for the router (Stage 1 contract, Stage 2 split).
 * The official AppRouter splits routes into domain sub-routers
 * (Entity, Glossary, Domain, Classification, Settings, EntityImport,
 * ...); the product router is still one flat file. This data table is
 * the contract Stage 2 splits against — it is not itself a split, and
 * the flat router file must not grow new structure on top of it.
 * Every product route belongs to exactly one group; unknown paths
 * map to null (they fall through to the catch-all NotFoundView).
 */
export interface RouteDomainGroup {
  key: string;
  prefixes: string[];
}

export const ROUTE_DOMAIN_GROUPS: RouteDomainGroup[] = [
  { key: 'auth', prefixes: ['/login', '/forbidden'] },
  { key: 'home', prefixes: ['/my-data'] },
  { key: 'discover', prefixes: ['/search', '/assets'] },
  { key: 'insights', prefixes: ['/insights'] },
  { key: 'lineage', prefixes: ['/lineage'] },
  { key: 'admin', prefixes: ['/admin'] },
  { key: 'governance', prefixes: ['/governance', '/govern'] },
  { key: 'marketplace', prefixes: ['/marketplace'] },
  { key: 'context-center', prefixes: ['/context-center'] },
  { key: 'quality', prefixes: ['/quality'] },
  { key: 'observability', prefixes: ['/observability'] },
  { key: 'ingestion', prefixes: ['/ingestion'] },
  { key: 'collaboration', prefixes: ['/activity', '/tasks', '/announcements'] },
];

export function domainForPath(path: string): string | null {
  const normalized = path === '/' ? '/my-data' : path;
  for (const group of ROUTE_DOMAIN_GROUPS) {
    if (group.prefixes.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
      return group.key;
    }
  }
  return null;
}
