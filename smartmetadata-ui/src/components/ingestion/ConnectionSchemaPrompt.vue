<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { UncoveredClass } from '@/ingestion/connectionCoverage';

/**
 * The T-2 three-state connection prompt (precondition 03 §4.4, t364
 * Q6): load-failed, no-config, and read-only (blocked row) states
 * all reuse the official `no-config-available` testid semantics with
 * explicit bilingual messages. The loader state is not rendered here
 * — the form shows the `connection-schema-loader` spinner while the
 * schema is loading, as the pin does. The blocked-row reasons are
 * product messages (the pin has no blocked concept); the no-config
 * message is the pin's `message.no-config-available` verbatim.
 *
 * A blocked row always carries an uncovered class (ledger invariant);
 * the mapping falls back to the generic no-config message only when
 * the caller passes none.
 */
const props = defineProps<{
  area: 'load-failed' | 'no-config' | 'read-only-prompt';
  uncoveredClass?: UncoveredClass;
}>();

const { t } = useI18n();

const BLOCKED_REASON_KEYS: Record<UncoveredClass, string> = {
  A: 'settings.services.connectionGuard.blockedReasonA',
  B: 'settings.services.connectionGuard.blockedReasonB',
  C: 'settings.services.connectionGuard.blockedReasonC',
};

const messageKey = computed(() => {
  if (props.area === 'load-failed') {
    return 'settings.services.connectionGuard.loadFailed';
  }
  if (props.area === 'read-only-prompt' && props.uncoveredClass) {
    return BLOCKED_REASON_KEYS[props.uncoveredClass];
  }
  return 'settings.services.connectionGuard.noConfigAvailable';
});
</script>

<template>
  <div class="connection-schema-prompt" data-testid="no-config-available">
    {{ t(messageKey) }}
  </div>
</template>

<style scoped>
.connection-schema-prompt {
  padding: 24px 0;
  text-align: center;
  color: var(--hatch-widget-muted, rgba(0, 0, 0, 0.45));
}
</style>
