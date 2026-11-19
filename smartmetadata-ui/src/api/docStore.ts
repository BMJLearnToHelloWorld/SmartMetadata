/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may obtain
 * a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { diffJsonPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import { asRecord, asString, mapEntityRefs } from '@/api/json';
import type { EntityRef } from '@/types/api';
import type {
  CreateDocumentRequest,
  PersonaDocument,
  PersonaPage,
  PersonaPreferences,
} from '@/types/persona';
import { apiRequest } from './client';

/**
 * Official DocStoreAPI (rest/DocStoreAPI.ts): BASE_URL is 'docStore'
 * against the /v1 base, i.e. /v1/docStore.
 */
export const DOCSTORE_BASE = '/v1/docStore';

/**
 * One entry of a persona document's `personaPreferences` or
 * `personPreferences` array, mirroring the official personaPreferences
 * schema. Both arrays share the entry shape; only their owners differ
 * (the persona admin's choices vs a single user's own choices for the
 * persona).
 *
 * C-4 (RB-8) passthrough: the entry is kept verbatim apart from the
 * two retained gates — a non-record or an entry without a personaId
 * is dropped, and a schema-invalid appMode value is dropped. Every
 * other field, including `landingPageSettings` subfields beyond
 * headerColor/headerImage and any unknown field, survives the read,
 * so a PATCH replace of the array cannot lose unedited entry data.
 * `landingPageSettings` is carried verbatim — it is the header-colour
 * write path, and dropping it on read lost the colour before stage D.
 */
function mapPreferences(raw: unknown): PersonaPreferences | null {
  const rec = asRecord(raw);
  const personaId = asString(rec?.personaId);
  if (!rec || !personaId) {
    return null;
  }
  const entry: Record<string, unknown> = { ...rec, personaId };
  if (
    'appMode' in entry &&
    entry.appMode !== 'classic' &&
    entry.appMode !== 'AI'
  ) {
    delete entry.appMode;
  }
  return entry as PersonaPreferences;
}

/**
 * Entity references inside a page entry (knowledgePanels, domains,
 * persona), kept verbatim: the reference record is spread as-is, so
 * subfields the allowlist mapper drops (the R13 schema subfields
 * description, deleted, inherited, href, and any unknown subfield)
 * survive the read and the PATCH replace that writes the pages array
 * back. The spread is cast to EntityRef only for unknown subfields:
 * the four schema subfields are now typed on EntityRef
 * (types/api.ts). Only the pre-existing gate is retained: a
 * non-record, or a record with neither name nor id, is dropped.
 */
function mapPageEntityRefs(value: unknown): EntityRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const rec = asRecord(item);
    if (!rec) {
      return [];
    }
    const name =
      asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName);
    const id = asString(rec.id);
    if (!name && !id) {
      return [];
    }
    // EntityRef.name is required: complete it from the computed
    // fallback (id when no name-like field exists), as mapEntityRefs
    // does, so the spread carries a valid name instead of unknown.
    return [{ ...rec, name: name || id } as EntityRef];
  });
}

function mapPageEntityRef(value: unknown): EntityRef | undefined {
  const rec = asRecord(value);
  if (!rec) {
    return undefined;
  }
  // Same gate and name completion as the plural mapper: a record
  // with neither a name-like field nor an id is dropped, and an
  // id-only record keeps id as its name.
  const name =
    asString(rec.name) || asString(rec.displayName) || asString(rec.fullyQualifiedName);
  const id = asString(rec.id);
  if (!name && !id) {
    return undefined;
  }
  return { ...rec, name: name || id } as EntityRef;
}

/**
 * One page entry, kept verbatim apart from the retained gates: a
 * non-record or an entry without a string pageType is dropped (the
 * official normalizer filters exactly those), a non-string entityType
 * and a non-array tabs value are dropped, and reference fields pass
 * through the verbatim reference mapper. `persona` and `domains` keep
 * their stored values when present and stay absent when absent — the
 * previous mapping forced both to undefined, which the pages replace
 * then wrote back over unedited pages. `layout` is never touched: an
 * array, an object (including `{}`), or any other stored shape is
 * carried as-is; no read-side defaulting happens here (C-4 §4.4).
 */
function mapPageEntry(page: unknown): PersonaPage | null {
  const rec = asRecord(page);
  if (!rec || typeof rec.pageType !== 'string') {
    return null;
  }
  const entry: Record<string, unknown> = { ...rec, pageType: rec.pageType };
  if ('entityType' in entry && typeof entry.entityType !== 'string') {
    delete entry.entityType;
  }
  if ('knowledgePanels' in entry) {
    if (Array.isArray(entry.knowledgePanels)) {
      entry.knowledgePanels = mapPageEntityRefs(entry.knowledgePanels);
    } else {
      delete entry.knowledgePanels;
    }
  }
  if ('persona' in entry) {
    const persona = mapPageEntityRef(entry.persona);
    if (persona) {
      entry.persona = persona;
    } else {
      delete entry.persona;
    }
  }
  if ('domains' in entry) {
    if (Array.isArray(entry.domains)) {
      entry.domains = mapPageEntityRefs(entry.domains);
    } else {
      delete entry.domains;
    }
  }
  if ('tabs' in entry && !Array.isArray(entry.tabs)) {
    delete entry.tabs;
  }
  return entry as PersonaPage;
}

function mapDocument(raw: Record<string, unknown>): PersonaDocument | null {
  const name = asString(raw.name);
  const fullyQualifiedName = asString(raw.fullyQualifiedName);
  if (!name && !fullyQualifiedName) {
    return null;
  }
  const data = asRecord(raw.data) ?? {};
  // C-4 (RB-8): every stored data key is kept, not just the four the
  // previous allowlist rebuilt. Only the array-valued keys the
  // editors address get entry-level mapping, and only when the stored
  // value is an array; a key that is absent stays absent (the PATCH
  // diff reads key presence to choose add vs replace), and a
  // non-array pages value stays verbatim (the normalizer treats a
  // non-array pages container as "no entries" without rewriting it).
  // navigation, askCollateSidebar, and unknown keys ride the spread.
  const mappedData: Record<string, unknown> = { ...data };
  if (Array.isArray(data.pages)) {
    mappedData.pages = data.pages.flatMap((page) => {
      const mapped = mapPageEntry(page);
      return mapped ? [mapped] : [];
    });
  }
  if (Array.isArray(data.personaPreferences)) {
    mappedData.personaPreferences = data.personaPreferences.flatMap((pref) => {
      const mapped = mapPreferences(pref);
      return mapped ? [mapped] : [];
    });
  }
  // Stage D (G-11): the per-user preferences array. Same entry
  // shape as personaPreferences, mapped through the same helper —
  // dropping it here is what lost the header colour on read before
  // this stage (cond. 4).
  if (Array.isArray(data.personPreferences)) {
    mappedData.personPreferences = data.personPreferences.flatMap((pref) => {
      const mapped = mapPreferences(pref);
      return mapped ? [mapped] : [];
    });
  }
  const domains = mapEntityRefs(raw.domains);
  return {
    id: asString(raw.id) || undefined,
    name: name || fullyQualifiedName,
    fullyQualifiedName: fullyQualifiedName || name,
    entityType: asString(raw.entityType) || 'Page',
    data: mappedData as PersonaDocument['data'],
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
 * Empty-document template for a persona document that 404s (official
 * customize-page shape): name `<personaName>-<fqn>`, entityType Page,
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
 *
 * C-4 §3.3 (b*): the PATCH is a per-data-key diff of the whole `data`
 * object — the same diff shape the shared `diffJsonPatch` helper
 * already provides — instead of a hand-listed subtree comparison. A
 * key present in the stored document and changed emits `replace`; a
 * key absent in the stored document emits `add`; a key removed emits
 * `remove`; unchanged keys emit nothing, so "no change, no request"
 * holds and keys no callback writes (including `askCollateSidebar`)
 * are never touched. The op choice follows key presence, as the
 * official whole-document `compare` does; the missing-path trigger
 * condition itself is unconfirmed (C-4 §3.3 defect 2), and is
 * recorded as mechanism non-equivalence with an unconfirmed trigger,
 * not as an established failure.
 */
export async function savePersonaDocument(
  document: PersonaDocument,
  mutate: (draft: PersonaDocument) => void,
): Promise<PersonaDocument> {
  const draft: PersonaDocument = JSON.parse(JSON.stringify(document)) as PersonaDocument;
  mutate(draft);
  if (document.id) {
    const patch: JsonPatchOp[] = diffJsonPatch(document.data, draft.data).map((op) => ({
      ...op,
      path: `/data${op.path}`,
    }));
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
