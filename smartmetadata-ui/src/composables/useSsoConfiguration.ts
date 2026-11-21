/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JsonPatchOp } from '@/admin/jsonPatch';
import {
  applySsoSamlConfiguration,
  cleanupSsoProviderFields,
  comparableSsoFormData,
  createSsoFreshFormData,
  handleSsoClientTypeChange,
} from '@/admin/ssoDefaults';
import type { SsoClientType } from '@/admin/ssoProviders';
import type { SsoSecuritySources } from '@/admin/ssoSecuritySources';
import {
  getSsoProviderSchema,
  normalizeSsoFormData,
  type SsoFormData,
} from '@/admin/ssoSchemas';
import {
  isPointerManaged,
  pinManagedFields,
} from '@/utils/settingsSource';
import {
  parseSsoSamlMetadataXml,
  SSO_MAX_XML_SIZE,
  type SsoSamlIdpMetadata,
} from '@/admin/ssoSamlXml';
import { requiresTestLogin } from '@/admin/ssoTestLogin';
import {
  showSsoErrorToast,
  showSsoSuccessToast,
  showSsoWarningToast,
} from '@/admin/ssoToasts';
import { resolveSsoUiSchema } from '@/admin/ssoUiSchema';
import {
  buildSsoClientErrorMap,
  clearSsoFieldError,
  computeSsoDomPresentIds,
  createSsoFormScrollHandler,
  findSsoChangedFields,
  getSsoErrorText,
  getSsoFieldErrors,
  hasSsoFieldErrors,
  hasSsoFieldValidationErrors,
  mergeSsoDisplayErrors,
  parseSsoErrorBody,
  parseSsoValidationErrors,
  splitSsoValidationErrors,
  toSsoRjsfError,
  transformSsoValidationErrors,
  validateSsoFormData,
  type SsoErrorSchema,
  type SsoValidationIssue,
} from '@/admin/ssoValidation';
import {
  applySecurityConfiguration,
  patchSecurityConfiguration,
  validateSecurityConfiguration,
  type SecurityConfigurationDocument,
  type SecurityFieldError,
} from '@/api/system';
import {
  useSsoTestLogin,
  type ConfigurationCheckOutcome,
} from '@/composables/useSsoTestLogin';
import { useAuthStore } from '@/stores/auth';
import { compare, type Operation } from 'fast-json-patch';
import {
  computed,
  ref,
  toValue,
  watch,
  type MaybeRefOrGetter,
} from 'vue';
import { useI18n } from 'vue-i18n';

/**
 * The SSO configuration form state machine, ported function-by-function
 * from pin `hooks/useSsoConfiguration.ts` (392b3efd). The view owns the
 * GET read and passes its result in; this composable owns setup, the
 * schema/UI-schema memos, the error pipeline, the PUT/PATCH save
 * dispatch, Test Login wiring, the save gate, cancel, and the SAML
 * metadata upload.
 *
 * Two structural deviations from the pin hook, both with identical
 * observable behavior (see the final report):
 *
 * 1. DEV-NORMALIZE-INIT: pin's RJSF-managed state is default-filled at
 *    render time while `internalData` stays raw until the first edit.
 *    The Vue port initializes `internalData` normalized, so the display
 *    matches pin from mount and payloads match pin's post-edit
 *    behavior. Only an untouched-save PATCH differs, by semantically
 *    neutral schema-default ops.
 * 2. The save-gate computed must not call the mutating `buildPayload`
 *    (a computed mutating its own dependency loops); it guards on
 *    `internalData` presence and compares through the non-mutating
 *    `comparableFormData` pipeline instead.
 *
 * There is no `customValidate` return: without RJSF, field errors are
 * read through `getDisplayErrors`, which merges the client map and the
 * backend backfill exactly as pin's customValidate + error display do.
 */

export interface SsoConfigurationOptions {
  forceEditMode?: MaybeRefOrGetter<boolean>;
  onChangeProvider?: () => void;
  onProviderSelect?: (provider: string) => void;
  selectedProvider?: MaybeRefOrGetter<string | undefined>;
  /**
   * The parent's GET result. `undefined` means not loaded yet (the form
   * stays initializing); `null` means the parent loaded but found no
   * usable configuration — the provider selector, mirroring pin's
   * fetch-catch branch. The composable never fetches itself.
   */
  securityConfig?: MaybeRefOrGetter<SsoFormData | null | undefined>;
  managedPaths?: MaybeRefOrGetter<
    SsoSecuritySources['managedPaths'] | undefined
  >;
  isReadOnly?: MaybeRefOrGetter<boolean>;
}

/** Fields a SAML metadata upload overwrites (pin `SAML_METADATA_POINTERS`). */
const SSO_SAML_METADATA_POINTERS = [
  '/samlConfiguration/idp/entityId',
  '/samlConfiguration/idp/ssoLoginUrl',
  '/samlConfiguration/idp/idpX509Certificate',
];

/**
 * `compare` only ever emits add/remove/replace; the product patch type
 * cannot express the other RFC 6902 ops, so anything else fails loud
 * rather than being silently dropped.
 */
function toSsoJsonPatchOps(operations: Operation[]): JsonPatchOp[] {
  return operations.map((operation) => {
    if (
      operation.op === 'add' ||
      operation.op === 'remove' ||
      operation.op === 'replace'
    ) {
      const patch: JsonPatchOp = { op: operation.op, path: operation.path };
      if ('value' in operation) {
        patch.value = operation.value;
      }
      return patch;
    }
    throw new Error(
      `Unsupported JSON Patch operation from compare: ${operation.op}`,
    );
  });
}

/** Immutable set/delete along a path (RJSF deletes keys set to undefined). */
function setSsoFieldValue(
  data: SsoFormData,
  path: string[],
  value: unknown,
): SsoFormData {
  const next = { ...data };
  let cursor: Record<string, unknown> = next as Record<string, unknown>;
  for (let i = 0; i < path.length - 1; i += 1) {
    const segment = path[i];
    const child = cursor[segment];
    const childClone =
      child && typeof child === 'object' && !Array.isArray(child)
        ? { ...(child as Record<string, unknown>) }
        : {};
    cursor[segment] = childClone;
    cursor = childClone;
  }
  const leaf = path[path.length - 1];
  if (value === undefined) {
    delete cursor[leaf];
  } else {
    cursor[leaf] = value;
  }
  return next;
}

export function useSsoConfiguration(options: SsoConfigurationOptions = {}) {
  const { t } = useI18n();
  const authStore = useAuthStore();

  const isEditMode = ref(false);
  const isLoading = ref(false);
  const isInitializing = ref(true);
  const internalData = ref<SsoFormData | undefined>(undefined);
  const savedData = ref<SsoFormData | undefined>(undefined);
  const currentProvider = ref<string | undefined>(undefined);
  const showProviderSelector = ref(false);
  const hasExistingConfig = ref(false);
  const showForm = ref(false);
  const showCancelModal = ref(false);
  const modalSaveLoading = ref(false);
  const isModalSave = ref(false);
  const errorClearTrigger = ref(0);
  const metadataUploadStatus = ref<'success' | 'error' | null>(null);
  const metadataUploadFileName = ref('');
  const showTestLoginModal = ref(false);
  const {
    isTesting: isTestingLogin,
    isAwaitingCredentials: isAwaitingTestLoginCredentials,
    configurationCheck: testLoginConfigurationCheck,
    result: testLoginResult,
    error: testLoginError,
    runTestLogin,
    submitCredentials: submitTestLoginCredentials,
    reset: resetTestLogin,
  } = useSsoTestLogin();
  // The exact candidate a Test Login last passed for: any later edit
  // re-arms the save gate.
  const passedTestLoginKey = ref<string | undefined>(undefined);
  const testedPayloadKey = ref<string | undefined>(undefined);
  const fieldErrors = ref<SsoErrorSchema>({});

  const isFormReadOnly = computed(() => toValue(options.isReadOnly) ?? false);
  const managedPaths = computed(
    () =>
      toValue(options.managedPaths) ?? {
        authenticationConfiguration: [],
        authorizerConfiguration: [],
      },
  );
  const authenticationManagedPaths = computed(
    () => managedPaths.value.authenticationConfiguration,
  );
  const authorizerManagedPaths = computed(
    () => managedPaths.value.authorizerConfiguration,
  );
  const canChangeProvider = computed(
    () =>
      !isFormReadOnly.value &&
      !isPointerManaged(authenticationManagedPaths.value, '/provider'),
  );
  const canUploadSamlMetadata = computed(
    () =>
      !isFormReadOnly.value &&
      !SSO_SAML_METADATA_POINTERS.some((pointer) =>
        isPointerManaged(authenticationManagedPaths.value, pointer),
      ),
  );

  const schema = computed(() =>
    getSsoProviderSchema(currentProvider.value, hasExistingConfig.value),
  );
  const uiSchema = computed(() =>
    resolveSsoUiSchema({
      provider: currentProvider.value ?? '',
      hasExistingConfig: hasExistingConfig.value,
      hasSavedData: savedData.value !== undefined,
      clientType: internalData.value?.authenticationConfiguration
        ?.clientType as string | undefined,
    }),
  );

  const normalizeFormData = (data: SsoFormData): SsoFormData =>
    normalizeSsoFormData(schema.value, data) as SsoFormData;
  const comparableFormData = (
    data: SsoFormData | undefined,
  ): SsoFormData | undefined => comparableSsoFormData(schema.value, data);

  const scrollToFirstError = createSsoFormScrollHandler();

  const setupConfigurationState = (config: SsoFormData): void => {
    const provider = config.authenticationConfiguration?.provider as
      | string
      | undefined;
    if (!provider || provider === 'basic') {
      showProviderSelector.value = true;
      return;
    }

    hasExistingConfig.value = true;
    currentProvider.value = provider;

    const configData: SsoFormData = {
      authenticationConfiguration: {
        ...(config.authenticationConfiguration ?? {}),
      },
      authorizerConfiguration: { ...(config.authorizerConfiguration ?? {}) },
    };

    if (provider === 'saml') {
      applySsoSamlConfiguration(configData);
    }

    savedData.value = configData;
    internalData.value = normalizeFormData(configData);
    showForm.value = true;

    if (toValue(options.forceEditMode)) {
      isEditMode.value = true;
      showForm.value = true;
    }
  };

  // Pin's securityConfig effect depends on setupConfigurationState, which is
  // memoized on forceEditMode — so a forceEditMode flip re-runs setup (tab
  // switches reset the form to the saved document and re-apply the edit flag).
  // The watcher source must track both values to keep that behavior.
  watch(
    (): [SsoFormData | null | undefined, boolean | undefined] => [
      toValue(options.securityConfig),
      toValue(options.forceEditMode),
    ],
    ([config]) => {
      if (config === undefined) {
        return;
      }
      if (config === null) {
        if (!toValue(options.selectedProvider)) {
          showProviderSelector.value = true;
        }
        isInitializing.value = false;
        return;
      }
      if (!toValue(options.selectedProvider)) {
        setupConfigurationState(config);
      }
      isInitializing.value = false;
    },
    { immediate: true },
  );

  watch(
    () => toValue(options.selectedProvider),
    (provider) => {
      if (!provider) {
        return;
      }

      if (provider === 'basic') {
        showProviderSelector.value = true;
        showForm.value = false;
        isEditMode.value = false;
        isInitializing.value = false;
        return;
      }

      hasExistingConfig.value = false;
      savedData.value = undefined;
      metadataUploadStatus.value = null;
      metadataUploadFileName.value = '';

      currentProvider.value = provider;
      isEditMode.value = true;
      showForm.value = true;
      showProviderSelector.value = false;
      isInitializing.value = false;

      internalData.value = normalizeFormData(createSsoFreshFormData(provider));
    },
    { immediate: true },
  );

  // -- Error pipeline -------------------------------------------------------

  const handleClearFieldError = (fieldPath: string): void => {
    clearSsoFieldError(fieldErrors.value, fieldPath);
  };

  const highlightFieldErrors = (issues: SsoValidationIssue[]): void => {
    const { fieldErrors: fieldIssues } = splitSsoValidationErrors(issues);
    fieldErrors.value = parseSsoValidationErrors(fieldIssues);
    scrollToFirstError();
  };

  const handleValidationErrors = (issues: SsoValidationIssue[]): void => {
    const { genericErrors } = splitSsoValidationErrors(issues);
    highlightFieldErrors(issues);
    for (const issue of genericErrors) {
      showSsoErrorToast(issue.error, t('sso.unexpectedError'));
    }
  };

  const liveValidate = computed(
    () =>
      hasSsoFieldErrors(fieldErrors.value) || errorClearTrigger.value > 0,
  );
  const domPresentIds = computed(() =>
    computeSsoDomPresentIds(schema.value, uiSchema.value),
  );
  const clientErrorMap = computed(() => {
    if (!liveValidate.value || !internalData.value) {
      return new Map<string, string[]>();
    }
    const transformed = transformSsoValidationErrors(
      validateSsoFormData(schema.value, internalData.value).map(
        toSsoRjsfError,
      ),
      {
        isElementPresent: (id) => domPresentIds.value.has(id),
        formatMessage: (key, params) => {
          if (key === 'message.field-text-is-required') {
            return t('sso.validation.fieldRequired', {
              fieldText: params.fieldText as string,
            });
          }
          if (key === 'message.value-must-be-greater-than') {
            return t('sso.validation.valueGreaterThan', {
              field: params.field as string,
              minimum: params.minimum as number,
            });
          }
          if (key === 'message.value-must-be-less-than-or-equal') {
            return t('sso.validation.valueLessThanOrEqual', {
              field: params.field as string,
              maximum: params.maximum as number,
            });
          }
          return key;
        },
      },
    );
    return buildSsoClientErrorMap(transformed);
  });

  /** Client-first + backend messages for one field, deduped in order. */
  const getDisplayErrors = (path: string[]): string[] =>
    mergeSsoDisplayErrors(
      clientErrorMap.value.get(`root/${path.join('/')}`) ?? [],
      getSsoFieldErrors(fieldErrors.value, path),
    );

  // -- Change pipeline ------------------------------------------------------

  const clearErrorsForChangedFields = (newFormData: SsoFormData): void => {
    if (Object.keys(fieldErrors.value).length === 0) {
      return;
    }
    const changedFields = findSsoChangedFields(internalData.value, newFormData);
    if (changedFields.length > 0) {
      for (const fieldPath of changedFields) {
        handleClearFieldError(fieldPath);
      }
      errorClearTrigger.value += 1;
    }
  };

  const handleProviderChange = (newFormData: SsoFormData): void => {
    const newProvider = newFormData?.authenticationConfiguration
      ?.provider as string | undefined;
    if (newProvider && newProvider !== currentProvider.value) {
      currentProvider.value = newProvider;
      options.onProviderSelect?.(newProvider);
    }
  };

  const handleFieldChange = (path: string[], value: unknown): void => {
    const current = internalData.value;
    if (!current) {
      return;
    }
    const newFormData = setSsoFieldValue(current, path, value);
    const authConfig = newFormData.authenticationConfiguration;

    clearErrorsForChangedFields(newFormData);

    handleSsoClientTypeChange(
      authConfig,
      current.authenticationConfiguration?.clientType as
        | SsoClientType
        | undefined,
      authConfig?.clientType as SsoClientType | undefined,
    );

    internalData.value = newFormData;
    handleProviderChange(newFormData);
  };

  // -- SAML metadata upload ---------------------------------------------------

  const updateIdpFields = (fields: SsoSamlIdpMetadata): void => {
    const current = internalData.value;
    if (!current) {
      return;
    }
    const auth = current.authenticationConfiguration ?? {};
    const saml = (auth.samlConfiguration ?? {}) as Record<string, unknown>;
    const idp = (saml.idp ?? {}) as Record<string, unknown>;
    internalData.value = {
      ...current,
      authenticationConfiguration: {
        ...auth,
        samlConfiguration: { ...saml, idp: { ...idp, ...fields } },
      },
    };
  };

  const handleMetadataFileUpload = (files: FileList | File[]): void => {
    const file = files[0];
    if (!file) {
      return;
    }
    if (file.size > SSO_MAX_XML_SIZE) {
      showSsoErrorToast(
        t('sso.fileSizeExceeded', { size: '1 MB' }),
        t('sso.unexpectedError'),
      );
      return;
    }
    void file
      .text()
      .then((xml) => {
        try {
          const metadata = parseSsoSamlMetadataXml(xml);
          updateIdpFields(metadata);
          metadataUploadFileName.value = file.name;
          metadataUploadStatus.value = 'success';
        } catch {
          updateIdpFields({
            entityId: '',
            ssoLoginUrl: '',
            idpX509Certificate: '',
          });
          metadataUploadFileName.value = file.name;
          metadataUploadStatus.value = 'error';
        }
      })
      .catch(() => {
        // A read failure sets status and filename but does NOT clear the
        // idp fields — only a parse failure does.
        metadataUploadFileName.value = file.name;
        metadataUploadStatus.value = 'error';
      });
  };

  // -- Validation / save ------------------------------------------------------

  const updateLoading = (value: boolean): void => {
    if (!isModalSave.value) {
      isLoading.value = value;
    }
  };

  const handleValidationError = (result: {
    status: string;
    errors?: SecurityFieldError[];
  }): void => {
    handleValidationErrors(result.errors ?? []);
    updateLoading(false);
  };

  const handleApiError = (error: unknown): void => {
    if (hasSsoFieldValidationErrors(error)) {
      handleValidationErrors(
        parseSsoErrorBody((error as { body: string }).body),
      );
    } else {
      // Validate/save calls are never GET, so no method is passed: 401s
      // still suppress, 403s still show.
      showSsoErrorToast(error, t('sso.unexpectedError'));
    }
    updateLoading(false);
  };

  const validateConfiguration = async (
    payload: SecurityConfigurationDocument,
  ): Promise<boolean> => {
    try {
      const result = await validateSecurityConfiguration(payload);
      const errors = result.errors ?? [];

      if (errors.length > 0) {
        handleValidationError({ status: result.status, errors });
        return false;
      }

      if (result.status === 'failed' || result.status !== 'success') {
        handleValidationError({ status: result.status, errors });
        return false;
      }

      return true;
    } catch (error) {
      handleApiError(error);
      return false;
    }
  };

  const buildPayload = ():
    | {
        cleanedFormData: SsoFormData;
        payload: SecurityConfigurationDocument;
      }
    | undefined => {
    const cleanedFormData = cleanupSsoProviderFields(
      internalData.value,
      internalData.value?.authenticationConfiguration?.provider as string,
    );

    if (!cleanedFormData) {
      return undefined;
    }

    return {
      cleanedFormData,
      payload: {
        authenticationConfiguration: cleanedFormData.authenticationConfiguration,
        authorizerConfiguration: cleanedFormData.authorizerConfiguration,
      },
    };
  };

  const saveExistingConfiguration = async (
    cleanedFormData: SsoFormData,
  ): Promise<boolean> => {
    if (!savedData.value) {
      return false;
    }

    // A field the deployment owns keeps its saved value, so a stale form
    // cannot send a change the server would reject.
    const candidate = pinManagedFields(
      pinManagedFields(
        cleanedFormData,
        savedData.value,
        authenticationManagedPaths.value,
        'authenticationConfiguration',
      ),
      savedData.value,
      authorizerManagedPaths.value,
      'authorizerConfiguration',
    );
    const allPatches = toSsoJsonPatchOps(compare(savedData.value, candidate));
    if (allPatches.length > 0) {
      await patchSecurityConfiguration(allPatches);
    }

    return true;
  };

  const saveNewConfiguration = async (
    payload: SecurityConfigurationDocument,
  ): Promise<boolean> => {
    const isValid = await validateConfiguration(payload);
    if (!isValid) {
      return false;
    }

    await applySecurityConfiguration(payload);

    return true;
  };

  const handlePostSaveActions = async (
    cleanedFormData: SsoFormData,
  ): Promise<void> => {
    if (hasExistingConfig.value) {
      // The saved baseline is the cleaned form data, unpinned: pinning
      // applies only to the PATCH candidate.
      savedData.value = cleanedFormData;
      updateLoading(false);
      showSsoSuccessToast(t('sso.configurationSaved'));
    } else {
      try {
        sessionStorage.clear();
        localStorage.clear();
        authStore.forgetLocalSession();
      } catch {
        // Silent fail for storage operations.
      }
      // Pin redirects to '/signin'; the product login route is '/login'.
      globalThis.location.replace('/login');
    }
  };

  const handleSave = async (): Promise<void> => {
    updateLoading(true);
    fieldErrors.value = {};
    errorClearTrigger.value = 0;

    try {
      const built = buildPayload();
      if (!built) {
        updateLoading(false);
        return;
      }

      const { cleanedFormData, payload } = built;

      try {
        const success =
          hasExistingConfig.value && savedData.value
            ? await saveExistingConfiguration(cleanedFormData)
            : await saveNewConfiguration(payload);

        if (!success) {
          return;
        }
      } catch (error) {
        handleApiError(error);
        return;
      }

      await handlePostSaveActions(cleanedFormData);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : t('sso.configurationSaveFailed');
      showSsoErrorToast(errorMessage, t('sso.unexpectedError'));
      updateLoading(false);
    } finally {
      updateLoading(false);
    }
  };

  // -- Test Login ---------------------------------------------------------------

  // Test Login starts with the checks a save runs (fields, reachability,
  // credentials) and signs in only when they pass. Problems tied to a
  // field are marked in the form; the modal lists them all.
  const checkConfiguration = async (
    payload: SecurityConfigurationDocument,
  ): Promise<ConfigurationCheckOutcome> => {
    fieldErrors.value = {};
    errorClearTrigger.value = 0;
    try {
      const result = await validateSecurityConfiguration(payload);
      const errors = result.errors ?? [];
      highlightFieldErrors(errors);

      return {
        passed: errors.length === 0 && result.status === 'success',
        problems: errors.map((e) => e.error),
      };
    } catch (error) {
      const errors = hasSsoFieldValidationErrors(error)
        ? parseSsoErrorBody((error as { body: string }).body)
        : [];
      highlightFieldErrors(errors);

      return {
        passed: false,
        problems:
          errors.length === 0
            ? [getSsoErrorText(error, t('sso.testLogin.error'))]
            : errors.map((e) => e.error),
      };
    }
  };

  const handleTestLogin = (): void => {
    const built = buildPayload();
    if (!built) {
      return;
    }

    testedPayloadKey.value = JSON.stringify(
      comparableFormData(internalData.value),
    );
    resetTestLogin();
    showTestLoginModal.value = true;
    void runTestLogin(built.payload, checkConfiguration);
  };

  // Closing the modal abandons a test still in flight: its popup closes
  // and polling stops. A pass already recorded for this configuration
  // stays.
  const handleTestLoginModalClose = (): void => {
    resetTestLogin();
    showTestLoginModal.value = false;
  };

  watch(testLoginResult, (result) => {
    if (result?.status === 'success' && testedPayloadKey.value) {
      passedTestLoginKey.value = testedPayloadKey.value;
    }
  });

  const canTestLogin = computed(
    () => Boolean(currentProvider.value) && currentProvider.value !== 'basic',
  );

  // A new configuration, or an edit that changes how users sign in, must
  // be proven by a passing Test Login before it can be saved — saving an
  // unproven one is how admins lock themselves out. "Save anyway"
  // remains the explicit override.
  const isSaveGatedOnTestLogin = computed(() => {
    if (!internalData.value || !canTestLogin.value) {
      return false;
    }
    const candidate = comparableFormData(internalData.value);
    // Compare like with like, or an untouched configuration would look
    // edited and be gated.
    const saved = hasExistingConfig.value
      ? comparableFormData(savedData.value)
      : undefined;

    return (
      requiresTestLogin(saved, candidate) &&
      passedTestLoginKey.value !== JSON.stringify(candidate)
    );
  });

  const testLoginGateMessage = computed(() =>
    hasExistingConfig.value
      ? t('sso.testLogin.requiredForEdit')
      : t('sso.testLogin.requiredBeforeSave'),
  );

  // -- Cancel -------------------------------------------------------------------

  const handleCancelConfirm = (): void => {
    showCancelModal.value = false;
    fieldErrors.value = {};
    errorClearTrigger.value = 0;

    // For existing/configured SSO, discard changes and stay on the page.
    if (hasExistingConfig.value && savedData.value) {
      internalData.value = normalizeFormData(savedData.value);
      return;
    }

    // For new SSO setup, reset to provider selection.
    showProviderSelector.value = true;
    showForm.value = false;
    isEditMode.value = false;
    currentProvider.value = undefined;
    internalData.value = undefined;
    savedData.value = undefined;
    hasExistingConfig.value = false;

    if (options.onChangeProvider) {
      options.onChangeProvider();
    }
  };

  const handleCancelModalClose = (): void => {
    showCancelModal.value = false;
  };

  const handleCancelClick = (): void => {
    // Always show the modal - let the user decide what they want to do.
    showCancelModal.value = true;
  };

  const handleSaveAndExit = async (): Promise<void> => {
    // The unsaved-changes modal must not become a way around the Test
    // Login gate; "Save anyway" on the form stays the only override.
    if (isSaveGatedOnTestLogin.value) {
      showCancelModal.value = false;
      showSsoWarningToast(testLoginGateMessage.value);
      return;
    }

    modalSaveLoading.value = true;
    isModalSave.value = true;

    try {
      if (internalData.value) {
        await handleSave();
      }

      showCancelModal.value = false;
      modalSaveLoading.value = false;
      isModalSave.value = false;

      if (hasExistingConfig.value) {
        return;
      }

      handleCancelConfirm();
    } catch {
      showCancelModal.value = false;
      modalSaveLoading.value = false;
      isModalSave.value = false;
    }
  };

  const handleProviderSelect = (provider: string): void => {
    // If selecting a new provider when one already exists, don't
    // overwrite the saved data.
    currentProvider.value = provider;
    showProviderSelector.value = false;
    showForm.value = true;
    isEditMode.value = true;

    if (options.onProviderSelect) {
      options.onProviderSelect(provider);
    }

    internalData.value = normalizeFormData(createSsoFreshFormData(provider));
  };

  return {
    isEditMode,
    isLoading,
    isInitializing,
    internalData,
    savedData,
    currentProvider,
    showProviderSelector,
    hasExistingConfig,
    showForm,
    showCancelModal,
    modalSaveLoading,
    errorClearTrigger,
    metadataUploadStatus,
    metadataUploadFileName,
    showTestLoginModal,
    isTestingLogin,
    isAwaitingTestLoginCredentials,
    testLoginConfigurationCheck,
    testLoginResult,
    testLoginError,
    submitTestLoginCredentials,
    fieldErrors,
    schema,
    uiSchema,
    canChangeProvider,
    canUploadSamlMetadata,
    canTestLogin,
    isSaveGatedOnTestLogin,
    testLoginGateMessage,
    isFormReadOnly,
    managedPaths,
    liveValidate,
    getDisplayErrors,
    handleClearFieldError,
    handleMetadataFileUpload,
    handleFieldChange,
    handleTestLogin,
    handleTestLoginModalClose,
    handleSave,
    handleCancelConfirm,
    handleCancelModalClose,
    handleCancelClick,
    handleSaveAndExit,
    handleProviderSelect,
  };
}
