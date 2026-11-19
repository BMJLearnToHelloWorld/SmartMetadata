/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { computed, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue';
import {
  coverageFor,
  decideConnectionGuard,
  type ConnectionCoverageRow,
  type ConnectionGuardDecision,
  type SchemaLoadState,
} from '@/ingestion/connectionCoverage';
import {
  loadConnectionSchemaJson,
  type FetchConnectionSchema,
} from '@/ingestion/connectionSchemaLoader';

/**
 * The T-2 guard as a composable (precondition 03 §4.3): combines the
 * schema-load signal (S) with the matrix row state (C) through the
 * single decision function `decideConnectionGuard`. Both the submit
 * button's disabled state and the submit handler's final assertion
 * read `decision` — the two enforcement points never re-derive the
 * condition.
 *
 * For out-of-universe pairs (llm/mcp kinds, unknown types) the guard
 * is not applicable: `decision` is null and the caller keeps its
 * existing behavior (C-2 reserved surface, §5.4 anti-expansion rule).
 * The load effect follows the pin ConnectionConfigForm pattern: a
 * cancellation token drops stale resolutions when the type changes.
 */
export interface UseConnectionGuardReturn {
  schemaState: Ref<SchemaLoadState>;
  schema: Ref<Record<string, unknown> | undefined>;
  coverage: ComputedRef<ConnectionCoverageRow | undefined>;
  decision: ComputedRef<ConnectionGuardDecision | null>;
  /** True when the guard applies and blocks a new connection body. */
  connectionSubmitBlocked: ComputedRef<boolean>;
  reload: () => void;
}

export function useConnectionGuard(
  kind: Ref<string> | (() => string),
  type: Ref<string> | (() => string),
  fetchFn?: FetchConnectionSchema,
): UseConnectionGuardReturn {
  const kindOf = (): string => (typeof kind === 'function' ? kind() : kind.value);
  const typeOf = (): string => (typeof type === 'function' ? type() : type.value);

  const schemaState = ref<SchemaLoadState>('loading');
  const schema = ref<Record<string, unknown> | undefined>(undefined);
  const loadToken = ref(0);
  const reloadToken = ref(0);
  let disposed = false;

  const coverage = computed(() => coverageFor(kindOf(), typeOf()));

  const decision = computed<ConnectionGuardDecision | null>(() => {
    const row = coverage.value;
    if (!row) {
      return null;
    }
    return decideConnectionGuard(schemaState.value, row.status);
  });

  const connectionSubmitBlocked = computed(() => decision.value?.connectionSubmitBlocked ?? false);

  async function load(): Promise<void> {
    const token = ++loadToken.value;
    schemaState.value = 'loading';
    schema.value = undefined;
    try {
      const result = await loadConnectionSchemaJson(kindOf(), typeOf(), fetchFn);
      if (disposed || token !== loadToken.value) {
        return;
      }
      if (result.state === 'present') {
        schema.value = result.schema;
        schemaState.value = 'present';
      } else {
        schemaState.value = 'empty';
      }
    } catch {
      if (disposed || token !== loadToken.value) {
        return;
      }
      schemaState.value = 'failed';
    }
  }

  watch(
    [() => kindOf(), () => typeOf(), reloadToken],
    () => {
      void load();
    },
    { immediate: true },
  );

  onUnmounted(() => {
    disposed = true;
  });

  return {
    schemaState,
    schema,
    coverage,
    decision,
    connectionSubmitBlocked,
    reload: () => {
      reloadToken.value++;
    },
  };
}
