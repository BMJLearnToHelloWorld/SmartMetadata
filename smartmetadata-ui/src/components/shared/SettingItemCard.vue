<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { Card, Tag } from 'ant-design-vue';
import {
  registryDescription,
  registryTitle,
  type SettingsRegistryItem,
  type SettingsTranslator,
} from '@/settings/registry';
import SmIcon from './SmIcon.vue';

/**
 * Settings item card (DESIGN §7), the product equivalent of official
 * `SettingItemCard.component.tsx:50-93` (pin a3012259ca). Props are data
 * only: the registry item, a click callback receiving the dotted key,
 * and an optional extra class name — no behaviour branches live here.
 * The title renders the registry `titleKey` (pin `category ?? label`,
 * collapsed to one key by the registry) and the description the
 * `descriptionKey`, both through the registry render helpers so the
 * `{brandName}` / `{entity}` interpolation stays in one place.
 */
const props = withDefaults(
  defineProps<{
    data: SettingsRegistryItem;
    onClick: (key: string) => void;
    className?: string;
  }>(),
  { className: undefined },
);

const { t } = useI18n();
const translate: SettingsTranslator = (key, params) => t(key, params ?? {});
const title = computed(() => registryTitle(translate, props.data));
const description = computed(() => registryDescription(translate, props.data));

function handleClick(): void {
  props.onClick(props.data.key);
}
</script>

<template>
  <Card
    hoverable
    :class="['setting-item-card', className]"
    :data-testid="data.key"
    @click="handleClick"
  >
    <div class="setting-item-card__body">
      <div class="setting-item-card__icon">
        <div
          v-if="data.iconColor"
          class="setting-item-card__tile"
          :class="`setting-item-card__tile--${data.iconColor}`"
        >
          <SmIcon :icon-key="data.iconKey" />
        </div>
        <SmIcon v-else :icon-key="data.iconKey" class="setting-item-card__glyph" />
        <Tag v-if="data.isBeta" class="setting-item-card__beta" color="blue">
          {{ t('shared.beta') }}
        </Tag>
      </div>
      <div class="setting-item-card__content">
        <div class="setting-item-card__title">{{ title }}</div>
        <p class="setting-item-card__description">{{ description }}</p>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.setting-item-card {
  width: 100%;
  height: 100%;
  cursor: pointer;
}
.setting-item-card__body {
  display: flex;
  align-items: center;
  gap: 16px;
}
.setting-item-card__icon {
  position: relative;
  flex: 0 0 auto;
  line-height: 1;
}
.setting-item-card__glyph {
  font-size: 90px;
}
.setting-item-card__tile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 90px;
  height: 90px;
  border-radius: 28px;
  font-size: 32px;
}
.setting-item-card__tile--blue {
  background: var(--sm-color-primary-bg);
  color: var(--sm-color-primary);
}
.setting-item-card__tile--green {
  background: var(--sm-color-success-bg);
  color: var(--sm-color-success-text);
}
.setting-item-card__beta {
  position: absolute;
  top: 10%;
  right: -15%;
}
.setting-item-card__content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.setting-item-card__title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
  color: var(--sm-text-primary);
}
.setting-item-card__description {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  line-height: 1.5;
  color: var(--sm-text-secondary);
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
</style>
