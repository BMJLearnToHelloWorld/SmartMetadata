/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { asRecord } from '@/api/json';
import { mapChangeDescription, type EntityVersion } from '@/api/entities';
import type { GovernanceVersionKind } from '@/catalog/versionPaths';
import { apiRequest } from './client';

/**
 * Governance / test-case version history, mirroring the official
 * per-kind version calls (rest/domainAPI.ts getDomainVersionsList /
 * getDomainVersionData, rest/glossaryAPI.ts getGlossaryVersionsList /
 * getGlossaryVersion / getGlossaryTermsVersionsList /
 * getGlossaryTermsVersion, rest/tagAPI.ts
 * getClassificationVersionsList / getClassificationVersionData, and
 * the generic /v1/{collection}/{id}/versions pattern for test cases):
 * GET /v1/{collection}/{id}/versions (EntityHistory.versions) and
 * GET /v1/{collection}/{id}/versions/{version} (the full entity at
 * that version). The snapshot is returned as a raw record: the
 * snapshot view renders the shared name / displayName / description
 * fields plus the changeDescription diff, the same two surfaces the
 * official version pages render, without inventing a per-kind mapper.
 */
export const GOVERNANCE_VERSION_COLLECTIONS: Record<GovernanceVersionKind, string> = {
  domain: 'domains',
  glossary: 'glossaries',
  term: 'glossaryTerms',
  classification: 'classifications',
  testCase: 'testCases',
};

export async function listGovernanceVersions(kind: GovernanceVersionKind, id: string): Promise<EntityVersion[]> {
  const collection = GOVERNANCE_VERSION_COLLECTIONS[kind];
  const body = await apiRequest<Record<string, unknown>>(
    `/v1/${collection}/${encodeURIComponent(id)}/versions`,
  );
  const versions = body.versions;
  if (!Array.isArray(versions)) {
    return [];
  }
  return versions.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const version = rec.version;
    return [
      {
        version: typeof version === 'number' || typeof version === 'string' ? version : undefined,
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : undefined,
        updatedBy: typeof rec.updatedBy === 'string' ? rec.updatedBy : undefined,
        changeDescription: mapChangeDescription(rec.changeDescription),
      },
    ];
  });
}

export async function getGovernanceVersion(
  kind: GovernanceVersionKind,
  id: string,
  version: string,
): Promise<Record<string, unknown>> {
  const collection = GOVERNANCE_VERSION_COLLECTIONS[kind];
  const raw = await apiRequest<Record<string, unknown>>(
    `/v1/${collection}/${encodeURIComponent(id)}/versions/${encodeURIComponent(version)}`,
  );
  return raw ?? {};
}

/**
 * Detail-page deep link: fetch the kind's version list and return the
 * newest version's snapshot path (numeric max, falling back to the
 * first listed entry). Returns null when the entity has no versions
 * instead of navigating to a snapshot that does not exist.
 */
export async function latestGovernanceVersionPath(
  kind: GovernanceVersionKind,
  id: string,
  buildPath: (version: string) => string,
): Promise<string | null> {
  const versions = await listGovernanceVersions(kind, id);
  const numbered = versions.flatMap((item) => {
    const numeric = typeof item.version === 'number' ? item.version : Number(item.version);
    return Number.isFinite(numeric) ? [{ numeric, raw: String(item.version) }] : [];
  });
  if (numbered.length > 0) {
    numbered.sort((a, b) => b.numeric - a.numeric);
    return buildPath(numbered[0].raw);
  }
  const first = versions.find((item) => item.version !== undefined);
  return first ? buildPath(String(first.version)) : null;
}
