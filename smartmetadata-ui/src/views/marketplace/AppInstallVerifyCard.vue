<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { CheckCircleFilled, ClockCircleOutlined, UserOutlined } from '@ant-design/icons-vue';
import { Avatar, Button, Card, Collapse, Divider } from 'ant-design-vue';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import UserPopOverCard from '@/components/shared/UserPopOverCard.vue';
import { useAuthStore } from '@/stores/auth';
import { getRelativeTime } from '@/utils/relativeTime';
import type { MarketplaceApp } from '@/api/marketplaceApps';
import monogramUrl from '@/assets/iqvia-monogram.svg';
import AppLogo from './AppLogo.vue';
import { getEntityName } from './appUtils';

defineProps<{
  appData: MarketplaceApp;
  nextButtonLabel: string;
  onSave: () => void;
  onCancel: () => void;
}>();

const { t } = useI18n();
const authStore = useAuthStore();

/**
 * Official AppInstallVerifyCard (components/Settings/Applications/
 * AppInstallVerifyCard/AppInstallVerifyCard.component.tsx, pin
 * a3012259ca): the authorize handshake (app logo, dashed divider
 * with a check, brand monogram avatar), the current-user row with
 * a 32px popover avatar and no username, the developer link inside
 * the `label.application-by-developer` interpolation, an accordion
 * with one empty panel, full-width Cancel/Save, and the
 * developed-by/updated footer card. The brand monogram is the
 * product's own monogram asset, the equivalent of pin's BrandImage. The
 * `label.application-by-developer` interpolation uses vue-i18n
 * named slots (`{app}` / `{dev}`); the locale value must be written
 * in vue-i18n syntax (`{app} by {dev}`), not pin's i18next literal
 * (`{{app}} by <0>{{dev}}</0>`).
 */
const currentUser = computed(() => authStore.user);
</script>

<template>
  <div style="display: flex; flex-direction: column; align-items: center">
    <div style="display: flex; align-items: center; gap: 8px; padding-top: 24px">
      <AppLogo :app-name="appData?.fullyQualifiedName ?? ''" />
      <Divider dashed style="width: 176px; margin: 0">
        <CheckCircleFilled style="color: #52c41a; font-size: 14px; flex-shrink: 0" />
      </Divider>
      <Avatar :size="100" style="background: #fff; border: 1px solid #d9d9d9; display: flex; align-items: center; justify-content: center">
        <img alt="" data-testid="image" height="56" :src="monogramUrl" style="vertical-align: middle" width="56" />
      </Avatar>
    </div>
    <h5 style="margin-top: 16px; font-weight: 600">
      {{ t('label.authorize-app', { app: getEntityName(appData) }) }}
    </h5>
    <Card style="width: 500px; margin-top: 16px">
      <div style="display: flex; align-items: center; gap: 12px">
        <UserPopOverCard :profile-width="32" :user-name="currentUser?.name ?? ''" />
        <div style="display: flex; flex-direction: column">
          <span style="font-weight: 500">
            <i18n-t keypath="label.application-by-developer">
              <template #app>{{ getEntityName(appData) }}</template>
              <template #dev>
                <a
                  :aria-label="t('label.application')"
                  :href="appData?.developerUrl"
                  rel="noreferrer"
                  :style="{ color: 'var(--sm-primary, #005587)' }"
                  target="_blank"
                >
                  {{ appData?.developer }}
                </a>
              </template>
            </i18n-t>
          </span>
          <span style="font-size: 12px; color: #8c8c8c">
            {{
              t('label.wants-to-access-your-account', {
                username: currentUser?.displayName ?? currentUser?.name,
              })
            }}
          </span>
        </div>
      </div>

      <Collapse style="width: 100%; margin-top: 16px">
        <Collapse.Panel key="1">
          <template #header>{{ ` ${t('label.all-entity', { entity: t('label.metadata') })}` }}</template>
          <template #default />
        </Collapse.Panel>
      </Collapse>

      <Divider style="margin: 24px 0" />
      <div style="display: flex; justify-content: flex-end; gap: 8px">
        <Button block data-testid="cancel" @click="onCancel">{{ t('label.cancel') }}</Button>
        <Button block data-testid="save-button" type="primary" @click="onSave">{{ nextButtonLabel }}</Button>
      </div>
    </Card>
    <Card style="width: 500px; margin-top: 16px">
      <div style="display: flex; align-items: center; justify-content: space-between">
        <span style="display: inline-flex; align-items: center; gap: 8px">
          <UserOutlined style="font-size: 14px; flex-shrink: 0" />
          <span style="font-size: 12px; color: #8c8c8c">
            {{ t('label.developed-by-developer', { developer: appData?.developer }) }}
          </span>
        </span>
        <span style="display: inline-flex; align-items: center; gap: 8px">
          <ClockCircleOutlined style="font-size: 14px; flex-shrink: 0" />
          <span style="font-size: 12px; color: #8c8c8c">
            {{ `${t('label.updated')} ${getRelativeTime(appData?.updatedAt)}` }}
          </span>
        </span>
      </div>
    </Card>
  </div>
</template>
