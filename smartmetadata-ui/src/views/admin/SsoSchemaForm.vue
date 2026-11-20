<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Alert, Button, Card, Spin } from 'ant-design-vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  createSsoDomClickHandler,
  createSsoDomFocusHandler,
  createSsoFormKeyDownHandler,
} from '@/admin/ssoDocSections';
import {
  getSsoProviderDisplayName,
  getSsoProviderIcon,
} from '@/admin/ssoProviders';
import type { SsoSecuritySources } from '@/admin/ssoSecuritySources';
import type { SsoFormData } from '@/admin/ssoSchemas';
import { getSsoUiEntry } from '@/admin/ssoUiSchema';
import { useSsoConfiguration } from '@/composables/useSsoConfiguration';
import ResizablePanels from '@/components/shared/ResizablePanels.vue';
import SsoDocPanel from './SsoDocPanel.vue';
import SsoProviderIcon from './SsoProviderIcon.vue';
import SsoProviderSelector from './SsoProviderSelector.vue';
import SsoSamlMetadataUpload from './SsoSamlMetadataUpload.vue';
import SsoSchemaNode from './SsoSchemaNode.vue';
import SsoTestLoginModal from './SsoTestLoginModal.vue';
import SsoUnsavedChangesModal from './SsoUnsavedChangesModal.vue';

const props = withDefaults(
  defineProps<{
    hideBorder?: boolean;
    forceEditMode?: boolean;
    isReadOnly?: boolean;
    managedPaths?: SsoSecuritySources['managedPaths'];
    securityConfig?: SsoFormData | null;
    selectedProvider?: string;
    onChangeProvider?: () => void;
    onProviderSelect?: (provider: string) => void;
  }>(),
  {
    hideBorder: false,
    forceEditMode: false,
    isReadOnly: false,
    managedPaths: undefined,
    securityConfig: undefined,
    selectedProvider: undefined,
    onChangeProvider: undefined,
    onProviderSelect: undefined,
  },
);

const { t, locale } = useI18n();
const brandName = computed(() => t('product.name'));

const config = useSsoConfiguration({
  forceEditMode: () => props.forceEditMode,
  onChangeProvider: props.onChangeProvider,
  onProviderSelect: props.onProviderSelect,
  selectedProvider: () => props.selectedProvider,
  securityConfig: () => props.securityConfig,
  managedPaths: () => props.managedPaths,
  isReadOnly: () => props.isReadOnly,
});

const activeField = ref<string | undefined>(undefined);

// Document-level listeners while the form shows, mirroring pin's
// focusin (bubble), click (capture) and keydown (capture) wiring.
const focusHandler = createSsoDomFocusHandler((field) => {
  activeField.value = field;
});
const clickHandler = createSsoDomClickHandler((field) => {
  activeField.value = field;
});
const keyDownHandler = createSsoFormKeyDownHandler();

function attachDomListeners(): void {
  document.addEventListener('focusin', focusHandler);
  document.addEventListener('click', clickHandler, true);
  document.addEventListener('keydown', keyDownHandler, true);
}
function detachDomListeners(): void {
  document.removeEventListener('focusin', focusHandler);
  document.removeEventListener('click', clickHandler, true);
  document.removeEventListener('keydown', keyDownHandler, true);
}
watch(
  () => config.showForm.value,
  (showForm) => {
    if (showForm) {
      attachDomListeners();
    } else {
      detachDomListeners();
    }
  },
  { immediate: true },
);
onBeforeUnmount(detachDomListeners);

const showSamlUpload = computed(
  () =>
    config.isEditMode.value &&
    config.showForm.value &&
    config.currentProvider.value === 'saml' &&
    config.canUploadSamlMetadata.value,
);
const showInternalSelector = computed(
  () => config.showProviderSelector.value && !props.onChangeProvider,
);
const showFormActions = computed(
  () => config.isEditMode.value && !config.isFormReadOnly.value,
);
const showConfigAlerts = computed(
  () => !config.hasExistingConfig.value || config.isSaveGatedOnTestLogin.value,
);
const showChangeProvider = computed(
  () =>
    config.hasExistingConfig.value &&
    props.onChangeProvider !== undefined &&
    config.canChangeProvider.value,
);

const authSchema = computed(
  () => config.schema.value.properties!.authenticationConfiguration!,
);
const authorizerSchema = computed(
  () => config.schema.value.properties!.authorizerConfiguration!,
);
const authEntry = computed(() =>
  getSsoUiEntry(config.uiSchema.value, ['authenticationConfiguration']),
);
const authorizerEntry = computed(() =>
  getSsoUiEntry(config.uiSchema.value, ['authorizerConfiguration']),
);

function toPath(fieldId: string): string[] {
  return fieldId.replace(/^root\//, '').split('/');
}
function getFieldErrors(fieldId: string): string[] {
  return config.getDisplayErrors(toPath(fieldId));
}
function handleFieldChange(fieldId: string, value: unknown): void {
  config.handleFieldChange(toPath(fieldId), value);
}
function handleChangeFile(): void {
  config.metadataUploadStatus.value = null;
}
</script>

<template>
  <Spin v-if="config.isInitializing.value" data-testid="loader" />

  <Card
    v-else-if="showInternalSelector"
    data-testid="sso-configuration-form-card"
  >
    <SsoProviderSelector
      :selected-provider="config.currentProvider.value"
      @provider-select="config.handleProviderSelect"
    />
  </Card>

  <div v-else-if="hideBorder">
    <SsoUnsavedChangesModal
      :discard-text="t('sso.discard')"
      :loading="config.modalSaveLoading.value"
      :open="config.showCancelModal.value"
      :save-text="t('sso.saveChanges')"
      :title="t('sso.unsavedChanges')"
      @cancel="config.handleCancelModalClose"
      @discard="config.handleCancelConfirm"
      @save="config.handleSaveAndExit"
    />
    <ResizablePanels
      class-name="content-height-with-resizable-panel sso-configured"
      :first-panel="{
        className: 'content-resizable-panel-container sso-configured m-t-2',
        minWidth: 400,
        flex: 0.5,
      }"
      :second-panel="{
        className:
          'service-doc-panel content-resizable-panel-container m-t-xs',
        minWidth: 400,
        flex: 0.5,
      }"
    >
      <template #first>
        <div v-if="config.isEditMode.value && config.showForm.value">
          <div v-if="showSamlUpload" class="m-b-md">
            <SsoSamlMetadataUpload
              :file-name="config.metadataUploadFileName.value"
              :status="config.metadataUploadStatus.value"
              @change-file="handleChangeFile"
              @file-upload="config.handleMetadataFileUpload"
            />
          </div>
          <SsoSchemaNode
            :brand-name="brandName"
            :disabled="config.isFormReadOnly.value"
            :entry="authEntry"
            field-id="root/authenticationConfiguration"
            :get-field-errors="getFieldErrors"
            :locale="locale"
            :managed-paths="config.managedPaths.value"
            :model-value="config.internalData.value?.authenticationConfiguration"
            :path="['authenticationConfiguration']"
            :schema="authSchema"
            @change="handleFieldChange"
            @clear-error="config.handleClearFieldError"
          />
          <SsoSchemaNode
            :brand-name="brandName"
            :disabled="config.isFormReadOnly.value"
            :entry="authorizerEntry"
            field-id="root/authorizerConfiguration"
            :get-field-errors="getFieldErrors"
            :locale="locale"
            :managed-paths="config.managedPaths.value"
            :model-value="config.internalData.value?.authorizerConfiguration"
            :path="['authorizerConfiguration']"
            :schema="authorizerSchema"
            @change="handleFieldChange"
            @clear-error="config.handleClearFieldError"
          />
        </div>
        <div v-if="showFormActions">
          <div v-if="showConfigAlerts" class="sso-config-alerts">
            <Alert
              v-if="!config.hasExistingConfig.value"
              class="sso-save-warning"
              :message="t('sso.warning')"
              type="warning"
            >
              <template #description>
                {{ t('sso.newConfigSaveWarning') }}
              </template>
            </Alert>
            <Alert
              v-if="config.isSaveGatedOnTestLogin.value"
              class="sso-test-login-required"
              :message="t('sso.testLogin.title')"
              type="warning"
            >
              <template #description>
                {{ config.testLoginGateMessage.value }}
                <Button
                  data-testid="save-anyway-sso-configuration"
                  :disabled="config.isLoading.value"
                  size="small"
                  @click="config.handleSave"
                >
                  {{ t('sso.testLogin.saveAnyway') }}
                </Button>
              </template>
            </Alert>
          </div>
          <div class="form-actions-bottom">
            <Button
              data-testid="cancel-sso-configuration"
              @click="config.handleCancelClick"
            >
              {{ t('crud.cancel') }}
            </Button>
            <Button
              v-if="config.canTestLogin.value"
              data-testid="test-login-sso-configuration"
              :disabled="
                config.isLoading.value ||
                config.isTestingLogin.value ||
                !config.currentProvider.value
              "
              :loading="config.isTestingLogin.value"
              @click="config.handleTestLogin"
            >
              {{ t('sso.testLogin.title') }}
            </Button>
            <Button
              data-testid="save-sso-configuration"
              :disabled="
                config.isLoading.value || config.isSaveGatedOnTestLogin.value
              "
              :loading="config.isLoading.value"
              type="primary"
              @click="config.handleSave"
            >
              {{ t('crud.save') }}
            </Button>
          </div>
          <SsoTestLoginModal
            :configuration-check="config.testLoginConfigurationCheck.value"
            :error="config.testLoginError.value"
            :is-awaiting-credentials="config.isAwaitingTestLoginCredentials.value"
            :is-testing="config.isTestingLogin.value"
            :open="config.showTestLoginModal.value"
            :result="config.testLoginResult.value"
            :on-submit-credentials="config.submitTestLoginCredentials"
            @close="config.handleTestLoginModalClose"
          />
        </div>
      </template>
      <template #second>
        <SsoDocPanel
          :active-field="activeField"
          :service-name="config.currentProvider.value || 'general'"
        />
      </template>
    </ResizablePanels>
  </div>

  <div v-else>
    <SsoUnsavedChangesModal
      :discard-text="t('sso.discard')"
      :loading="config.modalSaveLoading.value"
      :open="config.showCancelModal.value"
      :save-text="t('sso.saveChanges')"
      :title="t('sso.unsavedChanges')"
      @cancel="config.handleCancelModalClose"
      @discard="config.handleCancelConfirm"
      @save="config.handleSaveAndExit"
    />
    <div class="sso-provider-header">
      <div class="sso-provider-icon-container">
        <SsoProviderIcon
          v-if="getSsoProviderIcon(config.currentProvider.value ?? '')"
          :alt="getSsoProviderDisplayName(config.currentProvider.value ?? '')"
          :icon="getSsoProviderIcon(config.currentProvider.value ?? '')"
          :size="22"
        />
      </div>
      <h1>
        {{ getSsoProviderDisplayName(config.currentProvider.value ?? '') }}
        {{ t('sso.setUp') }}
      </h1>
      <Button
        v-if="showChangeProvider"
        data-testid="change-provider-button"
        type="link"
        @click="props.onChangeProvider?.()"
      >
        {{ t('sso.changeProvider') }}
      </Button>
    </div>
    <Card
      class="sso-configuration-form-card"
      data-testid="sso-configuration-form-card"
    >
      <ResizablePanels
        class-name="content-height-with-resizable-panel"
        :first-panel="{
          className: 'content-resizable-panel-container',
          minWidth: 700,
          flex: 0.7,
        }"
        :second-panel="{
          className: 'service-doc-panel content-resizable-panel-container',
          minWidth: 400,
        }"
      >
        <template #first>
          <div class="sso-form-sticky-header" />
          <div v-if="config.isEditMode.value && config.showForm.value">
            <div v-if="showSamlUpload" class="m-b-md">
              <SsoSamlMetadataUpload
                :file-name="config.metadataUploadFileName.value"
                :status="config.metadataUploadStatus.value"
                @change-file="handleChangeFile"
                @file-upload="config.handleMetadataFileUpload"
              />
            </div>
            <SsoSchemaNode
              :brand-name="brandName"
              :disabled="config.isFormReadOnly.value"
              :entry="authEntry"
              field-id="root/authenticationConfiguration"
              :get-field-errors="getFieldErrors"
              :locale="locale"
              :managed-paths="config.managedPaths.value"
              :model-value="config.internalData.value?.authenticationConfiguration"
              :path="['authenticationConfiguration']"
              :schema="authSchema"
              @change="handleFieldChange"
              @clear-error="config.handleClearFieldError"
            />
            <SsoSchemaNode
              :brand-name="brandName"
              :disabled="config.isFormReadOnly.value"
              :entry="authorizerEntry"
              field-id="root/authorizerConfiguration"
              :get-field-errors="getFieldErrors"
              :locale="locale"
              :managed-paths="config.managedPaths.value"
              :model-value="config.internalData.value?.authorizerConfiguration"
              :path="['authorizerConfiguration']"
              :schema="authorizerSchema"
              @change="handleFieldChange"
              @clear-error="config.handleClearFieldError"
            />
          </div>
          <div v-if="showFormActions">
            <div v-if="showConfigAlerts" class="sso-config-alerts">
              <Alert
                v-if="!config.hasExistingConfig.value"
                class="sso-save-warning"
                :message="t('sso.warning')"
                type="warning"
              >
                <template #description>
                  {{ t('sso.newConfigSaveWarning') }}
                </template>
              </Alert>
              <Alert
                v-if="config.isSaveGatedOnTestLogin.value"
                class="sso-test-login-required"
                :message="t('sso.testLogin.title')"
                type="warning"
              >
                <template #description>
                  {{ config.testLoginGateMessage.value }}
                  <Button
                    data-testid="save-anyway-sso-configuration"
                    :disabled="config.isLoading.value"
                    size="small"
                    @click="config.handleSave"
                  >
                    {{ t('sso.testLogin.saveAnyway') }}
                  </Button>
                </template>
              </Alert>
            </div>
            <div class="form-actions-bottom">
              <Button
                data-testid="cancel-sso-configuration"
                @click="config.handleCancelClick"
              >
                {{ t('crud.cancel') }}
              </Button>
              <Button
                v-if="config.canTestLogin.value"
                data-testid="test-login-sso-configuration"
                :disabled="
                  config.isLoading.value ||
                  config.isTestingLogin.value ||
                  !config.currentProvider.value
                "
                :loading="config.isTestingLogin.value"
                @click="config.handleTestLogin"
              >
                {{ t('sso.testLogin.title') }}
              </Button>
              <Button
                data-testid="save-sso-configuration"
                :disabled="
                  config.isLoading.value || config.isSaveGatedOnTestLogin.value
                "
                :loading="config.isLoading.value"
                type="primary"
                @click="config.handleSave"
              >
                {{ t('crud.save') }}
              </Button>
            </div>
            <SsoTestLoginModal
              :configuration-check="config.testLoginConfigurationCheck.value"
              :error="config.testLoginError.value"
              :is-awaiting-credentials="config.isAwaitingTestLoginCredentials.value"
              :is-testing="config.isTestingLogin.value"
              :open="config.showTestLoginModal.value"
              :result="config.testLoginResult.value"
              :on-submit-credentials="config.submitTestLoginCredentials"
              @close="config.handleTestLoginModalClose"
            />
          </div>
        </template>
        <template #second>
          <SsoDocPanel
            :active-field="activeField"
            :service-name="config.currentProvider.value || 'general'"
          />
        </template>
      </ResizablePanels>
    </Card>
  </div>
</template>

<style scoped>
.sso-config-alerts {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
</style>
