/**
 * Edit-connection three-way merge (pin: EditConnectionFormPage.tsx:126-189,
 * ServiceUtilClassBase.getEditConfigData:529-551).
 *
 * The pin's edit page saves in two stages. Step 1 (connection form) merges the
 * emitted config shallowly into the stored connection via getEditConfigData;
 * step 2 (filters form) rebuilds the whole entity from three config layers —
 * stored, step-1, filter values — then JSON-Patches the difference against
 * the fetched entity and skips the request entirely when the patch is empty.
 * These pure helpers port that structure verbatim so the view stays a thin
 * orchestration layer and the merge is unit-testable without a mount.
 */
import { compare } from 'fast-json-patch';

import type { JsonPatchOp } from '@/admin/jsonPatch';
import type { CatalogService, ServiceConnectionConfig } from '@/types/ingestion';

/**
 * Pin getEditConfigData (ServiceUtilClassBase.ts:529-551): shallow-merge the
 * emitted connection config into the stored connection config, preserving
 * every stored key the form did not emit (supports* flags, unmodeled keys).
 * When there is no emitted data the entity is returned unchanged; when the
 * entity has no connection the emitted data is dropped (the pin merges only
 * into an existing connection — the step-2 rebuild below is what creates a
 * connection object for a connectionless service).
 */
export function getEditConfigData(
  service: CatalogService,
  data: ServiceConnectionConfig | undefined,
): CatalogService {
  if (!data) {
    return service;
  }
  const updated = { ...service };
  if (updated.connection) {
    updated.connection = {
      ...updated.connection,
      config: {
        ...updated.connection.config,
        ...data,
      },
    };
  }
  return updated;
}

/**
 * Pin handleFiltersSave config rebuild (EditConnectionFormPage.tsx:136-148):
 * three layers, later wins — stored config, step-1 config, filter values.
 * The `typeof === 'object'` guards are the pin's own: a missing or
 * non-object layer contributes nothing.
 */
export function mergeEditConfig(
  originalConfig: unknown,
  step1Config: unknown,
  filterValues: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...(typeof originalConfig === 'object' ? originalConfig : {}),
    ...(typeof step1Config === 'object' ? step1Config : {}),
    ...filterValues,
  };
}

/**
 * Pin handleFiltersSave diff (EditConnectionFormPage.tsx:150-153): compare the
 * fetched entity against the rebuilt entity with fast-json-patch's `compare`
 * (the pin's own library). `compare` only ever emits add/remove/replace ops,
 * so the result narrows to the project's JsonPatchOp shape.
 */
export function buildEditPatch(
  original: CatalogService,
  merged: CatalogService,
): JsonPatchOp[] {
  return compare(original, merged).map((op) => ({
    op: op.op as JsonPatchOp['op'],
    path: op.path,
    value: 'value' in op ? op.value : undefined,
  }));
}
