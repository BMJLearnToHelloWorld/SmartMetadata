<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { Card, Tag } from 'ant-design-vue';
import { DownOutlined } from '@ant-design/icons-vue';

/**
 * Section shell for the pin-grouped forms (ConnectionObjectFieldTemplate
 * SectionCard / IngestionObjectFieldTemplate SectionCard, pin
 * a3012259ca): numbered header with title, description and optional
 * badge; collapsible sections start closed when defaultOpen is false
 * and toggle on header click; non-collapsible headers never toggle.
 * The open state is local, initialised once from defaultOpen, as in
 * pin. Focusing a field inside marks the card active (brand outline).
 * The header fires `headerActivate` on focus as well as on click —
 * pin's connection headers focus the section's first field on
 * `onFocus`, so keyboard tab-focus updates the doc panel too; the
 * ingestion form does not listen, matching pin's ingestion template.
 */
const props = withDefaults(
  defineProps<{
    title: string;
    description?: string;
    /** Badge text, e.g. "2 required" or "Optional"; absent = no badge. */
    badgeText?: string;
    badgeTone?: 'error' | 'quiet';
    collapsible?: boolean;
    defaultOpen?: boolean;
    index?: number;
    testId?: string;
  }>(),
  {
    description: undefined,
    badgeText: undefined,
    badgeTone: 'quiet',
    collapsible: false,
    defaultOpen: true,
    index: undefined,
    testId: 'form-section',
  },
);

const emit = defineEmits<{
  /** Fired when the header is activated (pin focuses the section's first field). */
  headerActivate: [];
}>();

const open = ref(props.defaultOpen);
const active = ref(false);

function onFocusOut(event: FocusEvent): void {
  // Pin keeps the section active while focus stays inside it; only a
  // move outside the card clears the ring.
  const current = event.currentTarget;
  if (
    current instanceof HTMLElement &&
    event.relatedTarget instanceof Node &&
    current.contains(event.relatedTarget)
  ) {
    return;
  }
  active.value = false;
}
</script>

<template>
  <Card
    :data-testid="testId"
    :class="['form-section-card', { 'form-section-card-active': active }]"
    @focusin="active = true"
    @focusout="onFocusOut"
  >
    <button
      type="button"
      class="form-section-header"
      :data-testid="`${testId}-toggle`"
      @focus="emit('headerActivate')"
      @click="
        emit('headerActivate');
        if (collapsible) open = !open;
      "
    >
      <span class="form-section-heading">
        <span v-if="index != null" class="form-section-index">{{ index }}</span>
        <span class="form-section-titles">
          <span class="form-section-title-row">
            <span class="form-section-title">{{ title }}</span>
            <Tag v-if="badgeText" :color="badgeTone === 'error' ? 'error' : 'default'">
              {{ badgeText }}
            </Tag>
          </span>
          <span v-if="description" class="form-section-description">{{ description }}</span>
        </span>
      </span>
      <DownOutlined v-if="collapsible" :class="['form-section-chevron', { open }]" />
    </button>
    <div v-if="!collapsible || open" class="form-section-body">
      <slot />
    </div>
  </Card>
</template>

<style scoped>
.form-section-card {
  margin-bottom: 12px;
}

.form-section-card-active {
  border-color: var(--sm-color-primary);
}

.form-section-header {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.form-section-heading {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.form-section-index {
  display: grid;
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  place-items: center;
  border-radius: 50%;
  background: var(--sm-color-primary-bg);
  color: var(--sm-color-primary);
  font-size: 12px;
  font-weight: 600;
}

.form-section-titles {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.form-section-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-section-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.form-section-description {
  margin-top: 2px;
  font-size: 12px;
  color: var(--sm-text-tertiary);
}

.form-section-chevron {
  flex-shrink: 0;
  transition: transform 0.15s;
}

.form-section-chevron.open {
  transform: rotate(180deg);
}

.form-section-body {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--sm-border-secondary);
}
</style>
