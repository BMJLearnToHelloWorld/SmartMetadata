<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { DatabaseOutlined, EditOutlined, GlobalOutlined, UserOutlined } from '@ant-design/icons-vue';
import { Button, message, Popover, Select, Tooltip } from 'ant-design-vue';
import { patchService } from '@/api/servicePatch';
import {
  loadGovernanceCatalog,
  ownerKey,
  parseOwnerKey,
  type GovernanceCatalog,
  type OwnerOption,
} from '@/governance/catalogOptions';
import { domainsPatch, ownersPatch } from '@/governance/assetPatch';
import { getTierTag, tierTagsPatch } from '@/ingestion/tierTags';
import type { EntityRef } from '@/types/api';
import type { CatalogService, ServiceKind, ServiceTagLabel } from '@/types/ingestion';
import TierPicker from './TierPicker.vue';
import ServiceChildOwnersCell from './ServiceChildOwnersCell.vue';

/**
 * Service header facets, ported from official
 * components/integration/ConnectionServiceDetailsPage/DataAssetHeaderDetailsRow/DataAssetHeaderDetailsRow.tsx
 * (pin a3012259ca): domain · owners · tier, separated by dots, each with
 * a gated edit affordance. The visibility slot is not built (no product
 * counterpart), and metadata services render no domain facet.
 *
 * Writes are owned here, mirroring the pin integration page callbacks:
 * owners and domains are whole-array replaces (an empty selection
 * clears), the tier write filters out every `Tier.*` label, appends one
 * Classification/Manual/Confirmed label, and passes retained labels
 * through untouched via the frozen `tierTagsPatch`. A successful PATCH
 * emits `updated` with the response (no refetch); a failed domain/owner
 * save toasts and keeps the picker open with its draft, while a failed
 * tier save rethrows so TierPicker toasts (the pin TierCard owns that
 * toast). Edit buttons are not rendered when their gate denies — never
 * merely disabled. Only the tier edit button opens the picker (ADR-7);
 * the pin opens it from the whole tier block.
 */

const props = withDefaults(
  defineProps<{
    serviceId: string;
    serviceKind: ServiceKind;
    owners?: EntityRef[];
    domains?: EntityRef[];
    tags?: ServiceTagLabel[];
    canEditDomains: boolean;
    canEditOwners: boolean;
    canEditTier: boolean;
    /** Metadata services render no domain facet; defaults to kind !== 'metadata'. */
    showDomain?: boolean;
  }>(),
  {
    owners: undefined,
    domains: undefined,
    tags: undefined,
    showDomain: undefined,
  },
);

const emit = defineEmits<{
  updated: [service: CatalogService];
}>();

const { t } = useI18n();

const showDomainFacet = computed(() => props.showDomain ?? props.serviceKind !== 'metadata');
const tier = computed(() => getTierTag(props.tags ?? []));
const tierText = computed(() =>
  tier.value
    ? (tier.value.displayName ?? tier.value.name ?? tier.value.tagFQN)
    : t('serviceDetail.facets.addTier'),
);
const firstDomain = computed(() => props.domains?.[0]);
const extraDomains = computed(() =>
  props.domains && props.domains.length > 1 ? props.domains.slice(1) : [],
);
const hasOwners = computed(() => (props.owners ?? []).length > 0);

const catalog = ref<GovernanceCatalog | null>(null);
const catalogPromise = ref<Promise<GovernanceCatalog> | null>(null);
const catalogLoading = ref(false);

async function ensureCatalog(): Promise<void> {
  if (catalog.value || catalogPromise.value) {
    return;
  }
  catalogLoading.value = true;
  try {
    catalog.value = await (catalogPromise.value = loadGovernanceCatalog());
  } catch {
    // A failed load must not poison the cache: reset so the next
    // picker open retries, and toast so the empty picker is not silent.
    catalogPromise.value = null;
    message.error(t('shared.loadFailed'));
  } finally {
    catalogLoading.value = false;
  }
}

const domainPickerOpen = ref(false);
const domainDraft = ref<string[]>([]);
const savingDomain = ref(false);

watch(domainPickerOpen, (open) => {
  if (open) {
    domainDraft.value = (props.domains ?? [])
      .map((domain) => domain.id)
      .filter((id): id is string => Boolean(id));
    ensureCatalog();
  }
});

const domainOptions = computed(() =>
  (catalog.value?.domains ?? []).map((domain) => ({
    value: domain.id,
    label: domain.displayName ?? domain.name,
  })),
);

async function saveDomains(): Promise<void> {
  savingDomain.value = true;
  try {
    const response = await patchService(
      props.serviceKind,
      props.serviceId,
      domainsPatch(props.domains, domainDraft.value),
    );
    emit('updated', response);
    domainPickerOpen.value = false;
  } catch {
    message.error(t('serviceDetail.facets.domainUpdateError'));
  } finally {
    savingDomain.value = false;
  }
}

const ownerPickerOpen = ref(false);
const ownerDraft = ref<string[]>([]);
const savingOwners = ref(false);

watch(ownerPickerOpen, (open) => {
  if (open) {
    ownerDraft.value = (props.owners ?? [])
      .filter((owner) => owner.id && (owner.type === 'user' || owner.type === 'team'))
      .map((owner) => ownerKey(owner.id as string, owner.type as 'user' | 'team'));
    ensureCatalog();
  }
});

const ownerOptions = computed(() =>
  (catalog.value?.owners ?? []).map((option: OwnerOption) => ({
    value: option.key,
    label: option.label,
  })),
);

async function saveOwners(): Promise<void> {
  savingOwners.value = true;
  try {
    const owners = ownerDraft.value.flatMap((key) => {
      const parsed = parseOwnerKey(key);
      return parsed ? [{ id: parsed.id, type: parsed.type }] : [];
    });
    const response = await patchService(
      props.serviceKind,
      props.serviceId,
      ownersPatch(props.owners, owners),
    );
    emit('updated', response);
    ownerPickerOpen.value = false;
  } catch {
    message.error(t('serviceDetail.facets.ownerUpdateError'));
  } finally {
    savingOwners.value = false;
  }
}

async function handleTierUpdate(tag?: {
  fullyQualifiedName?: string;
  name: string;
}): Promise<void> {
  const response = await patchService(
    props.serviceKind,
    props.serviceId,
    tierTagsPatch(props.tags ?? [], tag ? (tag.fullyQualifiedName ?? tag.name) : undefined),
  );
  emit('updated', response);
}
</script>

<template>
  <div class="service-header-facets" data-testid="entity-meta-strip">
    <!-- Domain -->
    <div v-if="showDomainFacet" class="facet">
      <Tooltip :title="t('serviceDetail.facets.domain')">
        <GlobalOutlined class="facet-icon" />
      </Tooltip>
      <Tooltip v-if="firstDomain" :title="firstDomain.displayName ?? firstDomain.name">
        <span class="facet-text facet-truncate">{{
          firstDomain.displayName ?? firstDomain.name
        }}</span>
      </Tooltip>
      <span v-else class="facet-text">{{ t('serviceDetail.facets.addDomain') }}</span>
      <Popover v-if="extraDomains.length > 0" trigger="click" placement="bottomLeft">
        <Button
          data-testid="domain-count-button"
          size="small"
          shape="round"
          type="text"
          class="facet-count-button"
        >
          +{{ extraDomains.length }}
        </Button>
        <template #content>
          <div class="facet-domain-list" data-testid="domain-count-popover">
            <div v-for="domain in extraDomains" :key="domain.id" class="facet-domain-row">
              <GlobalOutlined class="facet-icon-small" />
              <Tooltip :title="domain.displayName ?? domain.name">
                <span class="facet-text facet-truncate-wide">{{
                  domain.displayName ?? domain.name
                }}</span>
              </Tooltip>
            </div>
          </div>
        </template>
      </Popover>
      <Popover
        v-if="canEditDomains"
        v-model:open="domainPickerOpen"
        trigger="click"
        placement="bottomLeft"
      >
        <Button
          data-testid="edit-domain-button"
          size="small"
          type="text"
          :title="t('serviceDetail.facets.editDomain')"
        >
          <EditOutlined />
        </Button>
        <template #content>
          <div class="facet-picker" data-testid="domain-picker">
            <Select
              v-model:value="domainDraft"
              data-testid="domain-picker-select"
              mode="multiple"
              :options="domainOptions"
              :loading="catalogLoading"
              :placeholder="t('serviceDetail.facets.selectDomains')"
              allow-clear
              style="width: 280px"
            />
            <div class="facet-picker-actions">
              <Button
                data-testid="domain-picker-cancel"
                size="small"
                :disabled="savingDomain"
                @click="domainPickerOpen = false"
              >
                {{ t('crud.cancel') }}
              </Button>
              <Button
                data-testid="domain-picker-save"
                size="small"
                type="primary"
                :loading="savingDomain"
                @click="saveDomains"
              >
                {{ t('crud.save') }}
              </Button>
            </div>
          </div>
        </template>
      </Popover>
    </div>

    <span v-if="showDomainFacet" class="facet-dot" aria-hidden="true">•</span>

    <!-- Owners -->
    <div class="facet">
      <Tooltip :title="t('serviceDetail.facets.owner')">
        <UserOutlined class="facet-icon" />
      </Tooltip>
      <ServiceChildOwnersCell v-if="hasOwners" :owners="owners ?? []" />
      <span v-else class="facet-text facet-truncate">{{
        t('serviceDetail.facets.addOwner')
      }}</span>
      <Popover
        v-if="canEditOwners"
        v-model:open="ownerPickerOpen"
        trigger="click"
        placement="bottomLeft"
      >
        <Button
          data-testid="edit-owner-button"
          size="small"
          type="text"
          :title="t('serviceDetail.facets.editOwners')"
        >
          <EditOutlined />
        </Button>
        <template #content>
          <div class="facet-picker" data-testid="owner-picker">
            <Select
              v-model:value="ownerDraft"
              data-testid="owner-picker-select"
              mode="multiple"
              :options="ownerOptions"
              :loading="catalogLoading"
              :placeholder="t('serviceDetail.facets.selectOwners')"
              allow-clear
              style="width: 280px"
            />
            <div class="facet-picker-actions">
              <Button
                data-testid="owner-picker-cancel"
                size="small"
                :disabled="savingOwners"
                @click="ownerPickerOpen = false"
              >
                {{ t('crud.cancel') }}
              </Button>
              <Button
                data-testid="owner-picker-save"
                size="small"
                type="primary"
                :loading="savingOwners"
                @click="saveOwners"
              >
                {{ t('crud.save') }}
              </Button>
            </div>
          </div>
        </template>
      </Popover>
    </div>

    <span class="facet-dot" aria-hidden="true">•</span>

    <!-- Tier -->
    <div class="facet" data-testid="tier-container">
      <Tooltip :title="t('label.tier')">
        <DatabaseOutlined class="facet-icon" />
      </Tooltip>
      <span class="facet-text" :class="{ 'facet-truncate': tier }">{{ tierText }}</span>
      <TierPicker
        v-if="canEditTier"
        :current-tier="tier?.tagFQN"
        :update-tier="handleTierUpdate"
      >
        <Button
          data-testid="edit-tier-button"
          size="small"
          type="text"
          aria-haspopup="dialog"
          :title="t('serviceDetail.facets.editTier')"
        >
          <EditOutlined />
        </Button>
      </TierPicker>
    </div>
  </div>
</template>

<style scoped>
.service-header-facets {
  align-items: center;
  display: flex;
  gap: 12px;
  margin-top: 4px;
}

.facet {
  align-items: center;
  display: flex;
  gap: 8px;
  min-width: 0;
}

.facet-icon {
  color: var(--sm-text-quaternary);
  flex-shrink: 0;
  font-size: 16px;
}

.facet-icon-small {
  color: var(--sm-text-quaternary);
  flex-shrink: 0;
  font-size: 14px;
}

.facet-text {
  white-space: nowrap;
}

.facet-truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.facet-truncate-wide {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.facet-dot {
  color: var(--sm-text-quaternary);
}

.facet-count-button {
  height: auto;
  min-height: 0;
  padding: 0 6px;
}

.facet-domain-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.facet-domain-row {
  align-items: center;
  display: flex;
  gap: 6px;
}

.facet-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.facet-picker-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}
</style>
