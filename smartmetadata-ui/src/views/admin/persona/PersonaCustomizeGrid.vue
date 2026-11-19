<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { Card, Col, Row } from 'ant-design-vue';
import SmIcon from '@/components/shared/SmIcon.vue';
import { navIcon } from '@/layouts/navIcons';
import {
  getCustomizePageCardCategories,
  getCustomizePageOptions,
} from '@/views/admin/personaPage';
import { getCustomizePagePath } from './customizePagePath';

/**
 * The customize grid, mirroring the official S1 `CustomizeUI`
 * (`U/components/Settings/Persona/CustomizeUI/CustomizeUI.tsx`):
 * the card categories (the 6-card scope table, `askCollateSidebar`
 * excluded pending the R-C4-SIDEBAR scope ruling), or — while a
 * parent category is drilled into — that category's sub-options.
 * Which list shows is decided only by `activeCategory` (the hash
 * segment owned by the detail page), exactly as official derives its
 * items from the hash: no active category shows the categories; an
 * active category shows its options, even when that list is empty
 * (a leaf key drilled into by hand renders an empty grid, as
 * official does — there is no fallback to the categories).
 *
 * Clicking an item with no sub-options navigates to the top-level
 * customize route for that key; clicking a parent only changes the
 * hash (`#customize-ui.<category>`, `.` is the FQN separator), which
 * swaps the list. The click decision reads the options table, never
 * a hard-coded parent list.
 *
 * Cards render label + description + icon. Official cards render an
 * icon (`SettingItemCard`); the icon key travels on the category /
 * option data and resolves through the product icon map
 * (R-ENTRY-ICON alias rows). Keys with no grounded product glyph
 * (navigation, app-layout, dataAssets) render no icon at all — the
 * missing marker is never shown on a card, and no glyph is guessed.
 * Those three keys are the R-ENTRY-ICON residual.
 */
const props = defineProps<{
  personaFqn: string;
  activeCategory?: string;
}>();

const { t } = useI18n();
const router = useRouter();

interface GridItem {
  key: string;
  title: string;
  description: string;
  isOption: boolean;
  /** The customize icon key, only when the icon map resolves it. */
  iconKey?: string;
}

/** Resolves a customize icon key to a renderable key, or undefined. */
function resolvedIconKey(icon: string): string | undefined {
  return navIcon(icon) ? icon : undefined;
}

const items = computed<GridItem[]>(() => {
  if (props.activeCategory) {
    return getCustomizePageOptions(props.activeCategory).map((option) => ({
      key: option.key,
      title: option.label,
      description: t(option.descriptionKey, { entity: option.descriptionEntity }),
      isOption: true,
      iconKey: resolvedIconKey(option.icon),
    }));
  }
  return getCustomizePageCardCategories().map((category) => ({
    key: category.key,
    title: t(category.labelKey),
    description: category.descriptionEntityKey
      ? t(category.descriptionKey, { entity: t(category.descriptionEntityKey) })
      : t(category.descriptionKey),
    isOption: false,
    iconKey: resolvedIconKey(category.icon),
  }));
});

function onItemClick(key: string): void {
  if (getCustomizePageOptions(key).length === 0) {
    void router.push(getCustomizePagePath(props.personaFqn, key));
    return;
  }
  void router.push({ hash: `#customize-ui.${key}` });
}
</script>

<template>
  <div data-testid="customize-ui-options">
    <Row :gutter="[16, 16]">
      <Col v-for="item in items" :key="item.key" :xs="24" :sm="12" :lg="8">
        <Card
          hoverable
          :data-testid="
            item.isOption ? `persona-customize-option-${item.key}` : `persona-customize-${item.key}`
          "
          @click="onItemClick(item.key)"
        >
          <Card.Meta :title="item.title" :description="item.description">
            <template v-if="item.iconKey" #avatar>
              <SmIcon :icon-key="item.iconKey" />
            </template>
          </Card.Meta>
        </Card>
      </Col>
    </Row>
  </div>
</template>
