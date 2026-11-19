<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { Button, Collapse, CollapsePanel, Input, Radio, RadioGroup, Select, Tag } from 'ant-design-vue';
import { DeleteOutlined, PlusOutlined, SettingOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';
import { getTermQuery } from '@/api/serviceSearch';
import type { KeyValuePair, ModifiedWebhookConfig } from '@/types/notifications';
import type { SubscriptionType, WebhookAuthType } from '@/types/quality';
import type { AlertFormValidationErrors } from '@/utils/notifications/alertValidation';
import { getAuthTypeItems } from '@/utils/notifications/alertArgumentSearch';
import {
  ALERT_AI_OAUTH_TOKEN_URL_PLACEHOLDER,
  DESTINATION_TYPE_BASED_PLACEHOLDERS,
} from '@/utils/notifications/alertConstants';
import { isValidEmailAddress } from '@/utils/notifications/alertDestinations';
import { isWebhookDestination } from '@/utils/notifications/alertFormUtils';
import {
  searchEntity,
  type AlertSearchHooks,
  type NameOption,
} from '@/utils/notifications/alertSourceSearch';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import TeamAndUserSelectItem from './TeamAndUserSelectItem.vue';

/**
 * Destination configuration fields, ported from pin
 * components/Alerts/DestinationFormItem/DestinationSelectItem/DestinationConfigField/DestinationConfigField.tsx.
 * Webhook types get an endpoint plus an Advanced accordion (auth,
 * headers, query params, HTTP method); Email gets a tag input;
 * Teams/Users get the team/user picker; anything else renders
 * nothing. Validation errors arrive by dot-joined path from the
 * form's single validator.
 */
const props = withDefaults(
  defineProps<{
    type: string;
    fieldName: number;
    config?: ModifiedWebhookConfig;
    isConfigExpanded?: boolean;
    isViewMode?: boolean;
    validationErrors: AlertFormValidationErrors;
    hooks: AlertSearchHooks;
  }>(),
  { config: undefined, isConfigExpanded: false, isViewMode: false },
);
const emit = defineEmits<{
  'update:config': [config: ModifiedWebhookConfig];
  'config-expanded-change': [isExpanded: boolean];
}>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;

const errorAt = (path: string): string | undefined =>
  props.validationErrors[`destinations.${props.fieldName}.config.${path}`];

function patchConfig(patch: Partial<ModifiedWebhookConfig>): void {
  emit('update:config', { ...props.config, ...patch });
}

const isWebhookType = computed(() => isWebhookDestination(props.type));
const endpointPlaceholder = computed(
  () => DESTINATION_TYPE_BASED_PLACEHOLDERS[props.type as SubscriptionType] ?? '',
);
const emailPlaceholder = computed(() => DESTINATION_TYPE_BASED_PLACEHOLDERS.Email ?? '');
const advancedConfigId = computed(() => `advanced-config-${props.fieldName}`);
const selectedAuthType = computed(() => props.config?.authType?.type);
const authTypeItems = computed(() => getAuthTypeItems(translate));

function onAuthTypeChange(value: string | undefined): void {
  patchConfig({
    authType: { ...props.config?.authType, type: value as WebhookAuthType | undefined },
  });
}

function patchAuthType(patch: Partial<NonNullable<ModifiedWebhookConfig['authType']>>): void {
  patchConfig({ authType: { ...props.config?.authType, ...patch } });
}

const expandedKeys = computed(() =>
  props.isConfigExpanded ? [advancedConfigId.value] : [],
);
function onCollapseChange(keys: string | string[]): void {
  const list = Array.isArray(keys) ? keys : [keys];
  emit('config-expanded-change', list.includes(advancedConfigId.value));
}

// --- Email tag input (EmailTagInput, DestinationConfigField.tsx:86-188) ---
const emailInputValue = ref('');
const emailError = ref<string | undefined>(undefined);
const receivers = computed(() => props.config?.receivers ?? []);

function addEmail(): void {
  const trimmed = emailInputValue.value.trim();
  if (!trimmed || receivers.value.includes(trimmed)) {
    emailInputValue.value = '';
    emailError.value = undefined;
    return;
  }
  if (!isValidEmailAddress(trimmed)) {
    emailError.value = t('message.email-is-invalid');
    return;
  }
  patchConfig({ receivers: [...receivers.value, trimmed] });
  emailInputValue.value = '';
  emailError.value = undefined;
}

function removeEmail(email: string): void {
  patchConfig({ receivers: receivers.value.filter((receiver) => receiver !== email) });
}

// --- Key/value lists (KeyValueList, DestinationConfigField.tsx:196-296) ---
function keyValueEntries(name: 'headers' | 'queryParams'): KeyValuePair[] {
  return props.config?.[name] ?? [];
}

function updateKeyValueEntries(name: 'headers' | 'queryParams', entries: KeyValuePair[]): void {
  patchConfig({ [name]: entries } as Partial<ModifiedWebhookConfig>);
}

// --- Team/user search (DestinationConfigField.tsx:66-74) ---
const getUserOptions = (searchText: string): Promise<NameOption[]> =>
  searchEntity(
    {
      searchText,
      searchIndex: 'user',
      queryFilter: getTermQuery({ isBot: 'false' }),
    },
    props.hooks,
  );
const getTeamOptions = (searchText: string): Promise<NameOption[]> =>
  searchEntity({ searchText, searchIndex: 'team' }, props.hooks);

const isTeamType = computed(() => props.type === 'Teams');
</script>

<template>
  <div v-if="isWebhookType" class="destination-config-field">
    <div :data-testid="`endpoint-input-${fieldName}`">
      <Input
        :value="config?.endpoint ?? ''"
        :disabled="isViewMode"
        :data-testid="`endpoint-input-field-${fieldName}`"
        :placeholder="endpointPlaceholder"
        :status="errorAt('endpoint') ? 'error' : undefined"
        @change="(event) => patchConfig({ endpoint: (event.target as HTMLInputElement).value })"
      />
      <p v-if="errorAt('endpoint')" class="destination-config-field__error">{{ errorAt('endpoint') }}</p>
    </div>

    <Collapse
      :active-key="expandedKeys"
      :data-testid="advancedConfigId"
      @change="(keys) => onCollapseChange(keys as string | string[])"
    >
      <CollapsePanel :key="advancedConfigId">
        <template #header>
          <span class="destination-config-field__advanced-header">
            <SettingOutlined /> {{ t('label.advanced-configuration') }}
          </span>
        </template>

        <div class="destination-config-field__advanced">
          <div>
            <label class="destination-config-field__label">{{ t('label.authentication-type') }}:</label>
            <Select
              :value="selectedAuthType ?? undefined"
              :disabled="isViewMode"
              :data-testid="`auth-type-select-${fieldName}`"
              :placeholder="t('label.authentication-type')"
              style="width: 100%"
              :options="authTypeItems.map((item) => ({ value: item.id, label: item.label }))"
              @change="(value) => onAuthTypeChange(value as string | undefined)"
            />
          </div>

          <div v-if="selectedAuthType === 'bearer'" data-testid="secret-key">
            <label class="destination-config-field__label">{{ t('label.secret-key') }}:</label>
            <Input.Password
              :value="config?.authType?.secretKey ?? ''"
              :disabled="isViewMode"
              :data-testid="`secret-key-input-${fieldName}`"
              :placeholder="t('label.secret-key')"
              :status="errorAt('authType.secretKey') ? 'error' : undefined"
              @change="(event) => patchAuthType({ secretKey: (event.target as HTMLInputElement).value })"
            />
            <p v-if="errorAt('authType.secretKey')" class="destination-config-field__error">
              {{ errorAt('authType.secretKey') }}
            </p>
          </div>

          <template v-if="selectedAuthType === 'oauth2'">
            <div :data-testid="`token-url-input-${fieldName}`">
              <label class="destination-config-field__label">{{ t('label.token-url') }}:</label>
              <Input
                :value="config?.authType?.tokenUrl ?? ''"
                :disabled="isViewMode"
                :data-testid="`token-url-input-field-${fieldName}`"
                :placeholder="ALERT_AI_OAUTH_TOKEN_URL_PLACEHOLDER"
                :status="errorAt('authType.tokenUrl') ? 'error' : undefined"
                @change="(event) => patchAuthType({ tokenUrl: (event.target as HTMLInputElement).value })"
              />
              <p v-if="errorAt('authType.tokenUrl')" class="destination-config-field__error">
                {{ errorAt('authType.tokenUrl') }}
              </p>
            </div>
            <div>
              <label class="destination-config-field__label">{{ t('label.client-id') }}:</label>
              <Input.Password
                :value="config?.authType?.clientId ?? ''"
                :disabled="isViewMode"
                :data-testid="`client-id-input-${fieldName}`"
                :placeholder="t('label.client-id')"
                :status="errorAt('authType.clientId') ? 'error' : undefined"
                @change="(event) => patchAuthType({ clientId: (event.target as HTMLInputElement).value })"
              />
              <p v-if="errorAt('authType.clientId')" class="destination-config-field__error">
                {{ errorAt('authType.clientId') }}
              </p>
            </div>
            <div>
              <label class="destination-config-field__label">{{ t('label.client-secret') }}:</label>
              <Input.Password
                :value="config?.authType?.clientSecret ?? ''"
                :disabled="isViewMode"
                :data-testid="`client-secret-input-${fieldName}`"
                :placeholder="t('label.client-secret')"
                :status="errorAt('authType.clientSecret') ? 'error' : undefined"
                @change="(event) => patchAuthType({ clientSecret: (event.target as HTMLInputElement).value })"
              />
              <p v-if="errorAt('authType.clientSecret')" class="destination-config-field__error">
                {{ errorAt('authType.clientSecret') }}
              </p>
            </div>
            <div :data-testid="`scope-input-${fieldName}`">
              <label class="destination-config-field__label">{{ t('label.scope') }}:</label>
              <Input
                :value="config?.authType?.scope ?? ''"
                :disabled="isViewMode"
                :data-testid="`scope-input-field-${fieldName}`"
                :placeholder="`${t('label.scope')} (${t('label.optional')})`"
                @change="(event) => patchAuthType({ scope: (event.target as HTMLInputElement).value })"
              />
            </div>
          </template>

          <template v-for="listName in (['headers', 'queryParams'] as const)" :key="listName">
            <div class="destination-config-field__kv">
              <div class="destination-config-field__kv-header">
                <span class="destination-config-field__kv-title">
                  {{ listName === 'headers' ? t('label.header-plural') : t('label.query-parameter-plural') }}
                </span>
                <Button
                  v-if="!isViewMode"
                  size="small"
                  :aria-label="t('label.add')"
                  :data-testid="`add-${listName === 'headers' ? 'header' : 'query-param'}-button-${fieldName}`"
                  @click="updateKeyValueEntries(listName, [...keyValueEntries(listName), { key: '', value: '' }])"
                >
                  <PlusOutlined />
                </Button>
              </div>
              <div
                v-for="(entry, entryIndex) in keyValueEntries(listName)"
                :key="entryIndex"
                class="destination-config-field__kv-row"
              >
                <div class="destination-config-field__kv-inputs">
                  <div :data-testid="`${listName === 'headers' ? 'header' : 'query-param'}-key-input-${fieldName}-${entryIndex}`">
                    <Input
                      :value="entry.key"
                      :disabled="isViewMode"
                      :data-testid="`${listName === 'headers' ? 'header' : 'query-param'}-key-input-field-${fieldName}-${entryIndex}`"
                      :placeholder="t('label.key')"
                      :status="errorAt(`${listName}.${entryIndex}.key`) ? 'error' : undefined"
                      @change="(event) => updateKeyValueEntries(listName, keyValueEntries(listName).map((item, i) => i === entryIndex ? { ...item, key: (event.target as HTMLInputElement).value } : item))"
                    />
                    <p v-if="errorAt(`${listName}.${entryIndex}.key`)" class="destination-config-field__error">
                      {{ errorAt(`${listName}.${entryIndex}.key`) }}
                    </p>
                  </div>
                  <div :data-testid="`${listName === 'headers' ? 'header' : 'query-param'}-value-input-${fieldName}-${entryIndex}`">
                    <Input
                      :value="entry.value"
                      :disabled="isViewMode"
                      :data-testid="`${listName === 'headers' ? 'header' : 'query-param'}-value-input-field-${fieldName}-${entryIndex}`"
                      :placeholder="t('label.value')"
                      :status="errorAt(`${listName}.${entryIndex}.value`) ? 'error' : undefined"
                      @change="(event) => updateKeyValueEntries(listName, keyValueEntries(listName).map((item, i) => i === entryIndex ? { ...item, value: (event.target as HTMLInputElement).value } : item))"
                    />
                    <p v-if="errorAt(`${listName}.${entryIndex}.value`)" class="destination-config-field__error">
                      {{ errorAt(`${listName}.${entryIndex}.value`) }}
                    </p>
                  </div>
                </div>
                <Button
                  v-if="!isViewMode"
                  size="small"
                  :aria-label="t('label.remove')"
                  :data-testid="`remove-${listName === 'headers' ? 'header' : 'query-param'}-button-${fieldName}-${entryIndex}`"
                  @click="updateKeyValueEntries(listName, keyValueEntries(listName).filter((_, i) => i !== entryIndex))"
                >
                  <DeleteOutlined />
                </Button>
              </div>
            </div>
          </template>

          <div>
            <label class="destination-config-field__label">{{ t('label.http-method') }}:</label>
            <RadioGroup
              :value="config?.httpMethod ?? 'POST'"
              :disabled="isViewMode"
              :data-testid="`http-method-${fieldName}`"
              @change="(event) => patchConfig({ httpMethod: (event.target as HTMLInputElement).value as ModifiedWebhookConfig['httpMethod'] })"
            >
              <Radio value="POST">POST</Radio>
              <Radio value="PUT">PUT</Radio>
            </RadioGroup>
          </div>
        </div>
      </CollapsePanel>
    </Collapse>
  </div>

  <div v-else-if="type === 'Email'" class="destination-config-field">
    <div :data-testid="`email-input-${fieldName}`">
      <Input
        :value="emailInputValue"
        :disabled="isViewMode"
        :data-testid="`email-input-field-${fieldName}`"
        :placeholder="emailPlaceholder"
        @change="(event) => { emailInputValue = (event.target as HTMLInputElement).value; emailError = undefined; }"
        @keydown.enter.prevent="addEmail"
      />
      <p v-if="emailError" class="destination-config-field__error">{{ emailError }}</p>
    </div>
    <div v-if="receivers.length > 0" :data-testid="`email-tags-${fieldName}`" class="destination-config-field__tags">
      <Tag
        v-for="email in receivers"
        :key="email"
        :data-testid="`email-tag-${email}`"
        :closable="!isViewMode"
        @close="removeEmail(email)"
      >
        {{ email }}
      </Tag>
    </div>
    <p v-if="errorAt('receivers')" class="destination-config-field__error">{{ errorAt('receivers') }}</p>
  </div>

  <div v-else-if="type === 'Teams' || type === 'Users'" class="destination-config-field">
    <TeamAndUserSelectItem
      :entity-type="isTeamType ? t('label.team-lowercase') : t('label.user-lowercase')"
      :destination-number="fieldName"
      :value="receivers"
      :disabled="isViewMode"
      :on-search="isTeamType ? getTeamOptions : getUserOptions"
      @update:value="(next) => patchConfig({ receivers: next })"
    />
    <p v-if="errorAt('receivers')" class="destination-config-field__error">{{ errorAt('receivers') }}</p>
  </div>
</template>

<style scoped>
.destination-config-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.destination-config-field__error {
  margin-top: 4px;
  font-size: 14px;
  color: var(--sm-color-error);
}

.destination-config-field__advanced {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.destination-config-field__advanced-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.destination-config-field__label {
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
}

.destination-config-field__kv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.destination-config-field__kv-title {
  font-size: 14px;
  font-weight: 500;
}

.destination-config-field__kv-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 8px;
}

.destination-config-field__kv-inputs {
  display: grid;
  flex: 1;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.destination-config-field__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
