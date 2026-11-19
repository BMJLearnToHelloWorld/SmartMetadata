<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ExclamationCircleFilled } from '@ant-design/icons-vue';
import { Button, Tooltip } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import AppLogo from './AppLogo.vue';
import { kebabCase } from './appUtils';

const props = withDefaults(
  defineProps<{
    logo?: string;
    title: string;
    description: string;
    linkTitle: string;
    className?: string;
    showDescription?: boolean;
    deleted?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    onClick: () => void;
    appName: string;
  }>(),
  {
    logo: undefined,
    className: undefined,
    showDescription: true,
    deleted: false,
    disabled: false,
    disabledReason: undefined,
  },
);

const { t } = useI18n();

/**
 * Official ApplicationCard (components/Settings/Applications/
 * ApplicationCard/ApplicationCard.component.tsx, pin a3012259ca):
 * unavailable (deleted or disabled) cards fade to 65%, drop their click
 * handlers, and carry the Deleted badge; the description renders only
 * when `showDescription`; the link button fires the same click as the
 * card. A `disabledReason` wraps the whole card in a top Tooltip whose
 * trigger stays out of the tab order (the card's own button must not
 * nest inside another button's trigger). The Tooltip is always mounted
 * with an undefined title when there is no reason, which renders no
 * overlay; the single markup copy keeps both branches identical.
 */
const isUnavailable = computed(() => props.deleted || props.disabled);

function onCardClick(): void {
  if (!isUnavailable.value) {
    props.onClick();
  }
}
</script>

<template>
  <Tooltip placement="top" :title="disabledReason">
    <div :tabindex="disabledReason ? -1 : undefined" style="display: block; height: 100%">
      <div
        :aria-disabled="isUnavailable || undefined"
        :class="className"
        :data-testid="`${kebabCase(appName)}-card`"
        :style="{
          alignItems: 'center',
          border: '1px solid #d9d9d9',
          borderRadius: '8px',
          cursor: isUnavailable ? undefined : 'pointer',
          display: 'flex',
          height: '100%',
          opacity: isUnavailable ? 0.65 : undefined,
        }"
        @click="onCardClick"
      >
        <div style="display: flex; align-items: center; gap: 12px; padding: 20px">
          <div :style="{ filter: isUnavailable ? 'grayscale(1)' : undefined }">
            <AppLogo :app-name="appName" :logo="logo" />
          </div>
          <div style="display: flex; flex-direction: column; align-items: baseline">
            <div style="display: flex; gap: 8px; align-items: center">
              <h5 style="margin: 0; overflow-wrap: anywhere; font-weight: 600">{{ title }}</h5>
              <div
                v-if="isUnavailable"
                data-testid="deleted-badge"
                style="display: flex; align-items: center; font-size: 11px"
              >
                <ExclamationCircleFilled style="display: flex; margin-right: 4px; font-size: 10px" />
                {{ t('label.disabled') }}
              </div>
            </div>
            <SmMarkdown v-if="showDescription" :markdown="description" />
            <Button
              data-testid="config-btn"
              type="link"
              :disabled="isUnavailable"
              @click.stop="onCardClick"
            >
              {{ linkTitle }}
            </Button>
          </div>
        </div>
      </div>
    </div>
  </Tooltip>
</template>
