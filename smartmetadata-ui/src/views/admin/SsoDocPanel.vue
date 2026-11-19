<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Spin } from 'ant-design-vue';
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  resolveSsoActiveField,
  resolveSsoDocServiceName,
  splitSsoDocMarkdown,
} from '@/admin/ssoDocSections';
import {
  getSsoProviderDisplayName,
  getSsoProviderIcon,
} from '@/admin/ssoProviders';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import {
  buildDocFilePaths,
  fetchDocFileText,
  fetchServiceDocMarkdown,
  getActiveFieldName,
  getSupportedDocLanguage,
} from '@/ingestion/fieldFocus';
import SsoProviderIcon from './SsoProviderIcon.vue';

const props = defineProps<{
  serviceName: string;
  activeField?: string;
}>();

const { t, locale } = useI18n();
const brandName = computed(() => t('product.name'));

const resolvedServiceName = computed(() =>
  resolveSsoDocServiceName(props.serviceName),
);
const title = computed(() =>
  props.serviceName === 'basic'
    ? t('sso.basicConfiguration')
    : `${getSsoProviderDisplayName(props.serviceName)} ${t('sso.ssoConfiguration')}`,
);

const isLoading = ref(false);
const markdownContent = ref('');
const isMarkdownReady = ref(false);
let markdownRequestId = 0;

async function fetchRequirement(): Promise<void> {
  const requestId = ++markdownRequestId;
  isLoading.value = true;
  const language = getSupportedDocLanguage(locale.value);
  const response = await fetchServiceDocMarkdown(
    fetchDocFileText,
    buildDocFilePaths({
      language,
      serviceType: 'SSO',
      serviceName: resolvedServiceName.value,
    }),
    language === 'en-US',
  ).catch(() => '');
  // Only the newest request may write; a stale response must not blank
  // the panel when the provider changes mid-flight.
  if (requestId !== markdownRequestId) {
    return;
  }
  markdownContent.value = response.replaceAll('OpenMetadata', brandName.value);
  isLoading.value = false;
  isMarkdownReady.value = true;
}

// Fetch effect deps are [serviceName, serviceType] only: a locale change
// does not refetch (pin `ServiceDocPanel`).
watch(
  resolvedServiceName,
  () => {
    void fetchRequirement();
  },
  { immediate: true },
);

const segments = computed(() => splitSsoDocMarkdown(markdownContent.value));
const activeFieldName = computed(() =>
  getActiveFieldName(resolveSsoActiveField(props.activeField)),
);

const panelRef = ref<HTMLElement | null>(null);

function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let parent = node?.parentElement ?? null;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (/(auto|scroll|overlay)/.test(overflowY) && parent.scrollHeight > parent.clientHeight) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

// Scrolls only the nearest scroll parent: `scrollIntoView` would scroll
// every scrollable ancestor, including containers holding open popovers.
function scrollDocElementIntoView(
  element: HTMLElement,
  alignToStart: boolean,
): void {
  const scrollParent = getScrollParent(element);
  if (!scrollParent) {
    element.scrollIntoView({
      block: alignToStart ? 'start' : 'center',
      behavior: 'smooth',
      inline: 'nearest',
    });
    return;
  }
  const containerRect = scrollParent.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const relativeTop = elementRect.top - containerRect.top;
  const delta = alignToStart
    ? relativeTop
    : relativeTop - scrollParent.clientHeight / 2 + elementRect.height / 2;
  scrollParent.scrollTo({ top: scrollParent.scrollTop + delta, behavior: 'smooth' });
}

let observer: MutationObserver | undefined;
let frame = 0;

function highlightActiveField(): void {
  const fieldName = activeFieldName.value;
  if (!isMarkdownReady.value || !fieldName || !panelRef.value) {
    return;
  }
  const selector = `[data-id="${CSS.escape(fieldName)}"]`;
  const highlight = (): boolean => {
    const element = panelRef.value?.querySelector<HTMLElement>(selector);
    if (!element) {
      return false;
    }
    observer?.disconnect();
    scrollDocElementIntoView(element, fieldName === 'selected-entity');
    element.dataset.highlighted = 'true';
    return true;
  };
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    panelRef.value
      ?.querySelectorAll<HTMLElement>('[data-highlighted="true"]')
      .forEach((el) => {
        el.dataset.highlighted = 'false';
      });
    if (!highlight() && panelRef.value) {
      observer = new MutationObserver(highlight);
      observer.observe(panelRef.value, { childList: true, subtree: true });
    }
  });
}

watch([activeFieldName, isMarkdownReady], () => {
  void nextTick(highlightActiveField);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
});
</script>

<template>
  <div class="sso-doc-panel">
    <div class="sso-doc-header">
      <div v-if="getSsoProviderIcon(serviceName)" class="sso-provider-icon">
        <SsoProviderIcon
          :alt="`${serviceName} icon`"
          :icon="getSsoProviderIcon(serviceName)"
          :size="22"
        />
      </div>
      <h1 class="sso-provider-title">{{ title }}</h1>
    </div>
    <Spin v-if="isLoading" />
    <div v-else ref="panelRef" data-testid="service-requirements">
      <template v-for="(segment, index) in segments" :key="index">
        <section
          v-if="segment.kind === 'section'"
          :data-id="segment.id"
          data-highlighted="false"
        >
          <SmMarkdown :markdown="segment.markdown" />
        </section>
        <div
          v-else-if="segment.kind === 'admonition'"
          :class="`admonition admonition-${segment.admonitionType}`"
        >
          <SmMarkdown :markdown="segment.markdown" />
        </div>
        <SmMarkdown v-else :markdown="segment.markdown" />
      </template>
    </div>
  </div>
</template>
