<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input, message, Popover, Radio, Spin } from 'ant-design-vue';
import { listTierTags, type TierTag } from '@/api/tags';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';

/**
 * Tier picker, ported from official components/common/TierCard/TierCard.tsx
 * (pin a3012259ca). The trigger is the default slot (the pin's `children`,
 * here the facets' edit button only — ADR-7). Tiers load when the picker
 * first opens and only while the list is empty; options are searchable,
 * single-select radio rows with the tier's `style.color` name, a summary
 * line and markdown details. Selecting commits immediately through
 * `updateTier`; clearing (the Clear row, or clicking the selected tier
 * again) commits `undefined`. A failed commit toasts and still closes,
 * matching the pin's FilterSelect close-on-select.
 *
 * Options come from `listTierTags` — the pin's `getTags` query (parent
 * `Tier`, limit 50, `disabled: false`) with the tier `style` mapped, so
 * no client-side disabled filter and no local tag shape are needed.
 */

const props = withDefaults(
  defineProps<{
    currentTier?: string;
    updateTier: (tag?: TierTag) => Promise<void>;
  }>(),
  { currentTier: undefined },
);

const { t } = useI18n();

const open = ref(false);
const tiers = ref<TierTag[]>([]);
const isLoading = ref(false);
const search = ref('');

watch(open, (value) => {
  if (!value) {
    search.value = '';
    return;
  }
  if (tiers.value.length === 0 && !isLoading.value) {
    void fetchTiers();
  }
});

async function fetchTiers(): Promise<void> {
  isLoading.value = true;
  try {
    tiers.value = (await listTierTags()).data;
  } catch {
    message.error(t('serviceDetail.facets.tierFetchError'));
  } finally {
    isLoading.value = false;
  }
}

/**
 * Inline HTML to the markdown subset `SmMarkdown` renders, so editor-HTML
 * tier descriptions keep their bold, italic, code, link and list
 * formatting in the details block instead of collapsing to plain text.
 * Only safe link targets survive; anything else degrades to its text.
 */
function htmlInlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? '';
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }
  const element = node as Element;
  const inner = Array.from(element.childNodes).map(htmlInlineToMarkdown).join('');
  switch (element.tagName) {
    case 'BR':
      return ' ';
    case 'STRONG':
    case 'B':
      return inner ? `**${inner}**` : '';
    case 'EM':
    case 'I':
      return inner ? `*${inner}*` : '';
    case 'CODE':
      return inner ? `\`${inner}\`` : '';
    case 'A': {
      const href = element.getAttribute('href') ?? '';
      return /^(https?:|mailto:|\/|#)/i.test(href) ? `[${inner}](${href})` : inner;
    }
    default:
      return inner;
  }
}

function htmlBlockToMarkdown(element: Element): string {
  if (element.tagName === 'UL' || element.tagName === 'OL') {
    return Array.from(element.children)
      .filter((child) => child.tagName === 'LI')
      .map((child) => `- ${htmlInlineToMarkdown(child).replace(/\s+/g, ' ').trim()}`)
      .filter(Boolean)
      .join('\n');
  }
  return htmlInlineToMarkdown(element).replace(/\s+/g, ' ').trim();
}

/**
 * Simplified port of the pin's splitTierDescription: the first block is
 * the summary (plain text), the rest are the details. Seeded tiers store
 * markdown, so blank-line paragraphs approximate blocks; editor HTML is
 * split on its block elements and the details convert to the markdown
 * subset `SmMarkdown` renders, keeping inline formatting and lists.
 */
function splitTierDescription(description = ''): { summary: string; details: string } {
  const plainText = (html: string): string =>
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  const stripInlineMarkdown = (text: string): string =>
    text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  if (/<(p|div|ul|ol|blockquote|pre|table|h[1-6])[\s>]/i.test(description)) {
    const body = new DOMParser().parseFromString(description, 'text/html').body;
    const blocks = Array.from(body.children).filter(
      (element) =>
        (element.textContent ?? '').trim() !== '' || element.querySelector('img') !== null,
    );
    const [first, ...rest] = blocks;
    return {
      summary: first ? plainText(first.outerHTML) : '',
      details: rest.map(htmlBlockToMarkdown).filter(Boolean).join('\n\n'),
    };
  }
  const paragraphs = description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (paragraphs.length <= 1) {
    return { summary: stripInlineMarkdown(description), details: '' };
  }
  const [first, ...rest] = paragraphs;
  return { summary: stripInlineMarkdown(first), details: rest.join('\n\n') };
}

interface TierOption {
  tag: TierTag;
  value: string;
  name: string;
  color?: string;
  summary: string;
  details: string;
}

const options = computed<TierOption[]>(() =>
  tiers.value.map((tag) => {
    const { summary, details } = splitTierDescription(tag.description);
    return {
      tag,
      value: tag.fullyQualifiedName ?? tag.name,
      name: tag.displayName ?? tag.name,
      color: tag.style?.color,
      summary,
      details,
    };
  }),
);

const filteredOptions = computed(() => {
  const needle = search.value.trim().toLowerCase();
  if (!needle) {
    return options.value;
  }
  // Pin FilterSelect matches the option text only (TierCard sets it to
  // the tier name), never the FQN.
  return options.value.filter((option) => option.name.toLowerCase().includes(needle));
});

async function commit(tag: TierTag | undefined): Promise<void> {
  try {
    await props.updateTier(tag);
  } catch {
    message.error(t('serviceDetail.facets.tierUpdateError'));
  } finally {
    open.value = false;
  }
}

function selectOption(option: TierOption): void {
  void commit(option.value === props.currentTier ? undefined : option.tag);
}
</script>

<template>
  <Popover v-model:open="open" trigger="click" placement="bottomLeft">
    <slot />
    <template #content>
      <div class="tier-picker" data-testid="tier-picker">
        <Input
          v-model:value="search"
          data-testid="tier-picker-search"
          :placeholder="t('crud.searchPlaceholder')"
          allow-clear
        />
        <div v-if="isLoading" class="tier-picker-loading" data-testid="tier-picker-loading">
          <Spin size="small" />
        </div>
        <div
          v-else-if="filteredOptions.length === 0"
          class="tier-picker-empty"
          data-testid="tier-picker-empty"
        >
          {{ t('serviceDetail.facets.noTiersAvailable') }}
        </div>
        <div v-else class="tier-picker-options">
          <div
            v-for="option in filteredOptions"
            :key="option.value"
            class="tier-picker-option"
            :data-testid="`tier-option-${option.value}`"
            @click="selectOption(option)"
          >
            <Radio :checked="option.value === currentTier" />
            <div class="tier-picker-option-body">
              <span class="tier-picker-option-name" :style="option.color ? { color: option.color } : undefined">{{
                option.name
              }}</span>
              <span v-if="option.summary" class="tier-picker-option-summary">{{
                option.summary
              }}</span>
              <SmMarkdown
                v-if="option.details"
                :markdown="option.details"
                :test-id="`tier-picker-option-details-${option.value}`"
              />
            </div>
          </div>
        </div>
        <Button
          v-if="currentTier"
          data-testid="tier-picker-clear"
          type="link"
          size="small"
          @click="commit(undefined)"
        >
          {{ t('crud.clear') }}
        </Button>
      </div>
    </template>
  </Popover>
</template>

<style scoped>
.tier-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
}

.tier-picker-loading,
.tier-picker-empty {
  padding: 12px 0;
  text-align: center;
}

.tier-picker-options {
  display: flex;
  flex-direction: column;
  max-height: 416px;
  overflow-y: auto;
}

.tier-picker-option {
  align-items: flex-start;
  cursor: pointer;
  display: flex;
  gap: 8px;
  padding: 8px 4px;
}

.tier-picker-option:hover {
  background: var(--sm-bg-elevated);
}

.tier-picker-option-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.tier-picker-option-name {
  font-weight: 500;
}

.tier-picker-option-summary {
  color: var(--sm-text-secondary);
  font-size: 12px;
}
</style>
