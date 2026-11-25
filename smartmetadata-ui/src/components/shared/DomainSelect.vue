<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Dropdown, Menu, Select, Tooltip } from 'ant-design-vue';
import { computed, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import SmIcon from '@/components/shared/SmIcon.vue';
import { useDomainStore } from '@/stores/domain';

/**
 * Official DomainSelect bridge: the active domain plus the user's
 * domains, with a scope switch. The list is wired to GET /v1/domains
 * through the domain store; a load failure leaves the scope at All
 * Domains with the failure surfaced, never a silent empty list.
 * Domain restriction (isDomainRestricted) is residual: no product
 * endpoint for it was located.
 *
 * Two trigger forms (pin `components/common/DomainSelect`, NavBar
 * `:478-510`): the `select` form is the page-filter dropdown used by
 * SearchView / MembersEntityPicker / metric option loaders and only
 * scopes the shell selection; the `button` form is the navbar scope
 * switcher — a button trigger showing the active domain (or "All
 * Domains") with a globe icon, turning brand when a domain is
 * selected — and switches through the server-persisted
 * `switchDomain` + page reload (pin `useSwitchActiveDomain`).
 */
const props = withDefaults(
  defineProps<{ testId?: string; triggerVariant?: 'select' | 'button' }>(),
  { testId: 'domain-select', triggerVariant: 'select' },
);
const { t } = useI18n();
const router = useRouter();
const domainStore = useDomainStore();

onMounted(() => {
  domainStore.hydrate();
  if (!domainStore.loaded) {
    void domainStore.loadDomains();
  }
});

/**
 * Pin NavBar `:469`: the disabled trigger branch is for a
 * domain-restricted user with exactly one domain. The product reports
 * `isDomainRestricted: false` (no endpoint), so this never fires
 * today; the branch exists so the behaviour is correct when the
 * endpoint lands (ADR:2026-11-25-nav-domain-persona).
 */
const isSingleDomainUser = computed(
  () => domainStore.isDomainRestricted && domainStore.domains.length === 1,
);

const domainLabel = computed(
  () =>
    domainStore.activeDomain?.displayName ||
    domainStore.activeDomain?.name ||
    t('chrome.domainAll'),
);

const buttonTooltip = computed(() => {
  if (isSingleDomainUser.value) {
    return t('chrome.domainAccessRestricted');
  }
  if (domainStore.switchErrorMessage) {
    return t('chrome.domainSwitchFailed');
  }
  if (domainStore.errorMessage) {
    return t('chrome.domainLoadFailed');
  }
  return '';
});

const selectedMenuKeys = computed(() => [domainStore.activeDomainId ?? '__all__']);

function onChange(value: unknown): void {
  domainStore.selectDomain(typeof value === 'string' && value ? value : null);
}

async function onMenuClick({ key }: { key: string | number }): Promise<void> {
  const id = String(key) === '__all__' ? null : String(key);
  // Pin `useSwitchActiveDomain`: the page reloads after a successful
  // switch so the server applies the new scope to every list; a
  // failed switch leaves the scope untouched and does not reload.
  const switched = await domainStore.switchDomain(id);
  if (switched) {
    router.go(0);
  }
}
</script>

<template>
  <Tooltip v-if="props.triggerVariant === 'button'" :title="buttonTooltip">
    <Dropdown :trigger="['click']" :disabled="isSingleDomainUser">
      <button
        type="button"
        :data-testid="props.testId"
        class="domain-select__trigger"
        :class="{ 'domain-select__trigger--active': !!domainStore.activeDomainId }"
        :disabled="isSingleDomainUser"
        :aria-label="t('chrome.domainSelect')"
      >
        <SmIcon icon-key="action-globe" class="domain-select__globe" />
        <span class="domain-select__label">{{ domainLabel }}</span>
        <SmIcon icon-key="action-chevron-down" class="domain-select__caret" />
      </button>
      <template #overlay>
        <Menu
          data-testid="domain-dropdown-menu"
          :selected-keys="selectedMenuKeys"
          @click="onMenuClick"
        >
          <Menu.Item key="__all__" data-testid="domain-option-all">
            {{ t('chrome.domainAll') }}
          </Menu.Item>
          <Menu.Item
            v-for="domain in domainStore.domains"
            :key="domain.id ?? domain.name"
            :data-testid="`domain-option-${domain.id ?? domain.name}`"
          >
            {{ domain.displayName || domain.name }}
          </Menu.Item>
        </Menu>
      </template>
    </Dropdown>
  </Tooltip>
  <Tooltip v-else :title="domainStore.errorMessage ? t('chrome.domainLoadFailed') : ''">
    <Select
      :data-testid="props.testId"
      :value="domainStore.activeDomainId ?? ''"
      :loading="domainStore.loading"
      :aria-label="t('chrome.domainSelect')"
      style="min-width: 160px"
      @change="onChange"
    >
      <Select.Option value="">{{ t('chrome.domainAll') }}</Select.Option>
      <Select.Option
        v-for="domain in domainStore.domains"
        :key="domain.id ?? domain.name"
        :value="domain.id ?? domain.name"
      >
        {{ domain.displayName || domain.name }}
      </Select.Option>
    </Select>
  </Tooltip>
</template>

<style scoped>
.domain-select__trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  max-width: 15vw;
  padding: 0 10px;
  border: 1px solid var(--sm-border-secondary);
  border-radius: 10px;
  background: transparent;
  color: var(--sm-text-secondary);
  font-size: 13px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}
.domain-select__trigger:hover {
  color: var(--sm-color-primary);
  background: var(--sm-bg-base);
}
.domain-select__trigger--active {
  color: var(--sm-color-primary);
  background: var(--sm-color-primary-bg);
  border-color: var(--sm-color-primary);
}
.domain-select__trigger:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.domain-select__label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.domain-select__globe {
  font-size: 16px;
  flex: none;
}
.domain-select__caret {
  font-size: 10px;
  flex: none;
}
</style>
