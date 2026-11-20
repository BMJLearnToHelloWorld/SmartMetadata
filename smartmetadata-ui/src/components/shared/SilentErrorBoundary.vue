<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Silent empty-fallback error boundary (B-14(b)).

  Port of the pin's CsvJobsTrayContainer boundary
  (openmetadata-ui/.../CsvJobsTrayContainer.component.tsx:41-49 at pin
  a3012259ca): the tray is non-critical, on-demand UI, so a render
  failure degrades to rendering nothing instead of crashing the
  surrounding subtree. The pin uses the generic react-error-boundary
  with `fallback={<></>}` and no onError/onReset; this is its minimal
  Vue equivalent — no fallback UI, no button, no copy, no remount, no
  recovery, no i18n, no router, no styles.

  Capture scope: onErrorCaptured returning false stops the error
  before app.config.errorHandler, so a boundary-caught error is never
  double-recorded by the main.ts second net (same N-4 rule as
  SmErrorBoundary). Async errors are NOT captured here — that is the
  second net's job; the tray's own async operations already have
  try/catch + inline messages. One console.error per caught error,
  matching SmErrorBoundary's single-record rule, for diagnosis only.
-->
<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';

const hasError = ref(false);

onErrorCaptured((error) => {
  // Single record, no telemetry, no storage, no stack capture.
  console.error(error);
  hasError.value = true;
  // Stop propagation: the main.ts second net must never see (and
  // double-record) an error this boundary already handled.
  return false;
});
</script>

<template>
  <slot v-if="!hasError" />
</template>
