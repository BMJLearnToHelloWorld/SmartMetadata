<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { savePersonaDocument } from '@/api/docStore';
import { Button, Form, Radio, Select, message } from 'ant-design-vue';
import type { Persona, PersonaDocument, ViewModePage } from '@/types/persona';
import {
  DEFAULT_LANDING_PAGE,
  LANDING_PAGE_SECTIONS,
  VIEW_MODE_PAGES,
  getPersonaPreferences,
  resolvePersonaLandingPage,
  updatePersonaAppLayout,
} from '../personaPage';

/**
 * App-layout editor, mirroring the official AppLayoutEditor: app mode
 * (classic / AI / no preference), default landing page from the
 * curated sections, and per-page default view modes (add/remove).
 * Saving writes the persona's personaPreferences entry; resetting
 * saves all-undefined, which is the official "fall through to the
 * next default" signal.
 */
const props = defineProps<{
  persona: Persona;
  document: PersonaDocument;
}>();

const emit = defineEmits<{ saved: [document: PersonaDocument] }>();

const { t } = useI18n();

const persisted = computed(() => getPersonaPreferences(props.document, props.persona.id));
const persistedAppMode = computed(() => persisted.value?.appMode ?? 'none');
const persistedLandingPage = computed(() => resolvePersonaLandingPage(props.document, props.persona.id));
const persistedViewModes = computed(() => persisted.value?.defaultViewModes ?? {});

const appMode = ref<string>(persistedAppMode.value);
const landingPage = ref<string>(persistedLandingPage.value);
const viewModes = ref<Record<string, string>>({ ...(persistedViewModes.value as Record<string, string>) });
const saving = ref(false);
const errorMessage = ref('');

const configuredPages = computed(() => VIEW_MODE_PAGES.filter(({ page }) => viewModes.value[page]));
const addablePages = computed(() => VIEW_MODE_PAGES.filter(({ page }) => !viewModes.value[page]));

const canSave = computed(
  () =>
    appMode.value !== persistedAppMode.value ||
    landingPage.value !== persistedLandingPage.value ||
    JSON.stringify(viewModes.value) !== JSON.stringify(persistedViewModes.value),
);

function setPageViewMode(page: ViewModePage, view: string): void {
  viewModes.value = { ...viewModes.value, [page]: view };
}

function removePageViewMode(page: ViewModePage): void {
  const next = { ...viewModes.value };
  delete next[page];
  viewModes.value = next;
}

async function save(changes: {
  appMode: string;
  landingPage: string;
  viewModes: Record<string, string>;
}): Promise<void> {
  saving.value = true;
  errorMessage.value = '';
  try {
    const saved = await savePersonaDocument(props.document, (draft) => {
      draft.data.personaPreferences = updatePersonaAppLayout(
        draft.data.personaPreferences ?? [],
        props.persona,
        {
          appMode: changes.appMode === 'none' ? undefined : (changes.appMode as 'classic' | 'AI'),
          defaultLandingPage:
            changes.landingPage === DEFAULT_LANDING_PAGE ? undefined : changes.landingPage,
          defaultViewModes: Object.keys(changes.viewModes).length
            ? (changes.viewModes as Record<'domains' | 'subDomains' | 'dataProducts' | 'learningResources', 'table' | 'card' | 'tree'>)
            : undefined,
        },
      );
    });
    emit('saved', saved);
    message.success(t('persona.saved'));
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('persona.saveFailed');
  } finally {
    saving.value = false;
  }
}

async function onSave(): Promise<void> {
  await save({ appMode: appMode.value, landingPage: landingPage.value, viewModes: viewModes.value });
}

async function onReset(): Promise<void> {
  appMode.value = 'none';
  landingPage.value = DEFAULT_LANDING_PAGE;
  viewModes.value = {};
  await save({ appMode: 'none', landingPage: DEFAULT_LANDING_PAGE, viewModes: {} });
}
</script>

<template>
  <div data-testid="app-layout-editor">
    <Form layout="vertical">
      <Form.Item :label="t('persona.appMode')">
        <Radio.Group v-model:value="appMode" data-testid="app-mode-select">
          <Radio value="none">{{ t('persona.appModeNone') }}</Radio>
          <Radio value="classic">{{ t('persona.appModeClassic') }}</Radio>
          <Radio value="AI">{{ t('persona.appModeAi') }}</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item :label="t('persona.defaultLandingPage')">
        <Select
          v-model:value="landingPage"
          data-testid="landing-select"
          style="width: 100%"
        >
          <Select.OptGroup
            v-for="section in LANDING_PAGE_SECTIONS"
            :key="section.titleKey"
            :label="t(section.titleKey)"
          >
            <Select.Option
              v-for="option in section.options"
              :key="option.path"
              :value="option.path"
            >
              {{ t(option.labelKey) }}
            </Select.Option>
          </Select.OptGroup>
        </Select>
      </Form.Item>
      <Form.Item :label="t('persona.viewModes')">
        <div v-for="entry in configuredPages" :key="entry.page" class="app-layout-editor__row">
          <span>{{ t(entry.labelKey) }}</span>
          <Select
            :value="viewModes[entry.page]"
            :data-testid="`view-mode-${entry.page}`"
            style="width: 160px"
            @change="(view) => setPageViewMode(entry.page, view as string)"
          >
            <Select.Option v-for="view in entry.views" :key="view" :value="view">
              {{ t(`persona.view${view === 'table' ? 'Table' : view === 'card' ? 'Card' : 'Tree'}`) }}
            </Select.Option>
          </Select>
          <Button
            :data-testid="`view-mode-remove-${entry.page}`"
            @click="removePageViewMode(entry.page)"
          >
            {{ t('persona.remove') }}
          </Button>
        </div>
        <div class="app-layout-editor__add">
          <Select
            :placeholder="t('persona.addViewMode')"
            style="width: 220px"
            :value="undefined"
            @change="(page) => setPageViewMode(page as ViewModePage, 'table')"
          >
            <Select.Option v-for="entry in addablePages" :key="entry.page" :value="entry.page">
              {{ t(entry.labelKey) }}
            </Select.Option>
          </Select>
        </div>
      </Form.Item>
    </Form>
    <p v-if="errorMessage" class="app-layout-editor__error">{{ errorMessage }}</p>
    <div class="app-layout-editor__actions">
      <Button type="primary" data-testid="app-layout-save" :loading="saving" :disabled="!canSave" @click="void onSave()">
        {{ t('persona.save') }}
      </Button>
      <Button data-testid="app-layout-reset" :loading="saving" @click="void onReset()">
        {{ t('persona.reset') }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.app-layout-editor__row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.app-layout-editor__add {
  margin-top: 8px;
}
.app-layout-editor__actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}
.app-layout-editor__error {
  color: var(--sm-color-error-text);
}
</style>
