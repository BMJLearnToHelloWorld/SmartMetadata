/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onUnmounted, ref, watch, type Ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';

/**
 * Port of official NavigationBlocker (pin a3012259ca) for Vue Router.
 * While enabled, leaving the route — in-app navigation and the
 * browser back button alike — opens the unsaved-changes confirm
 * instead of navigating; confirming resumes the original navigation,
 * cancelling stays. A same-path query/hash change never trips the
 * guard: vue-router reuses the component for those, so the leave
 * guard does not run, matching pin's pathname-only comparison.
 * Reloads and tab closes are covered by beforeunload, as in pin.
 *
 * Call this in the routed view's setup and render
 * NavigationGuardModal bound to showModal/confirmLeave/cancelLeave.
 * To leave programmatically after a save, set `enabled` false first
 * (pin disarms its blocker the same way via its leaving state)
 * instead of navigating while dirty.
 */
export interface UseNavigationGuardOptions {
  enabled: Ref<boolean> | (() => boolean);
  /** Runs on confirm, before the pending navigation resumes. */
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
}

export interface UseNavigationGuardReturn {
  showModal: Ref<boolean>;
  confirmLeave: () => Promise<void>;
  cancelLeave: () => void;
}

function preventUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = '';
}

export function useNavigationGuard(
  options: UseNavigationGuardOptions,
): UseNavigationGuardReturn {
  const showModal = ref(false);
  let pendingResolve: ((leave: boolean) => void) | null = null;
  let pendingPromise: Promise<boolean> | null = null;
  let unloadArmed = false;

  const isEnabled = (): boolean =>
    typeof options.enabled === 'function' ? options.enabled() : options.enabled.value;

  function armUnload(): void {
    if (!unloadArmed) {
      unloadArmed = true;
      window.addEventListener('beforeunload', preventUnload);
    }
  }

  function disarmUnload(): void {
    if (unloadArmed) {
      unloadArmed = false;
      window.removeEventListener('beforeunload', preventUnload);
    }
  }

  const stopWatch = watch(
    isEnabled,
    (enabled) => {
      if (enabled) {
        armUnload();
      } else {
        disarmUnload();
      }
    },
    { immediate: true },
  );

  onBeforeRouteLeave(() => {
    if (!isEnabled()) {
      return true;
    }
    if (pendingPromise) {
      return pendingPromise;
    }
    showModal.value = true;
    pendingPromise = new Promise<boolean>((resolve) => {
      pendingResolve = resolve;
    });
    return pendingPromise;
  });

  async function confirmLeave(): Promise<void> {
    try {
      await options.onConfirm?.();
    } catch {
      return;
    }
    const resolve = pendingResolve;
    pendingResolve = null;
    pendingPromise = null;
    showModal.value = false;
    disarmUnload();
    resolve?.(true);
  }

  function cancelLeave(): void {
    const resolve = pendingResolve;
    pendingResolve = null;
    pendingPromise = null;
    showModal.value = false;
    options.onCancel?.();
    resolve?.(false);
  }

  onUnmounted(() => {
    stopWatch();
    disarmUnload();
    pendingResolve?.(false);
    pendingResolve = null;
    pendingPromise = null;
  });

  return { showModal, confirmLeave, cancelLeave };
}
