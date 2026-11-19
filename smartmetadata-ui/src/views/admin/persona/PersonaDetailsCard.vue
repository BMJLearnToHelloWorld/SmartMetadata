<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin PersonaDetailsCard.tsx: the whole card is clickable
  and navigates to the detail page with hash `#customize-ui`, but only
  when the persona has a fully qualified name. Name with ellipsis +
  tooltip, a Default badge only for the default persona, and the
  description preview (two-line clamp) or `label.no-description`.
  No users count, no domains. Navigation uses the route name: the
  shared FQN path constructor builds a `/settings/...` path the
  current router does not resolve (see the batch report).
-->
<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { Card, Tag, Tooltip } from 'ant-design-vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import type { Persona } from '@/types/persona';

const props = defineProps<{ persona: Persona }>();

const { t } = useI18n();
const router = useRouter();

function getEntityName(persona: Persona): string {
  return persona.displayName || persona.name;
}

function handleCardClick(): void {
  if (props.persona.fullyQualifiedName) {
    void router.push({
      name: 'admin-settings-persona-detail',
      params: { fqn: props.persona.fullyQualifiedName },
      hash: '#customize-ui',
    });
  }
}
</script>

<template>
  <Card
    hoverable
    :data-testid="`persona-details-card-${persona.name}`"
    style="height: 100%; width: 100%; cursor: pointer; overflow: hidden"
    @click="handleCardClick"
  >
    <div style="display: flex; flex-direction: column; gap: 8px; height: 100%">
      <div style="display: flex; justify-content: space-between; width: 100%">
        <Tooltip :title="getEntityName(persona)">
          <span
            style="
              font-weight: 600;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            "
          >
            {{ getEntityName(persona) }}
          </span>
        </Tooltip>
        <Tag v-if="persona.default" color="blue" data-testid="default-persona-tag">
          {{ t('label.default') }}
        </Tag>
      </div>
      <div v-if="persona.description" class="persona-card-description">
        <SmMarkdown :markdown="persona.description" />
      </div>
      <span v-else style="color: var(--sm-text-secondary)">{{ t('label.no-description') }}</span>
    </div>
  </Card>
</template>

<style scoped>
.persona-card-description {
  display: -webkit-box;
  overflow: hidden;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--sm-text-secondary);
}
</style>
