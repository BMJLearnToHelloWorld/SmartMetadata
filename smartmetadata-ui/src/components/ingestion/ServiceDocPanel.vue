<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import {
  buildConnectorDocFilePath,
  buildDocFilePaths,
  extractFocusedRequirementsMarkdown,
  fetchDocFileText,
  fetchServiceDocMarkdown,
  getActiveFieldName,
  getConnectorDocsUrl,
  getFocusedDocDetails,
  getServiceTypeDisplay,
  getSupportedDocLanguage,
  isUsableMarkdown,
  splitDocMarkdown,
  type FieldFocusMeta,
} from '@/ingestion/fieldFocus';

/**
 * Port of official ServiceDocPanel (pin a3012259ca), both modes:
 * focused (`focusedMode`, the mode the service/ingestion edit pages
 * use) and full-document (the pin default, used by the SSO doc panel,
 * the application configurations, and custom properties). The panel
 * owns the connector-markdown fetch, as pin does: same-origin files
 * bundled under `public/locales/`, requested in the active locale with
 * an English fallback, guarded so only the newest response writes.
 * The focused field's `$$section` block plus the Requirements body
 * render when the doc carries them; otherwise the field area falls
 * back to the parsed schema title/description (Q-2 C′), and the
 * setup-guide default shows with nothing focused. The docs link
 * renders only when a connector URL can be extracted from the markdown
 * (for workflows, from the connector file, which the shared workflow
 * doc can never carry).
 *
 * Full-document mode renders the whole markdown split into prose /
 * `$$section` / admonition segments (pin `processDocMarkdown`, via
 * shared `splitDocMarkdown`), and highlights + scrolls to the active
 * field's section — pin's non-focused effect, which only runs outside
 * focused mode. The header (service name + type) renders in focused
 * mode only, as in pin.
 */
const props = withDefaults(
  defineProps<{
    serviceName: string;
    serviceType: string;
    activeField?: string;
    activeFieldMeta?: FieldFocusMeta;
    focusedMode?: boolean;
    isWorkflow?: boolean;
    workflowType?: string;
    testId?: string;
  }>(),
  {
    activeField: undefined,
    activeFieldMeta: undefined,
    focusedMode: false,
    isWorkflow: false,
    workflowType: undefined,
    testId: 'service-requirements',
  },
);

const { t, locale } = useI18n();

const markdownContent = ref('');
const connectorMarkdown = ref('');
const isLoading = ref(false);
const isMarkdownReady = ref(false);

// Pin's markdownRequestIdRef: the host pages render once before the
// service has loaded, so a first request can still be in flight when a
// second one is made. Only the newest may write, otherwise a stale
// response blanks the panel.
let markdownRequestId = 0;
let connectorRequestId = 0;

async function fetchRequirement(): Promise<void> {
  const requestId = ++markdownRequestId;
  if (!props.serviceName) {
    markdownContent.value = '';
    isLoading.value = false;
    isMarkdownReady.value = true;
    return;
  }
  isLoading.value = true;
  const language = getSupportedDocLanguage(locale.value);
  const paths = buildDocFilePaths({
    language,
    serviceType: props.serviceType,
    serviceName: props.serviceName,
    isWorkflow: props.isWorkflow,
    workflowType: props.workflowType,
  });
  let response = '';
  try {
    response = await fetchServiceDocMarkdown(fetchDocFileText, paths, language === 'en-US');
  } catch {
    response = '';
  }
  if (requestId !== markdownRequestId) {
    return;
  }
  markdownContent.value = response.replaceAll('OpenMetadata', t('product.name'));
  isLoading.value = false;
  isMarkdownReady.value = true;
}

async function fetchConnectorMarkdown(): Promise<void> {
  const requestId = ++connectorRequestId;
  if (!props.isWorkflow || !props.serviceName) {
    connectorMarkdown.value = '';
    return;
  }
  let content = '';
  try {
    content = await fetchDocFileText(
      buildConnectorDocFilePath(props.serviceType, props.serviceName),
    );
  } catch {
    content = '';
  }
  if (requestId !== connectorRequestId) {
    return;
  }
  connectorMarkdown.value = isUsableMarkdown(content) ? content : '';
}

// Pin refetches on [serviceName, serviceType]; the fork also watches
// the workflow identity because the agent form mounts the panel before
// the pipeline type settles from the loaded pipeline. The language is
// read from the active locale at fetch time; pin does not refetch on
// locale change, and neither does this panel.
watch(
  () => [props.serviceName, props.serviceType, props.isWorkflow, props.workflowType],
  () => {
    void fetchRequirement();
    void fetchConnectorMarkdown();
  },
  { immediate: true },
);

const activeFieldName = computed(() => getActiveFieldName(props.activeField));

const details = computed(() =>
  getFocusedDocDetails(
    activeFieldName.value,
    props.activeFieldMeta,
    markdownContent.value,
    props.isWorkflow,
    t('product.name'),
    (key, params) => t(key, params ?? {}),
  ),
);

const requirementsMarkdown = computed(() =>
  details.value.showRequirements
    ? extractFocusedRequirementsMarkdown(markdownContent.value, {
        autoClassification: t('forms.docPanel.requirementAutoClassification'),
        lineage: t('forms.docPanel.requirementLineage'),
        metadata: t('forms.docPanel.requirementMetadata'),
        profiler: t('forms.docPanel.requirementProfiler'),
      })
    : '',
);

const docsUrl = computed(() =>
  getConnectorDocsUrl(
    props.isWorkflow ? connectorMarkdown.value : markdownContent.value,
    props.serviceName,
  ),
);

const serviceTypeDisplay = computed(() =>
  getServiceTypeDisplay(props.serviceType, t('forms.docPanel.service')),
);

const segments = computed(() => splitDocMarkdown(markdownContent.value));

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
  if (props.focusedMode || !isMarkdownReady.value || !fieldName || !panelRef.value) {
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
  <div ref="panelRef" :data-testid="testId" class="service-doc-panel">
    <div v-if="focusedMode" class="service-doc-header">
      <div class="service-doc-title">{{ serviceName }}</div>
      <div class="service-doc-subtitle">{{ serviceTypeDisplay }}</div>
    </div>

    <div v-if="isLoading" class="service-doc-loading" data-testid="service-doc-loading">
      {{ t('shared.loading') }}
    </div>

    <template v-else-if="focusedMode">
      <div class="service-doc-intro">
        <div class="service-doc-eyebrow">{{ details.eyebrow }}</div>
        <h1 class="service-doc-heading">{{ details.title }}</h1>
        <p class="service-doc-description">{{ details.description }}</p>
      </div>

      <div v-if="details.showAuthGuidance" class="service-doc-auth-grid">
        <div class="service-doc-auth-card">
          <div class="service-doc-auth-title">{{ t('forms.docPanel.passwordAuthTitle') }}</div>
          <p>{{ t('forms.docPanel.passwordAuthDescription') }}</p>
        </div>
        <div class="service-doc-auth-card">
          <div class="service-doc-auth-title">{{ t('forms.docPanel.keyPairAuthTitle') }}</div>
          <p>{{ t('forms.docPanel.keyPairAuthDescription') }}</p>
        </div>
      </div>

      <div v-if="requirementsMarkdown" class="service-doc-section">
        <h1 class="service-doc-heading">{{ t('forms.docPanel.requirements') }}</h1>
        <SmMarkdown :markdown="requirementsMarkdown" test-id="service-doc-requirements" />
      </div>

      <div
        v-if="details.schemaFallback"
        class="service-doc-section"
        data-testid="service-doc-field-fallback"
      >
        <div class="service-doc-field-title">{{ details.schemaFallback.title }}</div>
        <p class="service-doc-field-description">{{ details.schemaFallback.description }}</p>
      </div>

      <div v-if="details.markdown" class="service-doc-section">
        <SmMarkdown :markdown="details.markdown" test-id="service-doc-field-markdown" />
      </div>

      <div v-if="docsUrl" class="service-doc-link-section">
        <a :href="docsUrl" rel="noreferrer" target="_blank" class="service-doc-link">
          {{ t('forms.docPanel.viewServiceDocs', { serviceName }) }}
        </a>
        <span class="service-doc-link-hint">{{ t('forms.docPanel.docsDescription') }}</span>
      </div>
    </template>

    <div v-else>
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

<style scoped>
.service-doc-panel {
  padding: 20px;
}

.service-doc-header {
  margin-bottom: 20px;
}

.service-doc-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}

.service-doc-subtitle {
  font-size: 13px;
  color: var(--sm-text-tertiary);
}

.service-doc-loading {
  font-size: 14px;
  color: var(--sm-text-secondary);
}

.service-doc-intro {
  margin-bottom: 16px;
}

.service-doc-eyebrow {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--sm-color-primary);
}

.service-doc-heading {
  margin: 4px 0;
  font-size: 20px;
  font-weight: 600;
  line-height: 28px;
}

.service-doc-description {
  margin: 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--sm-text-secondary);
}

.service-doc-auth-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}

.service-doc-auth-card {
  padding: 12px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 8px;
}

.service-doc-auth-title {
  font-weight: 600;
}

.service-doc-auth-card p {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--sm-text-secondary);
}

.service-doc-section {
  margin-bottom: 16px;
}

.service-doc-field-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 22px;
}

.service-doc-field-description {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 22px;
  color: var(--sm-text-secondary);
}

.service-doc-link-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.service-doc-link {
  font-weight: 500;
  color: var(--sm-color-primary);
}

.service-doc-link-hint {
  font-size: 12px;
  color: var(--sm-text-tertiary);
}
</style>
