<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Button, Card, Input, Select, Spin, Typography, message } from 'ant-design-vue';
import { CopyOutlined, WarningOutlined } from '@ant-design/icons-vue';
import FormModal from '@/components/shared/FormModal.vue';
import {
  USER_DEFAULT_AUTHENTICATION_MECHANISM,
  getJwtTokenExpiryOptions,
  getUserAccessToken,
  revokeUserAccessToken,
  updateUserAccessToken,
  type UserAuthMechanism,
} from '@/api/users';
import type { AdminUser, JwtTokenExpiry } from '@/types/admin';
import { USER_TOKEN_NAME, formatAbsoluteDateTime, getTokenExpiryLabel, getTokenExpiryState } from './userLogic';

/**
 * Single-JWT card (pin AccessTokenCard + AuthMechanism +
 * AuthMechanismForm, user path only — no bot/SCIM branches, both
 * production mounts pass neither flag). One mechanism: fetch takes
 * [0] of the array, defaulting to the bare PersonalAccessToken
 * mechanism; update sends the literal token name 'test'; revoke
 * sends removeAll with no body, then takes response[0] ?? default
 * and enters edit mode. hasPermission is unconditionally true on
 * this surface (pin passes the literal), so Generate/Revoke are
 * ungated; the tab itself is own-only.
 *
 * Expiry text keeps the pin's hardcoded templates (locale-dependent
 * literals, not i18n keys, per §10).
 */

// The token endpoints are current-user-scoped; the user prop documents
// the surface the card belongs to (pin AccessTokenCard takes userData).
defineProps<{ user: AdminUser }>();

const { t, locale } = useI18n();

const mechanism = ref<UserAuthMechanism>({ ...USER_DEFAULT_AUTHENTICATION_MECHANISM });
const isDataLoaded = ref(false);
const isEditMode = ref(false);
const isUpdating = ref(false);
const isModalOpen = ref(false);
const isTokenRemoving = ref(false);
const selectedExpiry = ref<JwtTokenExpiry>('OneHour');

const expiryState = computed(() => getTokenExpiryState(mechanism.value));
const expiryOptions = computed(() => getJwtTokenExpiryOptions(true));

function expiryLabel(value: string): string {
  return getTokenExpiryLabel(value, (key, params) => t(key, params ?? {}));
}

const expiryText = computed(() => {
  const expiryDate = mechanism.value.expiryDate;
  if (expiryState.value === 'no-expiry') {
    return undefined;
  }
  if (expiryDate === undefined) {
    return undefined;
  }
  const date = formatAbsoluteDateTime(expiryDate);
  if (locale.value.startsWith('zh')) {
    return expiryState.value === 'expired' ? `已于 ${date} 过期。` : `将于 ${date} 过期。`;
  }
  return expiryState.value === 'expired' ? `Expired on ${date}.` : `Expires on ${date}.`;
});

async function fetchMechanism(): Promise<void> {
  try {
    const response = await getUserAccessToken();
    mechanism.value = response[0] ?? { ...USER_DEFAULT_AUTHENTICATION_MECHANISM };
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.loadFailed'));
  } finally {
    isDataLoaded.value = true;
  }
}

onMounted(() => {
  void fetchMechanism();
});

async function handleUpdate(): Promise<void> {
  isUpdating.value = true;
  try {
    const updated = await updateUserAccessToken(selectedExpiry.value, USER_TOKEN_NAME);
    if (updated) {
      mechanism.value = updated;
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.updateFailed'));
  } finally {
    isUpdating.value = false;
    isEditMode.value = false;
  }
}

async function handleRevoke(): Promise<void> {
  isTokenRemoving.value = true;
  try {
    const response = await revokeUserAccessToken();
    mechanism.value = response[0] ?? { ...USER_DEFAULT_AUTHENTICATION_MECHANISM };
    isModalOpen.value = false;
    isEditMode.value = true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : t('crud.deleteFailed'));
  } finally {
    isTokenRemoving.value = false;
  }
}

function copyToken(): void {
  if (mechanism.value.jwtToken) {
    navigator.clipboard.writeText(mechanism.value.jwtToken).catch(() => undefined);
  }
}

function onCancelEdit(): void {
  isEditMode.value = false;
}
</script>

<template>
  <Card data-testid="center-panel">
    <Spin v-if="!isDataLoaded" :spinning="true" data-testid="access-token-loader" />
    <template v-else-if="isEditMode">
      <Typography.Title :level="5">{{ t('message.personal-access-token') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('message.jwt-token') }}</Typography.Paragraph>
      <div class="token-form">
        <label>{{ t('label.auth-mechanism') }}</label>
        <Select disabled :value="'PersonalAccessToken'" style="width: 100%">
          <Select.Option value="PersonalAccessToken">Personal Access Token</Select.Option>
        </Select>
        <label>{{ t('label.token-expiration') }}</label>
        <Select v-model:value="selectedExpiry" style="width: 100%" data-testid="token-expiry-select">
          <Select.Option
            v-for="option in expiryOptions"
            :key="option"
            :value="option"
          >
            {{ expiryLabel(option) }}
          </Select.Option>
        </Select>
        <div class="token-form__actions">
          <Button @click="onCancelEdit">{{ t('label.cancel') }}</Button>
          <Button type="primary" :loading="isUpdating" @click="handleUpdate">
            {{ t('label.save') }}
          </Button>
        </div>
      </div>
    </template>
    <template v-else>
      <Typography.Title :level="5">{{ t('message.personal-access-token') }}</Typography.Title>
      <Typography.Paragraph type="secondary">{{ t('message.jwt-token') }}</Typography.Paragraph>
      <div v-if="mechanism.jwtToken" class="token-read">
        <Input :value="mechanism.jwtToken" readonly data-testid="token-input">
          <template #suffix>
            <Button
              type="text"
              size="small"
              :aria-label="t('label.copy')"
              data-testid="copy-token-button"
              @click="copyToken"
            >
              <CopyOutlined />
            </Button>
          </template>
        </Input>
        <p v-if="expiryState === 'no-expiry'" class="token-read__no-expiry">
          <WarningOutlined /> {{ t('message.token-has-no-expiry') }}
        </p>
        <p v-else-if="expiryText" class="token-read__expiry">{{ expiryText }}</p>
        <Button danger data-testid="revoke-token-button" @click="isModalOpen = true">
          {{ t('label.revoke') }}
        </Button>
      </div>
      <Button v-else type="primary" data-testid="generate-token-button" @click="isEditMode = true">
        {{ t('label.generate') }}
      </Button>
    </template>
    <FormModal
      :open="isModalOpen"
      :title="t('label.revoke')"
      :ok-text="t('label.confirm')"
      :cancel-text="t('label.cancel')"
      :confirm-loading="isTokenRemoving"
      test-id="revoke-token-modal"
      @ok="handleRevoke"
      @cancel="isModalOpen = false"
    >
      <p>{{ t('message.are-you-sure-to-revoke-access-personal-access') }}</p>
    </FormModal>
  </Card>
</template>

<style scoped>
.token-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 480px;
}
.token-form__actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 8px;
}
.token-read {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 640px;
  align-items: flex-start;
}
.token-read__no-expiry {
  color: var(--sm-color-warning);
  margin: 0;
}
.token-read__expiry {
  margin: 0;
}
</style>
