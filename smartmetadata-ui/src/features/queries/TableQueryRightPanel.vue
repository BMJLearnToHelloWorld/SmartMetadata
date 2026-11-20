<!--
  Copyright 2026 SmartMetadata authors.

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0
-->
<template>
  <aside class="table-query-right-panel" data-testid="table-query-right-panel">
    <Spin v-if="isLoading" />
    <template v-else-if="query">
      <!-- Pin section order: owners, description, tags, users, used by. -->
      <section class="table-query-right-panel__section">
        <h3>{{ t('crud.owners') }}</h3>
        <template v-if="editingOwners">
          <Select
            v-model:value="editOwnerKeys"
            mode="multiple"
            show-search
            :options="ownerOptions"
            :loading="catalogLoading"
            data-testid="edit-owner-select"
          />
          <span class="table-query-right-panel__actions">
            <Button size="small" type="primary" :loading="saving" data-testid="save-owners-btn" @click="saveOwners">
              {{ t('crud.save') }}
            </Button>
            <Button size="small" data-testid="cancel-owners-btn" @click="editingOwners = false">
              {{ t('crud.cancel') }}
            </Button>
          </span>
        </template>
        <template v-else>
          <ul v-if="(query.owners ?? []).length > 0" class="table-query-right-panel__list">
            <li v-for="owner in query.owners" :key="owner.id ?? owner.name">
              {{ owner.displayName || owner.name }}
            </li>
          </ul>
          <p v-else class="table-query-right-panel__empty">
            {{ t('query.noEntity', { entity: t('crud.owners') }) }}
          </p>
          <Button
            v-if="permission.can('EditOwners')"
            size="small"
            type="link"
            data-testid="edit-owner"
            @click="enterOwnersEdit"
          >
            {{ t('query.editOwners') }}
          </Button>
        </template>
      </section>

      <section class="table-query-right-panel__section">
        <h3>{{ t('crud.description') }}</h3>
        <template v-if="editingDescription">
          <Input.TextArea v-model:value="editDescription" :rows="4" data-testid="edit-description-input" />
          <span class="table-query-right-panel__actions">
            <Button size="small" type="primary" :loading="saving" data-testid="save-description-btn" @click="saveDescription">
              {{ t('crud.save') }}
            </Button>
            <Button size="small" data-testid="cancel-description-btn" @click="editingDescription = false">
              {{ t('crud.cancel') }}
            </Button>
          </span>
        </template>
        <template v-else>
          <p v-if="query.description">{{ query.description }}</p>
          <p v-else class="table-query-right-panel__empty">
            {{ t('query.noEntity', { entity: t('crud.description') }) }}
          </p>
          <Button
            v-if="permission.can('EditDescription')"
            size="small"
            type="link"
            data-testid="edit-description"
            @click="enterDescriptionEdit"
          >
            {{ t('crud.edit') }}
          </Button>
        </template>
      </section>

      <section class="table-query-right-panel__section">
        <h3>{{ t('asset.fields.tags') }}</h3>
        <template v-if="editingTags">
          <Select
            v-model:value="editTagFqns"
            mode="multiple"
            show-search
            :options="tagOptions"
            :loading="catalogLoading"
            data-testid="edit-tags-select"
          />
          <span class="table-query-right-panel__actions">
            <Button size="small" type="primary" :loading="saving" data-testid="save-tags-btn" @click="saveTags">
              {{ t('crud.save') }}
            </Button>
            <Button size="small" data-testid="cancel-tags-btn" @click="editingTags = false">
              {{ t('crud.cancel') }}
            </Button>
          </span>
        </template>
        <template v-else>
          <!-- Pin TagsContainerV2 with tagType=Classification: only
               Classification labels render here — pin getFilterTags
               excludes `Tier.*` / `Certification.*` from the bucket;
               glossary labels are a separate surface and never appear
               in this panel. -->
          <ul v-if="classificationTags.length > 0" class="table-query-right-panel__list">
            <li v-for="tag in classificationTags" :key="tag.tagFQN">{{ tag.tagFQN }}</li>
          </ul>
          <p v-else class="table-query-right-panel__empty">
            {{ t('query.noEntity', { entity: t('asset.fields.tags') }) }}
          </p>
          <Button
            v-if="permission.can('EditTags')"
            size="small"
            type="link"
            data-testid="edit-tags"
            @click="enterTagsEdit"
          >
            {{ t('crud.edit') }}
          </Button>
        </template>
      </section>

      <section class="table-query-right-panel__section" data-testid="users">
        <h3>{{ t('query.users') }}</h3>
        <ul v-if="(query.users ?? []).length > 0" class="table-query-right-panel__list">
          <li v-for="user in query.users" :key="user.id ?? user.name">
            {{ user.displayName || user.name }}
          </li>
        </ul>
        <p v-else class="table-query-right-panel__empty">
          {{ t('query.noEntity', { entity: t('query.users') }) }}
        </p>
      </section>

      <section class="table-query-right-panel__section" data-testid="used-by">
        <h3>{{ t('query.usedBy') }}</h3>
        <ul v-if="(query.usedBy ?? []).length > 0" class="table-query-right-panel__list">
          <li v-for="usedBy in query.usedBy" :key="usedBy">{{ usedBy }}</li>
        </ul>
        <p v-else class="table-query-right-panel__empty">
          {{ t('query.noEntity', { entity: t('query.usedBy') }) }}
        </p>
      </section>
    </template>
  </aside>
</template>

<script setup lang="ts">
import type { JsonPatchOp } from '@/admin/jsonPatch';
import type { DataQuery } from '@/api/queries';
import type { DerivedPermissionFlags } from '@/api/permissions';
import { loadGovernanceCatalog, ownerKey, parseOwnerKey, classificationTagOptions, type GovernanceCatalog } from '@/governance/catalogOptions';
import { descriptionPatch, ownersPatch, tagsPatch, toTagLabel, type TagLabelInput, type TagLabelValue } from '@/governance/assetPatch';
import { isCertificationTag, isTierTag } from '@/ingestion/tierTags';
import type { TagRef } from '@/types/api';
import { Button, Input, message, Select, Spin } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{
  query?: DataQuery;
  isLoading: boolean;
  permission: DerivedPermissionFlags;
  /** Pin onQueryUpdate prop: patch + return the updated query, or reject so the section stays in edit mode. */
  onQueryUpdate: (id: string, ops: JsonPatchOp[]) => Promise<DataQuery>;
}>();

const { t } = useI18n();

const catalog = ref<GovernanceCatalog | null>(null);
const catalogLoading = ref(false);
const saving = ref(false);

const editingOwners = ref(false);
const editOwnerKeys = ref<string[]>([]);
const editingDescription = ref(false);
const editDescription = ref('');
const editingTags = ref(false);
const editTagFqns = ref<string[]>([]);

const ownerOptions = computed(() =>
  (catalog.value?.owners ?? []).map((owner) => ({ value: owner.key, label: owner.label })),
);
// Pin tagType=Classification: the editor offers Classification tags
// only — pin getFilterTags (TableTags.utils.tsx) excludes `Tier.*` and
// `Certification.*` labels from the Classification bucket, since those
// are edited on their own surfaces; glossary terms are never offered here.
const tagOptions = computed(() =>
  classificationTagOptions(catalog.value)
    .filter((tag) => !isTierTag(tag.tagFQN) && !isCertificationTag(tag.tagFQN))
    .map((tag) => ({ value: tag.tagFQN, label: tag.tagFQN })),
);

/**
 * Classification labels: the only tags this panel displays or edits.
 * Pin getFilterTags excludes `Tier.*` / `Certification.*` from the
 * Classification bucket; those labels keep their own surfaces and
 * must not be editable here.
 */
const classificationTags = computed(() =>
  (props.query?.tags ?? []).filter(
    (tag) =>
      tag.source === 'Classification' &&
      !isTierTag(tag.tagFQN) &&
      !isCertificationTag(tag.tagFQN),
  ),
);

/**
 * Every other label (glossary terms, Tier/Certification labels, plus
 * sourceless labels the mapper could not attribute): never displayed
 * or edited here, but carried through every tags save untouched, as
 * pin's handleClassificationTagsChange appends the Glossary bucket.
 */
const preservedTags = computed(() =>
  (props.query?.tags ?? []).filter(
    (tag) =>
      tag.source !== 'Classification' || isTierTag(tag.tagFQN) || isCertificationTag(tag.tagFQN),
  ),
);

async function ensureCatalog(): Promise<void> {
  if (catalog.value || catalogLoading.value) {
    return;
  }
  catalogLoading.value = true;
  try {
    catalog.value = await loadGovernanceCatalog();
  } catch {
    // Options stay empty; the editor still opens so the user can clear values.
  } finally {
    catalogLoading.value = false;
  }
}

function enterOwnersEdit(): void {
  editOwnerKeys.value = (props.query?.owners ?? []).flatMap((owner) =>
    owner.id ? [ownerKey(owner.id, owner.type ?? 'user')] : [],
  );
  editingOwners.value = true;
  void ensureCatalog();
}

function enterDescriptionEdit(): void {
  editDescription.value = props.query?.description ?? '';
  editingDescription.value = true;
}

function enterTagsEdit(): void {
  editTagFqns.value = classificationTags.value.map((tag) => tag.tagFQN);
  editingTags.value = true;
  void ensureCatalog();
}

/** A label normalized the way toTagLabel writes it, for no-change comparison. */
function normalizeTagLabel(tag: TagRef): TagLabelValue {
  return {
    tagFQN: tag.tagFQN,
    source: tag.source ?? 'Classification',
    labelType: tag.labelType ?? 'Manual',
    state: tag.state ?? 'Confirmed',
  };
}

/** Order-insensitive label-set equality: a pure reorder is not a change. */
function sameTagLabels(current: TagRef[] | undefined, next: TagLabelValue[]): boolean {
  const byFqn = (a: TagLabelValue, b: TagLabelValue): number => a.tagFQN.localeCompare(b.tagFQN);
  const before = (current ?? []).map(normalizeTagLabel).sort(byFqn);
  const after = [...next].sort(byFqn);
  return JSON.stringify(before) === JSON.stringify(after);
}

function ownerRefKey(owner: { id?: string; type?: string }): string | undefined {
  return owner.id ? `${owner.type ?? 'user'}:${owner.id}` : undefined;
}

async function saveOwners(): Promise<void> {
  if (!props.query?.id) {
    return;
  }
  const owners = editOwnerKeys.value.flatMap((key) => {
    const parsed = parseOwnerKey(key);
    return parsed ? [parsed] : [];
  });
  // No-change guard (pin compare() → empty ops): an untouched owner set
  // closes the editor without a PATCH.
  const before = new Set(
    (props.query.owners ?? []).flatMap((owner) => {
      const key = ownerRefKey(owner);
      return key ? [key] : [];
    }),
  );
  const after = new Set(owners.map((owner) => `${owner.type}:${owner.id}`));
  if (before.size === after.size && [...after].every((key) => before.has(key))) {
    editingOwners.value = false;
    return;
  }
  saving.value = true;
  try {
    await props.onQueryUpdate(props.query.id, ownersPatch(props.query.owners, owners));
    editingOwners.value = false;
  } catch {
    message.error(t('query.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function saveDescription(): Promise<void> {
  if (!props.query?.id) {
    return;
  }
  // No-change guard (pin compare() → empty ops): untouched text closes
  // the editor without a PATCH.
  if (editDescription.value === (props.query.description ?? '')) {
    editingDescription.value = false;
    return;
  }
  saving.value = true;
  try {
    await props.onQueryUpdate(
      props.query.id,
      descriptionPatch(props.query.description, editDescription.value),
    );
    editingDescription.value = false;
  } catch {
    message.error(t('query.updateFailed'));
  } finally {
    saving.value = false;
  }
}

async function saveTags(): Promise<void> {
  if (!props.query?.id) {
    return;
  }
  // Same labelType/state overlay as the asset editor: the catalog carries
  // neither, so the existing tag's values are preserved onto the option;
  // fresh picks default to Manual/Confirmed in toTagLabel.
  const classificationInputs: TagLabelInput[] = editTagFqns.value.flatMap((fqn) => {
    const existing = classificationTags.value.find((tag) => tag.tagFQN === fqn);
    const fromCatalog = classificationTagOptions(catalog.value).find((tag) => tag.tagFQN === fqn);
    if (fromCatalog) {
      return [{ ...fromCatalog, labelType: existing?.labelType, state: existing?.state }];
    }
    if (existing) {
      return [{
        tagFQN: existing.tagFQN,
        name: existing.name ?? existing.tagFQN,
        source: 'Classification' as const,
        labelType: existing.labelType,
        state: existing.state,
      }];
    }
    return [];
  });
  const preservedInputs: TagLabelInput[] = preservedTags.value.map((tag) => ({
    tagFQN: tag.tagFQN,
    name: tag.name ?? tag.tagFQN,
    source: tag.source ?? 'Classification',
    labelType: tag.labelType,
    state: tag.state,
  }));
  const inputs = [...classificationInputs, ...preservedInputs];
  // No-change guard (pin compare() → empty ops): an unchanged label set
  // closes the editor without a PATCH, so a no-op save cannot rewrite
  // any label — a Suggested label stays Suggested.
  if (sameTagLabels(props.query.tags, inputs.map(toTagLabel))) {
    editingTags.value = false;
    return;
  }
  saving.value = true;
  try {
    await props.onQueryUpdate(props.query.id, tagsPatch(props.query.tags, inputs));
    editingTags.value = false;
  } catch {
    message.error(t('query.updateFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.table-query-right-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 16px;
}

.table-query-right-panel__section h3 {
  margin: 0 0 8px;
  font-size: 14px;
}

.table-query-right-panel__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.table-query-right-panel__empty {
  margin: 0;
  color: var(--sm-color-text-secondary);
}

.table-query-right-panel__actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
