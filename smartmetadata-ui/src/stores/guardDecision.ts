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
 * Guard-decision store (DESIGN §10, D-3). When the router guard
 * denies a navigation, the navigation still completes (the URL is
 * unchanged) and the AppShell slot renders the shared placeholder
 * instead of the matched component. This store carries that
 * decision, bound to the target navigation and the principal it
 * was made for: a decision only applies to its own fullPath under
 * its own principal, so a stale decision can never blank a
 * different page or leak across an identity change. The router's
 * beforeEach writes the decision for every navigation (allow and
 * deny alike); its afterEach sweeps a decision whose fullPath
 * differs from the settled route.
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

export interface GuardDecisionRecord {
  fullPath: string;
  principalKey: string | null;
  denied: boolean;
}

/** The principal identity a guard decision is bound to. */
export function principalKeyFor(
  user: { name?: string; id?: string } | null | undefined,
): string | null {
  return user?.name ?? user?.id ?? null;
}

export const useGuardDecisionStore = defineStore('guardDecision', () => {
  const decision = ref<GuardDecisionRecord | null>(null);

  const isDenied = computed(() => decision.value?.denied === true);

  function setDecision(record: GuardDecisionRecord): void {
    decision.value = record;
  }

  function clearDecision(): void {
    decision.value = null;
  }

  /** Whether the current decision denies this path for this principal. */
  function isDeniedFor(fullPath: string, principalKey: string | null): boolean {
    return (
      decision.value !== null &&
      decision.value.denied &&
      decision.value.fullPath === fullPath &&
      decision.value.principalKey === principalKey
    );
  }

  /** Drops a decision that belongs to a different settled route. */
  function clearIfStale(settledFullPath: string): void {
    if (decision.value !== null && decision.value.fullPath !== settledFullPath) {
      decision.value = null;
    }
  }

  return { decision, isDenied, setDecision, clearDecision, isDeniedFor, clearIfStale };
});
