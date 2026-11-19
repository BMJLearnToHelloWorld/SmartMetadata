<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Alert, Button, Input, Select, Switch } from 'ant-design-vue';
import {
  ApiOutlined,
  CloseOutlined,
  CommentOutlined,
  IdcardOutlined,
  MailOutlined,
  MessageOutlined,
  SlackOutlined,
  StarOutlined,
  TeamOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import type { AlertSelectionState } from '@/composables/useAlertSelection';
import type { EventSubscriptionDestination } from '@/types/quality';
import type { AlertFormDestination, ModifiedWebhookConfig } from '@/types/notifications';
import type { AlertFormValidationErrors } from '@/utils/notifications/alertValidation';
import {
  buildGroupedOptions,
  checkIfDestinationIsInternal,
  getDestinationStatusDetails,
  getDestinationStatusLabel,
} from '@/utils/notifications/alertDestinations';
import {
  getDestinationTypeUpdate,
  getDestinationWithNotifyDownstream,
} from '@/utils/notifications/alertFormUtils';
import { getSubscriptionTypeOptions, type TranslateFn } from '@/utils/notifications/alertUtils';
import { startCase } from '@/utils/text';
import { splitTransElement } from '@/utils/emptyPlaceholder';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import DestinationConfigField from './DestinationConfigField.vue';

/**
 * One destination row, ported from pin
 * components/Alerts/DestinationFormItem/DestinationSelectItem/DestinationSelectItem.tsx.
 * The category select offers the grouped internal/external options;
 * internal destinations pick a delivery type and may warn about the
 * combination; the tested status shows only while the row still
 * equals the tested destination.
 */
const props = withDefaults(
  defineProps<{
    id: number;
    destination: AlertFormDestination;
    destinationsWithStatus?: (EventSubscriptionDestination | undefined)[];
    isConfigExpanded?: boolean;
    isDestinationStatusLoading?: boolean;
    isViewMode?: boolean;
    selection: AlertSelectionState;
    validationErrors: AlertFormValidationErrors;
    hooks: AlertSearchHooks;
  }>(),
  {
    destinationsWithStatus: undefined,
    isConfigExpanded: false,
    isDestinationStatusLoading: false,
    isViewMode: false,
  },
);
const emit = defineEmits<{
  'update:destination': [destination: AlertFormDestination];
  remove: [];
  'config-expanded-change': [isExpanded: boolean];
}>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const CATEGORY_ICONS: Record<string, typeof TeamOutlined> = {
  Teams: TeamOutlined,
  Users: UserOutlined,
  Admins: IdcardOutlined,
  Assignees: UserAddOutlined,
  Mentions: CommentOutlined,
  GChat: MessageOutlined,
  Slack: SlackOutlined,
  Email: MailOutlined,
  MsTeams: MessageOutlined,
  Followers: StarOutlined,
  Webhook: ApiOutlined,
  Owners: UserOutlined,
};

const destinationType = computed(() => props.destination.destinationType);
const subscriptionType = computed(() => props.destination.type);
const notifyDownstream = computed(() => props.destination.notifyDownstream ?? false);
const isInternalDestinationSelected = computed(() =>
  checkIfDestinationIsInternal(destinationType.value ?? ''),
);

const groupedOptions = computed(() =>
  buildGroupedOptions(
    t('label.internal'),
    t('label.external'),
    props.selection.support.recipientCategories,
    isInternalDestinationSelected.value ? destinationType.value : undefined,
  ),
);

const isSelectionWarningDismissed = ref(false);

const destinationStatusDetails = computed(() =>
  getDestinationStatusDetails(props.destination, props.destinationsWithStatus, props.id),
);
const statusLabel = computed(() =>
  getDestinationStatusLabel(destinationStatusDetails.value?.status, translate),
);
const statusAlertType = computed(() =>
  destinationStatusDetails.value?.status === 'Success' ? 'success' : 'error',
);
const isStatusHidden = ref(false);
watch(destinationStatusDetails, () => {
  isStatusHidden.value = false;
});

function handleDestinationTypeSelect(value: string | undefined): void {
  if (!value || value.startsWith('header-')) {
    return;
  }
  isSelectionWarningDismissed.value = false;
  emit('update:destination', getDestinationTypeUpdate(props.destination, value));
}

function handleTypeSelect(value: string | undefined): void {
  isSelectionWarningDismissed.value = false;
  emit('update:destination', { ...props.destination, type: value as AlertFormDestination['type'] });
}

function handleNotifyDownstreamChange(checked: boolean): void {
  emit(
    'update:destination',
    getDestinationWithNotifyDownstream(props.destination, checked),
  );
}

function handleConfigUpdate(config: ModifiedWebhookConfig): void {
  emit('update:destination', { ...props.destination, config });
}

const showExternalDestinationConfig = computed(
  () => destinationType.value !== undefined && !isInternalDestinationSelected.value,
);
const showInternalDestinationSection = computed(
  () => destinationType.value !== undefined && isInternalDestinationSelected.value,
);
const showTeamOrUserConfig = computed(
  () => destinationType.value === 'Teams' || destinationType.value === 'Users',
);
const showSelectionWarning = computed(
  () =>
    Boolean(destinationType.value && subscriptionType.value) &&
    !isSelectionWarningDismissed.value,
);
const selectionWarningTitle = computed(() => {
  const isOwnerNonEmailSelection =
    destinationType.value === 'Owners' && subscriptionType.value !== 'Email';
  return isOwnerNonEmailSelection
    ? t('message.destination-owner-selection-warning', {
        subscriptionCategory: destinationType.value,
        subscriptionType: subscriptionType.value,
      })
    : t('message.destination-selection-warning', {
        subscriptionCategory: destinationType.value,
        subscriptionType: subscriptionType.value,
      });
});

// The owner branch carries a Trans <0> element around "Team"; split it so
// the markers never render literally. The other branch has no markers and
// falls back to plain text (same pattern as UsersListView's cross-link).
const selectionWarningParts = computed(() => splitTransElement(selectionWarningTitle.value));

const subscriptionTypeOptions = computed(() =>
  getSubscriptionTypeOptions(destinationType.value ?? ''),
);
const hasDestinationContent = computed(() => Object.keys(props.destination).length > 0);

const destinationTypeError = computed(
  () => props.validationErrors[`destinations.${props.id}.destinationType`],
);
const typeError = computed(() => props.validationErrors[`destinations.${props.id}.type`]);
const downstreamDepthError = computed(
  () => props.validationErrors[`destinations.${props.id}.downstreamDepth`],
);

function filterCategoryOption(input: string, option?: { label?: unknown }): boolean {
  return String(option?.label ?? '')
    .toLocaleLowerCase()
    .includes(input.toLocaleLowerCase());
}
</script>

<template>
  <div :data-testid="`destination-${id}`" class="destination-select-item">
    <div class="destination-select-item__main">
      <div>
        <Select
          :value="destinationType ?? undefined"
          show-search
          :filter-option="filterCategoryOption"
          :disabled="isViewMode"
          :data-testid="`destination-category-select-${id}`"
          :placeholder="t('label.select-field', { field: t('label.destination') })"
          style="width: 100%"
          :options="groupedOptions.map((option) => ({ value: option.id, label: option.label, disabled: option.isDisabled }))"
          @change="(value) => handleDestinationTypeSelect(value as string | undefined)"
        >
          <template #option="{ value: optionValue, label }">
            <span :class="{ 'destination-select-item__header': String(optionValue).startsWith('header-') }">
              <component
                :is="CATEGORY_ICONS[String(optionValue)]"
                v-if="CATEGORY_ICONS[String(optionValue)]"
              />
              {{ label }}
            </span>
          </template>
        </Select>
        <p v-if="destinationTypeError" class="destination-select-item__error">{{ destinationTypeError }}</p>
      </div>

      <DestinationConfigField
        v-if="showExternalDestinationConfig"
        :key="destinationType"
        :type="destinationType as string"
        :field-name="id"
        :config="destination.config"
        :is-config-expanded="isConfigExpanded"
        :is-view-mode="isViewMode"
        :validation-errors="validationErrors"
        :hooks="hooks"
        @update:config="handleConfigUpdate"
        @config-expanded-change="(expanded) => emit('config-expanded-change', expanded)"
      />

      <template v-if="showInternalDestinationSection">
        <DestinationConfigField
          v-if="showTeamOrUserConfig"
          :key="destinationType"
          :type="destinationType as string"
          :field-name="id"
          :config="destination.config"
          :is-config-expanded="isConfigExpanded"
          :is-view-mode="isViewMode"
          :validation-errors="validationErrors"
          :hooks="hooks"
          @update:config="handleConfigUpdate"
          @config-expanded-change="(expanded) => emit('config-expanded-change', expanded)"
        />

        <div>
          <Select
            :value="subscriptionType ?? undefined"
            :disabled="isViewMode"
            :data-testid="`destination-type-select-${id}`"
            :placeholder="t('label.select-field', { field: t('label.destination') })"
            style="width: 100%"
            :options="subscriptionTypeOptions.map((option) => ({ value: option.value, label: startCase(option.value), disabled: option.disabled }))"
            @change="(value) => handleTypeSelect(value as string | undefined)"
          />
          <p v-if="typeError" class="destination-select-item__error">{{ typeError }}</p>
        </div>

        <Alert
          v-if="showSelectionWarning"
          type="warning"
          closable
          show-icon
          @close="isSelectionWarningDismissed = true"
        >
          <template #message>
            <template v-if="selectionWarningParts"
              >{{ selectionWarningParts.before }}<strong>{{ selectionWarningParts.inner }}</strong
              >{{ selectionWarningParts.after }}</template
            >
            <template v-else>{{ selectionWarningTitle }}</template>
          </template>
        </Alert>
      </template>

      <div v-if="hasDestinationContent" class="destination-select-item__toggle">
        <span>{{ t('label.notify-downstream') }}</span>
        <Switch
          :checked="notifyDownstream"
          :disabled="isViewMode"
          @change="(checked) => handleNotifyDownstreamChange(checked as boolean)"
        />
      </div>

      <div v-if="notifyDownstream" :data-testid="`destination-downstream-depth-${id}`">
        <label class="destination-select-item__label">{{ t('label.downstream-depth') }}</label>
        <Input
          :value="destination.downstreamDepth !== undefined && destination.downstreamDepth !== null ? String(destination.downstreamDepth) : ''"
          type="number"
          :disabled="isViewMode"
          :data-testid="`destination-downstream-depth-input-${id}`"
          :status="downstreamDepthError ? 'error' : undefined"
          @change="(event) => { const raw = (event.target as HTMLInputElement).value; emit('update:destination', { ...destination, downstreamDepth: raw === '' ? undefined : Number(raw) }); }"
        />
        <p v-if="downstreamDepthError" class="destination-select-item__error">{{ downstreamDepthError }}</p>
      </div>

      <div
        v-if="isDestinationStatusLoading && destination.category === 'External'"
        class="destination-select-item__status-loading"
      />
      <Alert
        v-if="!isDestinationStatusLoading && destinationStatusDetails !== undefined && !isStatusHidden"
        :type="statusAlertType"
        :message="`${t('label.status')}: ${destinationStatusDetails?.statusCode} ${statusLabel} ${destinationStatusDetails?.reason ?? ''}`"
        closable
        show-icon
        @close="isStatusHidden = true"
      />
    </div>

    <Button
      v-if="!isViewMode"
      type="text"
      :data-testid="`remove-destination-${id}`"
      @click="emit('remove')"
    >
      <CloseOutlined />
    </Button>
  </div>
</template>

<style scoped>
.destination-select-item {
  display: flex;
  gap: 16px;
}

.destination-select-item__main {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 16px;
}

.destination-select-item__header {
  cursor: default;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--sm-text-secondary);
  opacity: 0.5;
}

.destination-select-item__error {
  margin-top: 4px;
  font-size: 14px;
  color: var(--sm-color-error);
}

.destination-select-item__toggle {
  display: flex;
  align-items: center;
  gap: 8px;
}

.destination-select-item__label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
}

.destination-select-item__status-loading {
  height: 32px;
  border-radius: 8px;
  background: var(--sm-bg-secondary);
  animation: destination-select-pulse 1.5s ease-in-out infinite;
}

@keyframes destination-select-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
