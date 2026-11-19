<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of pin PersonaPage.tsx: breadcrumb + PageHeader + an
  unconditional Add button, a card grid with cursor paging, three
  skeleton cards while loading, and an early-return CreatePlaceholder
  (no doc link) when the list is empty and not loading. There is no
  page-size selector: pin never passes onShowSizeChange (K-1). Paging
  goes through the shared useCursorPagedList + NextPrevious contract
  (§15): the hook has no initial-page-size option, so the list starts
  at 15 (or the persisted T-5 preference) rather than pin's 12, and
  it does not sync cursors to the URL — both are recorded divergences
  in the batch report. After a create, the current page is refetched
  without resetting the cursor.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Col, Row, Skeleton } from 'ant-design-vue';
import { listPersonas } from '@/api/persona';
import { useCursorPagedList } from '@/composables/useCursorPagedList';
import CreatePlaceholder from '@/components/shared/CreatePlaceholder.vue';
import NextPrevious from '@/components/shared/NextPrevious.vue';
import PageHeader from '@/components/shared/PageHeader.vue';
import SmBreadcrumb from '@/components/shared/SmBreadcrumb.vue';
import { buildSettingsBreadcrumbCatalog, getSettingPageBreadcrumbs, toSmBreadcrumbItems } from '@/settings/breadcrumbs';
import { resolveSettingsLocation } from '@/settings/locationResolver';
import { SETTINGS_BREADCRUMB_NAMES, type SettingsTranslator } from '@/settings/registry';
import { useAuthStore } from '@/stores/auth';
import AddEditPersona from './persona/AddEditPersona.vue';
import PersonaDetailsCard from './persona/PersonaDetailsCard.vue';

const { t } = useI18n();
const settingsTranslator = ((key: string, params?: Record<string, string>) => t(key, params ?? {})) as SettingsTranslator;
const breadcrumbItems = computed(() =>
  toSmBreadcrumbItems(
    getSettingPageBreadcrumbs(
      buildSettingsBreadcrumbCatalog('settings.title', SETTINGS_BREADCRUMB_NAMES, settingsTranslator),
      resolveSettingsLocation,
      'persona',
    ),
  ),
);
const authStore = useAuthStore();

const createOpen = ref(false);
const isAdminUser = computed(() => authStore.user?.isAdmin === true);

const { items, paging, isLoading, page, pageSize, showPagination, onPageChange } =
  useCursorPagedList(
    async ({ after, before, limit }) => {
      const response = await listPersonas({ limit, fields: 'users', after, before });
      return {
        data: response.data,
        paging: { after: response.after, before: response.before, total: response.total ?? 0 },
      };
    },
    {
      persistence: { storage: window.localStorage, userName: () => authStore.user?.name },
    },
  );

const isEmpty = computed(() => items.value.length === 0);

async function handleSave(): Promise<void> {
  createOpen.value = false;
  await onPageChange(page.value);
}
</script>

<template>
  <div data-testid="persona-list">
    <div v-if="isEmpty && !isLoading" style="text-align: center; width: 100%">
      <div style="position: relative; height: 100%; width: 100%; min-height: 240px">
        <CreatePlaceholder
          button-id="add-persona-button"
          :test-id="`create-error-placeholder-${t('label.persona')}`"
          :heading="t('label.persona')"
          :permission="isAdminUser"
          :permission-value="t('label.create-entity', { entity: t('label.persona') })"
          :on-create="() => { createOpen = true; }"
        />
      </div>
    </div>
    <template v-else>
      <SmBreadcrumb :items="breadcrumbItems" />
      <div style="display: flex; align-items: flex-start; justify-content: space-between">
        <PageHeader
          :header="t('label.persona-plural')"
          :sub-header="t('message.page-sub-header-for-persona')"
        />
        <Button type="primary" data-testid="add-persona-button" @click="createOpen = true">
          {{ t('label.add-entity', { entity: t('label.persona') }) }}
        </Button>
      </div>
      <Row :gutter="[16, 16]">
        <template v-if="isLoading">
          <Col v-for="key in [1, 2, 3]" :key="key" :xs="24" :sm="12" :lg="8">
            <div data-testid="skeleton-card-loader">
              <Card>
                <Skeleton :paragraph="{ rows: 3 }" :title="false" active />
              </Card>
            </div>
          </Col>
        </template>
        <template v-else>
          <Col v-for="persona in items" :key="persona.id" :xs="24" :sm="12" :lg="8">
            <PersonaDetailsCard :persona="persona" />
          </Col>
        </template>
      </Row>
      <div v-if="showPagination" style="display: flex; justify-content: center; margin: 12px 0">
        <NextPrevious
          :paging="paging"
          :paging-handler="({ currentPage }) => onPageChange(currentPage)"
          :page-size="pageSize"
          :current-page="page"
          :is-loading="isLoading"
        />
      </div>
    </template>
    <AddEditPersona
      :open="createOpen"
      :on-save="() => void handleSave()"
      :on-cancel="() => { createOpen = false; }"
    />
  </div>
</template>
