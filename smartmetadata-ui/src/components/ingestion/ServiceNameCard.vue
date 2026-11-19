<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Input } from 'ant-design-vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';

/**
 * Port of official ServiceNameCard (pin a3012259ca,
 * components/Settings/Services/AddService/ServiceNameCard/
 * ServiceNameCard.tsx:20-105): the wizard step-2 naming card. There
 * is no displayName field — the pin's props carry name and
 * description only (D-8). The description editor is initially visible
 * if and only if the description is non-empty; the collapsed state
 * shows the Add description button. Focus notifications follow the
 * t367 Q6(a) contract: the name input maps focus to `serviceName`,
 * the editor maps its real focus callback to `serviceDescription`,
 * and the Add-description button notifies `serviceDescription` once
 * when revealing the editor (the editor is not mounted yet at that
 * point, so this cannot duplicate the editor callback).
 */
const props = defineProps<{
  serviceType: string;
  name: string;
  description: string;
  nameError?: string;
}>();

const emit = defineEmits<{
  'update:name': [value: string];
  'update:description': [value: string];
  blur: [];
  focus: [field: 'serviceName' | 'serviceDescription'];
}>();

const { t } = useI18n();

const showDescription = ref(Boolean(props.description));
const descriptionWrapper = ref<HTMLElement | null>(null);

function revealDescription(): void {
  showDescription.value = true;
  emit('focus', 'serviceDescription');
}

/**
 * The shared editor exposes no blur emit; focusout on the wrapper
 * covers leaving the editor subtree (toolbar moves stay inside and
 * are ignored via relatedTarget).
 */
function onDescriptionFocusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (next && descriptionWrapper.value?.contains(next)) {
    return;
  }
  emit('blur');
}
</script>

<template>
  <div class="service-name-card">
    <h3 class="service-name-card__title">{{ t('settings.services.wizard.nameThisService') }}</h3>
    <p class="service-name-card__lead">
      {{
        t('settings.services.wizard.nameThisServiceDescription', {
          serviceType: props.serviceType,
          brandName: t('product.name'),
        })
      }}
    </p>
    <div class="service-name-card__field">
      <Input
        id="service-name"
        :value="props.name"
        autofocus
        required
        data-testid="service-name-input"
        @update:value="emit('update:name', $event)"
        @focus="emit('focus', 'serviceName')"
        @blur="emit('blur')"
      />
      <p class="service-name-card__hint">
        {{ props.nameError || t('settings.services.wizard.serviceNameRule') }}
      </p>
    </div>
    <div
      v-if="showDescription"
      ref="descriptionWrapper"
      class="service-name-card__description"
      @focusout="onDescriptionFocusOut"
    >
      <SmRichTextEditor
        :initial-value="props.description"
        :place-holder="t('settings.services.wizard.addDescriptionPlaceholder')"
        @text-change="emit('update:description', $event)"
        @focus="emit('focus', 'serviceDescription')"
      />
    </div>
    <Button v-else data-testid="add-description-button" @click="revealDescription">
      {{ t('settings.services.wizard.addDescription') }}
    </Button>
  </div>
</template>

<style scoped>
.service-name-card__title {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 600;
}

.service-name-card__lead {
  margin: 0 0 16px;
  color: var(--hatch-widget-muted, rgba(0, 0, 0, 0.45));
}

.service-name-card__field {
  margin-bottom: 16px;
}

.service-name-card__hint {
  margin: 4px 0 0;
  color: var(--hatch-widget-muted, rgba(0, 0, 0, 0.45));
}
</style>
