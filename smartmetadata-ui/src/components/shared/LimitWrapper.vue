<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Skeleton, Tooltip } from 'ant-design-vue';
import { getLimitByResource, type ResourceLimit } from '@/api/limits';
import { useLimitBannerStore, startCase } from '@/stores/limitBanner';
import { useShellConfigStore } from '@/stores/shellConfig';

/**
 * Official LimitWrapper (hoc/LimitWrapper.tsx) equivalent: gates a
 * creation entry on the limit API for one resource.
 *
 * Semantics, verbatim from official:
 * - config.enable is false, or the resource's currentCount is -1, or
 *   the limit fetch fails -> render children ungated (fail-open: a
 *   quota hint must never block an entry, the opposite of permission
 *   failures, which are fail-closed —
 *   ADR:2026-11-07-metrics-list-permissions-and-limits).
 * - loading -> skeleton.
 * - limitReached -> the entry is disabled with a tooltip showing
 *   `currentCount/hardLimit`; the overlay swallows clicks, and the
 *   slot prop `limitReached` lets the consumer bind `disabled` on its
 *   own button (Vue has no React-style child cloning).
 *
 * No consumer in this batch: the metrics create button lands with the
 * Wave 2 drawer and wraps itself as
 * `<LimitWrapper resource="metric">`. The shell store loads the config
 * at startup (App.vue -> loadShellConfig); a wrapper mounted before
 * that fetch lands triggers it once itself so the gate never depends
 * on mount order.
 */
const props = defineProps<{ resource: string }>();

const { t } = useI18n();
const shellConfig = useShellConfigStore();
const banner = useLimitBannerStore();

const resourceLimit = ref<ResourceLimit | null>(null);
const loading = ref(false);
const failed = ref(false);

const firstStatus = computed(() => resourceLimit.value?.featureLimitStatuses[0]);
const currentCount = computed(() => firstStatus.value?.currentCount);
const hardLimit = computed(() => firstStatus.value?.configuredLimit.limits.hardLimit);
const limitReached = computed(() => firstStatus.value?.limitReached === true);
/**
 * Fail-open passthrough: limits disabled, the server reports no count
 * (-1), or the fetch failed. A null resourceLimit on its own is NOT a
 * passthrough — it is the loading state below.
 */
const passthrough = computed(
  () => !shellConfig.limit?.enable || currentCount.value === -1 || failed.value,
);

const resourceLabel = computed(() =>
  props.resource === 'metric' ? t('metrics.title') : startCase(props.resource),
);
const limitMessage = computed(() =>
  t('limits.reached', {
    resource: resourceLabel.value,
    current: currentCount.value ?? 0,
    limit: hardLimit.value ?? 0,
  }),
);

async function loadResourceLimit(): Promise<void> {
  if (!shellConfig.limit?.enable || loading.value) {
    return;
  }
  loading.value = true;
  failed.value = false;
  try {
    resourceLimit.value = await getLimitByResource(props.resource);
    // Stage D (G-11): the fetched status also drives the global
    // banner — a limit at or over its threshold sets it, exactly as
    // official's LimitWrapper does. A non-exceeding status leaves
    // the banner alone.
    if (firstStatus.value) {
      banner.maybeShowLimitBanner({
        status: firstStatus.value,
        header: t('server.entityLimitReached', { entity: resourceLabel.value }),
        plan: shellConfig.limit?.limits.config.plan || 'FREE',
      });
    }
  } catch {
    // Fail-open: a limit fetch failure renders the wrapped entry.
    failed.value = true;
    resourceLimit.value = null;
  } finally {
    loading.value = false;
  }
}

// Official parity: unmounting a LimitWrapper clears the banner details.
onUnmounted(() => {
  banner.clearBannerDetails();
});

onMounted(() => {
  if (!shellConfig.limit && !shellConfig.limitLoading) {
    void shellConfig.loadLimitConfig().then(() => {
      void loadResourceLimit();
    });
    return;
  }
  void loadResourceLimit();
});

watch(
  () => shellConfig.limit?.enable,
  (enabled) => {
    if (enabled) {
      void loadResourceLimit();
    }
  },
);
</script>

<template>
  <span v-if="passthrough" class="limit-wrapper">
    <slot :limit-reached="false" :current-count="currentCount" :hard-limit="hardLimit" />
  </span>
  <span v-else-if="loading" class="limit-wrapper" data-testid="limit-wrapper-loading">
    <Skeleton :active="true" :paragraph="false" :title="{ width: '100%' }" />
  </span>
  <span v-else-if="limitReached" class="limit-wrapper limit-wrapper--reached">
    <slot :limit-reached="true" :current-count="currentCount" :hard-limit="hardLimit" />
    <Tooltip :title="limitMessage">
      <span
        aria-hidden="true"
        class="limit-wrapper__overlay"
        data-testid="limit-reached-trigger"
        @click.prevent
      />
    </Tooltip>
  </span>
  <span v-else class="limit-wrapper">
    <slot :limit-reached="false" :current-count="currentCount" :hard-limit="hardLimit" />
  </span>
</template>

<style scoped>
.limit-wrapper {
  position: relative;
  display: inline-flex;
}

.limit-wrapper--reached {
  cursor: not-allowed;
}

.limit-wrapper__overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: not-allowed;
  opacity: 0;
}
</style>
