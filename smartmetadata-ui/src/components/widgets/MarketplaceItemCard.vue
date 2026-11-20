/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
<script setup lang="ts">
/**
 * One marketplace card — the pin `MarketplaceItemCard.component.tsx`
 * equivalent (D-2 batch 5b). A clickable card (role button, keyboard
 * Enter / Space) with an avatar, the entity name and a one-line
 * truncated subtitle with a hover tooltip. The avatar is an initial
 * letter: the pin uses `getEntityAvatarProps` (cover image / initials)
 * and the product has no marketplace cover-image read chain (see D-9).
 */
import { computed } from 'vue';
import { Avatar, Card, Typography } from 'ant-design-vue';

const props = defineProps<{
  name: string;
  subtitle?: string;
  testId: string;
  onClick: () => void;
}>();

const initial = computed(() => (props.name.trim().charAt(0) || '?').toUpperCase());

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    props.onClick();
  }
}
</script>

<template>
  <Card
    role="button"
    :tabindex="0"
    :data-testid="testId"
    class="marketplace-item-card"
    hoverable
    @click="onClick"
    @keydown="handleKeydown"
  >
    <div class="marketplace-item-card__body">
      <Avatar class="marketplace-item-card__avatar">{{ initial }}</Avatar>
      <div class="marketplace-item-card__text">
        <Typography.Text strong class="marketplace-item-card__name" :title="name">
          {{ name }}
        </Typography.Text>
        <Typography.Text
          v-if="subtitle"
          type="secondary"
          class="marketplace-item-card__subtitle"
          :title="subtitle"
        >
          {{ subtitle }}
        </Typography.Text>
      </div>
    </div>
  </Card>
</template>

<style scoped>
.marketplace-item-card {
  flex: 1;
  min-width: 235px;
  max-width: calc((100% - 24px) / 3);
}

.marketplace-item-card__body {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.marketplace-item-card__avatar {
  flex-shrink: 0;
}

.marketplace-item-card__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.marketplace-item-card__name,
.marketplace-item-card__subtitle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
