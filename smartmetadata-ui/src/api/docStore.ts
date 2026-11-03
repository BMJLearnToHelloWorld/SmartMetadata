/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import { asRecord, asString, mapEntityRefs } from '@/api/json';
import type { EntityRef } from '@/types/api';
import type {
  CreateDocumentRequest,
  PersonaDocument,
  PersonaPreferences,
} from '@/types/persona';
import { apiRequest } from './client';

/**
 * Official DocStoreAPI (rest/DocStoreAPI.ts): BASE_URL is 'docStore'
 * against the /v1 base, i.e. /v1/docStore.
 */
export const DOCSTORE_BASE = '/v1/docStore';

function mapDocument(raw: Record<string, unknown>): PersonaDocument | null {
  const name = asString(raw.name);
  const fullyQualifiedName = asString(raw.fullyQualifiedName);
  if (!name && !fullyQualifiedName) {
    return null;
  }
  const data = asRecord(raw.data) ?? {};
  const pagesRaw = Array.isArray(data.pages) ? data.pages : [];
  const prefsRaw = Array.isArray(data.personaPreferences) ? data.personaPreferences : [];
  const domains = mapEntityRefs(raw.domains);
  return {
    id: asString(raw.id) || undefined,
    name: name || fullyQualifiedName,
    fullyQualifiedName: fullyQualifiedName || name,
    entityType: asString(raw.entityType) || 'Page',
    data: {
      pages: pagesRaw.flatMap((page) => {
        const rec = asRecord(page);
        if (!rec || typeof rec.pageType !== 'string') {
          return [];
        }
        return [
          {
            pageType: rec.pageType as string,
            entityType: asString(rec.entityType) || undefined,
            // Official page layout is a WidgetConfig array; asRecord
            // rejects arrays, so an array layout must be kept verbatim
            // or the B3-6 reader's page-level fallback could never fire.
            layout: Array.isArray(rec.layout)
              ? (rec.layout as unknown[])
              : (asRecord(rec.layout) ?? undefined),
            knowledgePanels: mapEntityRefs(rec.knowledgePanels),
            tabs: Array.isArray(rec.tabs) ? (rec.tabs as never[]) : undefined,
            persona: undefined,
            domains: undefined,
          },
        ];
      }),
      personaPreferences: prefsRaw.flatMap((pref) => {
        const rec = asRecord(pref);
        const personaId = asString(rec?.personaId);
        if (!rec || !personaId) {
          return [];
        }
        return [
          {
            personaId,
            personaName: asString(rec.personaName) || undefined,
            appMode:
              rec.appMode === 'classic' || rec.appMode === 'AI' ? rec.appMode : undefined,
            defaultLandingPage: asString(rec.defaultLandingPage) || undefined,
            defaultViewModes: asRecord(rec.defaultViewModes) as PersonaPreferences['defaultViewModes'],
          },
        ];
      }),
      navigation: data.navigation,
    },
    domains: domains.length ? domains : undefined,
  };
}

/**
 * Official docStoreQuery personaDocFqn: `persona.<personaFqn>`; null
 * when the persona has no FQN (disabled query guard).
 */
export function personaDocFqn(personaFqn?: string | null): string | null {
  return personaFqn ? `persona.${personaFqn}` : null;
}

/**
 * Official PersonaCustomizeView empty-document template, used when the
 * persona document 404s: name `<personaName>-<fqn>`, entityType Page,
 * empty pages, navigation null. It has no id, so saving it creates.
 */
export function emptyPersonaDocument(personaName: string, personaFqn: string): PersonaDocument {
  return {
    name: `${personaName}-${personaFqn}`,
    fullyQualifiedName: personaDocFqn(personaFqn) as string,
    entityType: 'Page',
    data: { pages: [], navigation: null },
  };
}

/** Official getAllKnowledgePanels: GET /v1/docStore?fqnPrefix&limit. */
export async function listDocuments(query: { fqnPrefix: string; limit: number }): Promise<PersonaDocument[]> {
  const payload = await apiRequest<unknown>(DOCSTORE_BASE, {
    query: { fqnPrefix: query.fqnPrefix, limit: query.limit },
  });
  const root = asRecord(payload);
  const rows = Array.isArray(root?.data) ? root.data : [];
  return rows.flatMap((row) => {
    const mapped = mapDocument(asRecord(row) ?? {});
    return mapped ? [mapped] : [];
  });
}

/** Official getDocumentByFQN: GET /v1/docStore/name/{fqn}. */
export async function getDocumentByFqn(fqn: string): Promise<PersonaDocument> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${DOCSTORE_BASE}/name/${encodeURIComponent(fqn)}`,
  );
  const mapped = mapDocument(raw);
  if (!mapped) {
    throw new Error('Document response was missing name and fullyQualifiedName');
  }
  return mapped;
}

/** Official createDocument: POST /v1/docStore. */
export async function createDocument(data: CreateDocumentRequest): Promise<PersonaDocument> {
  const raw = await apiRequest<Record<string, unknown>>(DOCSTORE_BASE, { json: data });
  const mapped = mapDocument(raw);
  if (!mapped) {
    throw new Error('Create document succeeded but the response had no document');
  }
  return mapped;
}

/** Official updateDocument: PATCH /v1/docStore/{id} with JSON Patch ops. */
export async function updateDocument(id: string, patch: JsonPatchOp[]): Promise<PersonaDocument> {
  const raw = await apiRequest<Record<string, unknown>>(
    `${DOCSTORE_BASE}/${encodeURIComponent(id)}`,
    { method: 'PATCH', json: patch, contentType: 'application/json-patch+json' },
  );
  const mapped = mapDocument(raw);
  if (!mapped) {
    throw new Error('Update document succeeded but the response had no document');
  }
  return mapped;
}

/**
 * Official savePersonaDocument (customizeEditor.utils): clone, mutate,
 * then PATCH the diff when the document already exists, else create.
 * The customize editors only ever mutate data.pages and
 * data.personaPreferences, so the patch replaces exactly the subtrees
 * that changed (deep-compared) instead of a whole-object diff — same
 * effect, and the ops stay reviewable.
 */
export async function savePersonaDocument(
  document: PersonaDocument,
  mutate: (draft: PersonaDocument) => void,
): Promise<PersonaDocument> {
  const draft: PersonaDocument = JSON.parse(JSON.stringify(document)) as PersonaDocument;
  mutate(draft);
  if (document.id) {
    const patch: JsonPatchOp[] = [];
    if (JSON.stringify(draft.data.pages ?? []) !== JSON.stringify(document.data.pages ?? [])) {
      patch.push({ op: 'replace', path: '/data/pages', value: draft.data.pages ?? [] });
    }
    if (
      JSON.stringify(draft.data.personaPreferences ?? []) !==
      JSON.stringify(document.data.personaPreferences ?? [])
    ) {
      patch.push({
        op: 'replace',
        path: '/data/personaPreferences',
        value: draft.data.personaPreferences ?? [],
      });
    }
    if (!patch.length) {
      return document;
    }
    return updateDocument(document.id, patch);
  }
  const createBody: CreateDocumentRequest = {
    name: draft.name,
    fullyQualifiedName: draft.fullyQualifiedName,
    entityType: draft.entityType,
    data: draft.data,
    domains: draft.domains?.map((domain) => domain.fullyQualifiedName).filter(Boolean) as string[] | undefined,
  };
  return createDocument(createBody);
}
