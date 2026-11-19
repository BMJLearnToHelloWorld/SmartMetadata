<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<!--
  Shared application error boundary (ported from official
  `components/common/ErrorBoundary/ErrorBoundary.tsx` +
  `ErrorFallback.tsx` at pin a3012259ca, per 07 §3 + R-PEND1).

  Mounted in App.vue inside ConfigProvider, wrapping <router-view/>
  only (LimitBanner/CsvJobsTray stay outside — deliberate framework
  adaptation: the Vue boundary replaces the AppShell subtree, not the
  whole app chrome).

  Recovery is Home navigation FIRST, then error-state clear + subtree
  remount via an incremented :key. There is no fullPath auto-reset and
  no "retry current page" button. The fallback renders no error-prone
  logic: plain template + one button.

  Chunk failures reach the same state through router.onError (dynamic
  import failures surface there). The chunk predicate is verbatim from
  ErrorFallback.tsx:44-50. The chunk variant omits official's brand
  illustration (no product asset exists); the heading text carries the
  meaning.

  Capture scope (N-4): onErrorCaptured returning false stops the error
  before app.config.errorHandler, so a boundary-caught error is never
  double-recorded by the main.ts second net. Async errors (rejected
  promises outside render/lifecycle) are NOT captured here — that is
  the second net's job, and its no-double-record behavior must be
  verified by experiment, not claimed from source.
-->
<script setup lang="ts">
import { Button } from 'ant-design-vue';
import { computed, onBeforeUnmount, onErrorCaptured, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';

const { t } = useI18n();
const router = useRouter();

const hasError = ref(false);
const caughtError = ref<unknown>(null);
const remountKey = ref(0);

// Port of ErrorFallback.tsx:22-25.
function getErrorMessage(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : String(error ?? '');
}

function getErrorName(error: unknown): unknown {
  return typeof error === 'object' && error !== null && 'name' in error
    ? (error as { name?: unknown }).name
    : undefined;
}

// Port of ErrorFallback.tsx:44-50 (verbatim predicate).
function isChunkLoadError(error: unknown): boolean {
  const errorMessage = getErrorMessage(error);
  const errorName = getErrorName(error);
  return (
    errorName === 'ChunkLoadError' ||
    errorMessage.startsWith('Loading chunk') || // Legacy Webpack
    errorMessage.toLowerCase().includes('failed to fetch dynamically imported module') || // Vite
    errorMessage.toLowerCase().includes('importing a module script failed') // Vite (Safari)
  );
}

const errorMessage = computed(() =>
  hasError.value ? getErrorMessage(caughtError.value) : '',
);
const showChunkVariant = computed(
  () => hasError.value && isChunkLoadError(caughtError.value),
);

function recordError(error: unknown): void {
  // Single console.error, no telemetry, no storage, no stack capture.
  console.error(error);
  caughtError.value = error;
  hasError.value = true;
}

onErrorCaptured((error) => {
  recordError(error);
  // Stop propagation: the main.ts second net must never see (and
  // double-record) an error this boundary already handled.
  return false;
});

let unregisterRouterError: (() => void) | undefined;
onMounted(() => {
  unregisterRouterError = router.onError((error) => {
    if (isChunkLoadError(error)) {
      recordError(error);
    }
  });
});
onBeforeUnmount(() => {
  unregisterRouterError?.();
});

async function recoverToHome(): Promise<void> {
  // Home navigation FIRST, then clear + remount — even if the
  // navigation itself fails (e.g. already on home).
  try {
    await router.push({ name: 'home' });
  } catch {
    // Navigation failure must not leave the fallback stuck.
  } finally {
    caughtError.value = null;
    hasError.value = false;
    remountKey.value += 1;
  }
}

function refreshPage(): void {
  // Full reload, mirroring official's navigate(0).
  router.go(0);
}
</script>

<template>
  <div v-if="!hasError" :key="remountKey">
    <slot />
  </div>
  <div
    v-else-if="showChunkVariant"
    data-testid="upgrade-screen"
    class="sm-error-fallback sm-error-fallback--chunk"
  >
    <div class="sm-error-fallback__body">
      <h1 class="sm-error-fallback__title">
        {{ `${t('errors.upgradeAvailable')} ✨` }}
      </h1>
      <p class="sm-error-fallback__message">{{ t('errors.upgradeRefreshHint') }}</p>
      <Button
        type="primary"
        size="large"
        data-testid="refresh-page-btn"
        @click="refreshPage"
      >
        {{ t('errors.refreshPage') }}
      </Button>
    </div>
  </div>
  <div v-else class="sm-error-fallback">
    <div class="sm-error-fallback__body">
      <h1 class="sm-error-fallback__title">{{ t('errors.somethingWentWrong') }}</h1>
      <p v-if="errorMessage" class="sm-error-fallback__message">{{ errorMessage }}</p>
      <Button type="primary" @click="recoverToHome">
        {{ t('errors.backHome') }}
      </Button>
    </div>
  </div>
</template>

<style>
.sm-error-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 48px 32px;
  text-align: center;
}
.sm-error-fallback--chunk {
  overflow-y: auto;
  background: var(--sm-content-bg);
  padding: 32px;
}
.sm-error-fallback__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  max-width: 640px;
}
.sm-error-fallback__title {
  margin: 0;
  font-size: 30px;
  font-weight: 600;
  line-height: 38px;
  color: var(--sm-text-primary);
}
.sm-error-fallback__message {
  margin: 0;
  font-size: 14px;
  color: var(--sm-text-secondary);
}
.sm-error-fallback--chunk .sm-error-fallback__message {
  font-size: 16px;
  color: var(--sm-text-tertiary);
}
</style>
