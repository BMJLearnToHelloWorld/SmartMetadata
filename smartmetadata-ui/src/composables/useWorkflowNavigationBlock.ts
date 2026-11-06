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
import { useRoute, useRouter } from 'vue-router';

/**
 * Official useWorkflowNavigationBlock (pin a3012259ca), ported 1:1 in
 * behavior. While enabled it blocks leaving the builder with unsaved
 * changes through three channels: beforeunload, the browser back/forward
 * buttons (popstate), and clicks on internal links. Leaving shows a
 * modal: Save (saves, then proceeds only if the save succeeded), Discard
 * (proceeds), Cancel (stays).
 *
 * Port notes (Vue Router, not React Router):
 * - The popstate listener is registered with capture:true and calls
 *   stopImmediatePropagation, exactly as official does — at the target,
 *   capture listeners run before the router's bubble listener, so the
 *   router never sees the back/forward step while the guard is armed.
 *   The entry is restored with history.go(-delta), as in official; the
 *   second popstate that restore fires is intercepted again and opens
 *   the modal. History positions come from window.history.state.position
 *   (vue-router's equivalent of React Router's idx).
 * - Proceeding after a pop either re-issues the recorded back/forward
 *   step (allowPop lets the router's listener run) or replaces the URL,
 *   as in official.
 * - Programmatic navigation is NOT intercepted: official's
 *   blockProgrammaticNavigation defaults to false and the page never
 *   enables it, so runWithoutBlocking simply runs the action. No
 *   router.beforeEach guard is used, for the same reason.
 */
export interface UseWorkflowNavigationBlockOptions {
  enabled: Ref<boolean>;
  onSaveWorkflow: () => Promise<boolean>;
}

export interface UseWorkflowNavigationBlockReturn {
  showModal: Ref<boolean>;
  isSaveLoading: Ref<boolean>;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  onCancel: () => void;
  runWithoutBlocking: (action: () => void) => void;
}

interface PendingPop {
  delta: number;
  sourceIndex: number;
  state: unknown;
}

function isInternalLink(href: string | null, currentPath: string): href is string {
  return Boolean(
    href?.startsWith('/') && !href.startsWith('//') && href !== currentPath,
  );
}

function preventUnload(event: BeforeUnloadEvent): void {
  event.preventDefault();
  event.returnValue = '';
}

export function useWorkflowNavigationBlock(
  options: UseWorkflowNavigationBlockOptions,
): UseWorkflowNavigationBlockReturn {
  const { enabled, onSaveWorkflow } = options;
  const router = useRouter();
  const route = useRoute();

  const showModal = ref(false);
  const isSaveLoading = ref(false);
  const pendingPathRef = ref<string | null>(null);
  const pendingPopRef = ref<PendingPop | undefined>(undefined);
  const allowPopRef = ref(false);
  const restoringRef = ref(false);
  const currentEntryRef = ref<unknown>(null);

  const currentPath = (): string => route.fullPath;

  const runWithoutBlocking = (action: () => void): void => {
    // Programmatic navigation is never intercepted in this port (official's
    // blockProgrammaticNavigation defaults to false and the page never
    // enables it), so there is nothing to bypass.
    action();
  };

  const clearPending = (): void => {
    pendingPathRef.value = null;
    pendingPopRef.value = undefined;
  };

  const proceed = (): void => {
    const path = pendingPathRef.value;
    const pop = pendingPopRef.value;
    pendingPathRef.value = null;
    pendingPopRef.value = undefined;
    if (pop && path) {
      const currentIndex = (window.history.state as { position?: number } | null)
        ?.position;
      const targetIndex = pop.sourceIndex + pop.delta;
      // A save can push View mode, replacing the original forward entry.
      const targetSurvives =
        typeof currentIndex === 'number' &&
        (currentIndex === pop.sourceIndex || pop.delta < 0);
      if (targetSurvives && targetIndex !== currentIndex) {
        allowPopRef.value = true;
        window.history.go(targetIndex - currentIndex);
      } else {
        runWithoutBlocking(() => {
          void router.replace(path);
        });
      }
    } else if (path) {
      runWithoutBlocking(() => {
        void router.push(path);
      });
    }
  };

  const handlePopState = (event: PopStateEvent): void => {
    if (allowPopRef.value) {
      allowPopRef.value = false;
      return;
    }
    if (restoringRef.value) {
      event.stopImmediatePropagation();
      restoringRef.value = false;
      showModal.value = true;
      return;
    }
    const nextPath =
      window.location.pathname +
      window.location.search +
      window.location.hash;
    if (nextPath === currentPath()) {
      return;
    }
    // Restore the existing entry before the router can unmount the dirty editor.
    event.stopImmediatePropagation();
    pendingPathRef.value = nextPath;
    const previousIndex = (
      currentEntryRef.value as { position?: number } | null
    )?.position;
    const nextIndex = (event.state as { position?: number } | null)?.position;
    if (
      typeof previousIndex === 'number' &&
      typeof nextIndex === 'number' &&
      previousIndex !== nextIndex
    ) {
      pendingPopRef.value = {
        delta: nextIndex - previousIndex,
        sourceIndex: previousIndex,
        state: (event.state as { usr?: unknown } | null)?.usr,
      };
      restoringRef.value = true;
      window.history.go(-pendingPopRef.value.delta);
    } else {
      window.history.replaceState(currentEntryRef.value, '', currentPath());
      showModal.value = true;
    }
  };

  const handleLinkClick = (event: MouseEvent): void => {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    const href = anchor?.getAttribute('href') ?? null;
    const opensElsewhere = [
      event.defaultPrevented,
      event.button !== 0,
      event.ctrlKey,
      event.metaKey,
      event.shiftKey,
      event.altKey,
      anchor?.hasAttribute('download'),
      anchor?.target && anchor.target !== '_self',
    ].some(Boolean);
    if (opensElsewhere || !isInternalLink(href, currentPath())) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    pendingPopRef.value = undefined;
    pendingPathRef.value = href;
    showModal.value = true;
  };

  const addListeners = (): void => {
    allowPopRef.value = false;
    currentEntryRef.value = window.history.state;
    window.addEventListener('beforeunload', preventUnload);
    window.addEventListener('popstate', handlePopState, true);
    document.addEventListener('click', handleLinkClick, true);
  };

  const removeListeners = (): void => {
    window.removeEventListener('beforeunload', preventUnload);
    window.removeEventListener('popstate', handlePopState, true);
    document.removeEventListener('click', handleLinkClick, true);
  };

  watch(
    enabled,
    (isEnabled) => {
      if (isEnabled) {
        addListeners();
      } else {
        removeListeners();
      }
    },
    { immediate: true },
  );

  // The entry the guard restores from can move while the guard is armed
  // (e.g. the ?mode= query flips on entering view mode); keep it fresh.
  watch(
    () => route.fullPath,
    () => {
      if (enabled.value) {
        currentEntryRef.value = window.history.state;
      }
    },
  );

  onUnmounted(() => {
    removeListeners();
  });

  const onSave = async (): Promise<void> => {
    isSaveLoading.value = true;
    let saved = false;
    try {
      saved = await onSaveWorkflow();
    } finally {
      isSaveLoading.value = false;
    }
    showModal.value = false;
    if (saved) {
      proceed();
    } else {
      clearPending();
    }
  };

  const onDiscard = (): void => {
    showModal.value = false;
    proceed();
  };

  const onCancel = (): void => {
    showModal.value = false;
    clearPending();
  };

  return {
    showModal,
    isSaveLoading,
    onSave,
    onDiscard,
    onCancel,
    runWithoutBlocking,
  };
}
