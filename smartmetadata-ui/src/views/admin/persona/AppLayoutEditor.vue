<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Form, Radio, Select } from 'ant-design-vue';
import type { Persona, PersonaDocument, ViewModePage } from '@/types/persona';
import {
  DEFAULT_LANDING_PAGE,
  LANDING_PAGE_SECTIONS,
  VIEW_MODE_PAGES,
  getPersonaPreferences,
  resolvePersonaLandingPage,
} from '../personaPage';
import { deepEqualJson } from './editors/customizeTypes';
import CustomizeLeaveModal from './editors/CustomizeLeaveModal.vue';
import { useSaveLeaveGuard } from './editors/useSaveLeaveGuard';

/**
 * App-layout editor, callback-style (C-4 §2.2): the editor never
 * issues document requests itself. It reports the edited preferences
 * through onSave; the parent executes the callback-4 equivalent
 * (updatePersonaAppLayout + save) and reproduces the failure-throw
 * semantics. A save failure rejects here (never swallowed) so the
 * NavigationBlocker-equivalent Save-and-leave stays on the page.
 *
 * Sentinel mapping mirrors official PersonaAppLayoutPage handleSave:
 * appMode 'none' (the product sentinel for official 'null') →
 * undefined, the default landing page → undefined, empty view modes
 * → undefined. The landing-page fallback is "non-curated value",
 * not just "unconfigured" (resolvePersonaLandingPage, verified
 * against official resolvePersonaLandingPage).
 *
 * M3: the AI option is DISABLED, not hidden — label and testid are
 * kept, a stored appMode:'AI' renders selected-disabled, the user
 * may switch to none/classic, and reset to none is unrestricted.
 * Reset is local-only (sentinel + default landing page + empty view
 * modes); it never saves.
 */
export interface AppLayoutPreferences {
  appMode?: 'classic' | 'AI';
  defaultLandingPage?: string;
  defaultViewModes?: Record<string, string>;
}

const props = defineProps<{
  persona: Persona;
  document: PersonaDocument;
  onSave: (preferences: AppLayoutPreferences) => Promise<void>;
}>();

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

const isDirty = computed(
  () =>
    appMode.value !== persistedAppMode.value ||
    landingPage.value !== persistedLandingPage.value ||
    !deepEqualJson(viewModes.value, persistedViewModes.value),
);
const canSave = computed(() => isDirty.value);

function setPageViewMode(page: ViewModePage, view: string): void {
  viewModes.value = { ...viewModes.value, [page]: view };
}

function removePageViewMode(page: ViewModePage): void {
  const next = { ...viewModes.value };
  delete next[page];
  viewModes.value = next;
}

function toPreferences(): AppLayoutPreferences {
  return {
    appMode: appMode.value === 'none' ? undefined : (appMode.value as 'classic' | 'AI'),
    defaultLandingPage:
      landingPage.value === DEFAULT_LANDING_PAGE ? undefined : landingPage.value,
    defaultViewModes: Object.keys(viewModes.value).length ? { ...viewModes.value } : undefined,
  };
}

async function save(): Promise<void> {
  saving.value = true;
  errorMessage.value = '';
  try {
    // R-ENTRY-TOAST: no toast here — the parent callback owns all
    // toasts (official CustomizablePage.tsx handlers), and the
    // editor stays silent on success.
    await props.onSave(toPreferences());
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('persona.saveFailed');
    throw error;
  } finally {
    saving.value = false;
  }
}

async function onSaveClick(): Promise<void> {
  // The button path surfaces the failure inline (errorMessage is
  // already set); the throw contract is for the leave-guard path.
  await save().catch(() => undefined);
}

function onReset(): void {
  // Local-only reset: no request, no callback. The dirty state
  // recomputes against the persisted values; saving stays explicit.
  appMode.value = 'none';
  landingPage.value = DEFAULT_LANDING_PAGE;
  viewModes.value = {};
}

const guard = useSaveLeaveGuard({
  isDirty: () => isDirty.value,
  onSaveAndLeave: save,
});
</script>

<template>
  <div data-testid="app-layout-editor">
    <Form layout="vertical">
      <Form.Item :label="t('persona.appMode')">
        <Radio.Group v-model:value="appMode" data-testid="app-mode-select">
          <Radio value="none" data-testid="app-mode-none">{{ t('persona.appModeNone') }}</Radio>
          <Radio value="classic" data-testid="app-mode-classic">{{ t('persona.appModeClassic') }}</Radio>
          <Radio value="AI" data-testid="app-mode-ai" :disabled="true">{{ t('persona.appModeAi') }}</Radio>
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
      <Button type="primary" data-testid="app-layout-save" :loading="saving" :disabled="!canSave" @click="void onSaveClick()">
        {{ t('persona.save') }}
      </Button>
      <Button data-testid="app-layout-reset" :loading="saving" @click="onReset()">
        {{ t('persona.reset') }}
      </Button>
    </div>
    <CustomizeLeaveModal
      :open="guard.showLeaveModal.value"
      :saving="saving"
      @save-and-exit="guard.saveAndLeave()"
      @discard="guard.discardAndLeave()"
      @cancel="guard.cancelLeave()"
    />
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
