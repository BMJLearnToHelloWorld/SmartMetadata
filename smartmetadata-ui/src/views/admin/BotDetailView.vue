<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<!--
  Vue port of the official Bot detail page (392b3efd object tree):
  `pages/BotDetailsPage/BotDetailsPage.tsx` (permission fetch, gated
  sequential fetch, write-back, render order) and
  `components/Settings/Bot/BotDetails/BotDetails.component.tsx` (three
  panels, display-name edit, description, roles, token card), with the
  token card from `components/Settings/Users/AccessTokenCard/` +
  `components/Settings/Bot/AuthMechanism*.tsx` (non-SCIM only; the SCIM
  branch is unreachable and is not built, B31).

  Staged route contract (t363): the page takes `fqn` (pin flow,
  `/bots/:fqn`) with a transitional `id` fallback resolving the FQN via
  `getBot` first. The `id` prop and fallback are deleted when the
  integration line migrates the route; the old detail + admin-only
  guard stay until then.
-->
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  Button,
  Card,
  Divider,
  Form,
  Input,
  Modal,
  Select,
  Spin,
  Tag,
  Tooltip,
  message,
} from 'ant-design-vue';
import {
  CheckOutlined,
  CloseOutlined,
  CopyOutlined,
  EditOutlined,
  RobotOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons-vue';
import {
  JWT_TOKEN_EXPIRY_OPTIONS,
  generateBotToken,
  getAuthMechanismForBotUser,
  getBot,
  getBotByName,
  revokeBotToken,
  updateBotDetail,
  type BotAuthMechanism,
} from '@/api/bots';
import { getUserByName, updateUserDetail } from '@/api/users';
import type { AdminBot, AdminUser } from '@/types/admin';
import { getLimitByResource } from '@/api/limits';
import { getDerivedPermissionFlags, type OperationPermissions } from '@/api/permissions';
import { searchRoles } from '@/api/roles';
import { diffJsonPatch } from '@/admin/jsonPatch';
import NoDataPlaceholder from '@/components/shared/NoDataPlaceholder.vue';
import PageLayout from '@/components/shared/PageLayout.vue';
import PermissionPlaceholder from '@/components/shared/PermissionPlaceholder.vue';
import SmBreadcrumb, { type SmBreadcrumbItem } from '@/components/shared/SmBreadcrumb.vue';
import SmMarkdown from '@/components/shared/SmMarkdown.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { getEntityName } from '@/components/shared/profilePictureUtils';
import { usePermissionStore } from '@/stores/permissions';
import { useShellConfigStore } from '@/stores/shellConfig';
import { isDescriptionContentEmpty } from '@/utils/richTextUtils';
import type { AdminRole, JwtTokenExpiry } from '@/types/admin';

/** Official `TERM_ADMIN` (constants.ts:92); rendered literally, not via i18n. */
const TERM_ADMIN = 'Admin';
/** Lowercased admin pseudo-role id (RolesCard:124). */
const ADMIN_ROLE_ID = 'admin';
/** Roles search debounce (BotDetails:91-109). */
const ROLES_SEARCH_DEBOUNCE_MS = 300;
/** Copy tooltip cycle (CopyToClipboardButton.tsx:32-62, 1500ms default). */
const COPY_TOOLTIP_MS = 1500;
/** Limit field that disables the token card (BotDetails:63). */
const TOKEN_DISABLED_FIELD = 'token';

const props = defineProps<{ fqn?: string; id?: string }>();
const { t, locale } = useI18n();
const permissionStore = usePermissionStore();
const shellConfig = useShellConfigStore();

const isAdminUser = computed(() => permissionStore.isAdminUser);
const brandName = computed(() => t('product.name'));

/* Page state machine (BotDetailsPage.tsx:48-70, 140-181). */
const botData = ref<AdminBot | null>(null);
const botUserData = ref<AdminUser | null>(null);
const botPermissions = ref<OperationPermissions>({});
const effectiveFqn = ref('');
const isError = ref(false);
const isBotDataLoading = ref(false);
const permissionsLoading = ref(true);

const derivedFlags = computed(() => getDerivedPermissionFlags(botPermissions.value));
const viewBotPermission = computed(() => derivedFlags.value.hasViewAccess);
const canEditDisplayName = computed(() => derivedFlags.value.canEditDisplayName);
const canEditDescription = computed(() => derivedFlags.value.canEditDescription);
const isLoading = computed(
  () => permissionsLoading.value || (viewBotPermission.value && isBotDataLoading.value),
);
const contentVisible = computed(() => !isLoading.value && !isError.value && isAdminUser.value);
const pageTitle = computed(() => getEntityName(botData.value) || t('label.bot-detail'));

const detailBreadcrumbs = computed<SmBreadcrumbItem[]>(() => [
  // Literal 'Bots' per BotDetails.component.tsx:311, not the i18n plural.
  { label: 'Bots', routeName: 'admin-bots' },
  { label: botData.value?.name ?? '' },
]);

function errorMessageText(error: unknown, fallback?: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback ?? t('server.unexpected-error');
}

/* Left panel state (BotDetails.component.tsx). */
const displayName = ref('');
const isDisplayNameEdit = ref(false);
const roles = ref<AdminRole[]>([]);
const selectedRoles = ref<string[]>([]);
const isRolesEdit = ref(false);
const isDescriptionEdit = ref(false);
const descriptionDraft = ref('');
const disableFields = ref<string[]>([TOKEN_DISABLED_FIELD]);

/* Token card state (AccessTokenCard + AuthMechanism, non-SCIM). */
const mechanism = ref<BotAuthMechanism>({ authType: 'JWT' });
const isDataLoaded = ref(false);
const cardLoading = ref(false);
const isAuthMechanismEdit = ref(false);
const isUpdating = ref(false);
const isTokenRemoving = ref(false);
const isModalOpen = ref(false);
const formExpiry = ref<JwtTokenExpiry>('OneHour');
const formError = ref('');
const copied = ref(false);

const disabled = computed(() => disableFields.value.includes(TOKEN_DISABLED_FIELD));
const jwtToken = computed(() => mechanism.value.config?.JWTToken);
const tokenExpiresAt = computed(() => mechanism.value.config?.JWTTokenExpiresAt ?? 0);
const isMechanismEmpty = computed(() => Object.keys(mechanism.value).length === 0);
const expiryOptions = computed(() =>
  JWT_TOKEN_EXPIRY_OPTIONS.map((option) => ({
    value: option.value,
    label: option.labelParams ? t(option.labelKey, option.labelParams) : t(option.labelKey),
  })),
);

function resetPageState(): void {
  botData.value = null;
  botUserData.value = null;
  botPermissions.value = {};
  effectiveFqn.value = '';
  isError.value = false;
  isBotDataLoading.value = false;
  permissionsLoading.value = true;
  displayName.value = '';
  isDisplayNameEdit.value = false;
  roles.value = [];
  selectedRoles.value = [];
  isRolesEdit.value = false;
  isDescriptionEdit.value = false;
  descriptionDraft.value = '';
  disableFields.value = [TOKEN_DISABLED_FIELD];
  mechanism.value = { authType: 'JWT' };
  isDataLoaded.value = false;
  cardLoading.value = false;
  isAuthMechanismEdit.value = false;
  isUpdating.value = false;
  isTokenRemoving.value = false;
  isModalOpen.value = false;
  formExpiry.value = 'OneHour';
  formError.value = '';
  copied.value = false;
  leftPanelInitialized = false;
}

let loadGeneration = 0;

async function loadPermissions(fqn: string, generation: number): Promise<void> {
  if (!fqn) {
    permissionsLoading.value = false;
    return;
  }
  try {
    botPermissions.value = await permissionStore.getEntityPermissionByFqn('bot', fqn);
  } catch (error) {
    if (generation === loadGeneration) {
      message.error(errorMessageText(error));
    }
  } finally {
    if (generation === loadGeneration) {
      permissionsLoading.value = false;
    }
  }
}

async function fetchBotsData(fqn: string, generation: number): Promise<void> {
  isBotDataLoading.value = true;
  try {
    const botResponse = await getBotByName(fqn, { include: 'all' });
    const botUserResponse = await getUserByName(
      botResponse.botUser?.fullyQualifiedName || '',
      { fields: ['roles', 'profile'], include: 'all' },
    );
    if (generation !== loadGeneration) {
      return;
    }
    // Official order: bot user state first, then bot state (:72-94).
    botUserData.value = botUserResponse;
    botData.value = botResponse;
  } catch (error) {
    if (generation !== loadGeneration) {
      return;
    }
    message.error(errorMessageText(error));
    isError.value = true;
  } finally {
    if (generation === loadGeneration) {
      isBotDataLoading.value = false;
    }
  }
}

async function loadPage(): Promise<void> {
  const generation = ++loadGeneration;
  resetPageState();
  let fqn = props.fqn ?? '';
  if (!fqn && props.id) {
    // TRANSITIONAL legacy fallback (staged route contract): resolve the
    // FQN from the id before the permission fetch. Delete with the `id`
    // prop when the route migrates to `/bots/:fqn`.
    try {
      const resolved = await getBot(props.id);
      fqn = resolved.fullyQualifiedName || resolved.name || '';
    } catch (error) {
      if (generation !== loadGeneration) {
        return;
      }
      message.error(errorMessageText(error));
      isError.value = true;
      permissionsLoading.value = false;
      return;
    }
  }
  if (generation !== loadGeneration) {
    return;
  }
  effectiveFqn.value = fqn;
  await loadPermissions(fqn, generation);
  if (generation !== loadGeneration) {
    return;
  }
  // Fetch only when the BOT view permission holds (:140-144). An admin
  // without view permission renders the empty detail below — the
  // official edge, asserted as-is, not "fixed".
  if (viewBotPermission.value && fqn) {
    await fetchBotsData(fqn, generation);
  }
}

onMounted(() => {
  void loadPage();
});

watch([() => props.fqn, () => props.id], () => {
  void loadPage();
});

/* Write-back (BotDetailsPage.tsx:96-138): JSON Patch diff, merge the
 * response into local state; revoke replaces the bot user wholesale. */
async function updateBotsDetails(data: Partial<AdminBot>): Promise<void> {
  const current = botData.value;
  if (!current) {
    return;
  }
  const updated = { ...current, ...data };
  const patch = diffJsonPatch(
    current as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
  );
  try {
    const response = await updateBotDetail(current.id, patch);
    botData.value = { ...current, ...response };
  } catch (error) {
    message.error(errorMessageText(error));
  }
}

async function updateUserDetails(data: Partial<AdminUser>): Promise<void> {
  const current = botUserData.value;
  if (!current) {
    return;
  }
  const updated = { ...current, ...data };
  const patch = diffJsonPatch(
    current as unknown as Record<string, unknown>,
    updated as unknown as Record<string, unknown>,
  );
  try {
    const response = await updateUserDetail(current.id, patch);
    botUserData.value = { ...current, ...response };
  } catch (error) {
    message.error(errorMessageText(error));
  }
}

async function revokeBotsToken(): Promise<void> {
  const user = botUserData.value;
  if (!user) {
    return;
  }
  try {
    botUserData.value = await revokeBotToken(user.id);
  } catch (error) {
    message.error(errorMessageText(error));
  }
}

/* Display name (BotDetails.component.tsx:142-208). */
watch(botData, (bot) => {
  if (!isDisplayNameEdit.value) {
    displayName.value = bot?.displayName ?? '';
  }
});

function handleDisplayNameChange(): void {
  if (botData.value && displayName.value !== botData.value.displayName) {
    void updateBotsDetails({ displayName: displayName.value });
  }
  isDisplayNameEdit.value = false;
}

/* Description (Description.tsx:180-345; BOT has no request-description
 * button, no comments/suggestions/source badge). */
function openDescriptionEditor(): void {
  descriptionDraft.value = botData.value?.description ?? '';
  isDescriptionEdit.value = true;
}

function saveDescription(): void {
  isDescriptionEdit.value = false;
  void updateBotsDetails({ description: descriptionDraft.value });
}

/* Roles (BotDetails.component.tsx:91-128, RolesCard, RolesElement). */
function prepareSelectedRoles(): void {
  const user = botUserData.value;
  const selected = (user?.roles ?? [])
    .map((role) => role.id)
    .filter((id): id is string => Boolean(id));
  if (user?.isAdmin) {
    selected.push(ADMIN_ROLE_ID);
  }
  selectedRoles.value = selected;
}

watch(botUserData, () => {
  prepareSelectedRoles();
});

function uniqRolesById(list: AdminRole[]): AdminRole[] {
  const seen = new Set<string>();
  return list.filter((role) => {
    if (seen.has(role.id)) {
      return false;
    }
    seen.add(role.id);
    return true;
  });
}

async function fetchRoles(query = ''): Promise<void> {
  try {
    const page = await searchRoles(query);
    const selectedOptions = roles.value.filter((role) => selectedRoles.value.includes(role.id));
    roles.value = uniqRolesById([...selectedOptions, ...page.data]);
  } catch (error) {
    message.error(errorMessageText(error));
  }
}

let rolesTimer: ReturnType<typeof setTimeout> | undefined;

function debouncedFetchRoles(query: string): void {
  if (rolesTimer !== undefined) {
    clearTimeout(rolesTimer);
  }
  rolesTimer = setTimeout(() => {
    void fetchRoles(query);
  }, ROLES_SEARCH_DEBOUNCE_MS);
}

const roleOptions = computed(() => {
  const options = roles.value.map((role) => ({ value: role.id, label: getEntityName(role) }));
  if (!botUserData.value?.isAdmin || selectedRoles.value.includes(ADMIN_ROLE_ID)) {
    options.push({ value: ADMIN_ROLE_ID, label: TERM_ADMIN });
  }
  return options;
});

function handleRolesChange(): void {
  const updatedRoleIds = selectedRoles.value.filter((id) => id !== ADMIN_ROLE_ID);
  const isAdmin = selectedRoles.value.includes(ADMIN_ROLE_ID);
  void updateUserDetails({
    roles: updatedRoleIds.map((id) => {
      const role = roles.value.find((candidate) => candidate.id === id);
      return { id, type: 'role', name: role?.name ?? '' };
    }),
    isAdmin,
  });
  isRolesEdit.value = false;
}

/* Limits (BotDetails.component.tsx:63, 81-89). */
async function initLimits(): Promise<void> {
  if (!shellConfig.limit?.enable) {
    disableFields.value = [];
    return;
  }
  try {
    const limits = await getLimitByResource('bot');
    const status = limits.featureLimitStatuses[0];
    disableFields.value =
      status?.configuredLimit.disabledFields ?? status?.configuredLimit.disableFields ?? [];
  } catch {
    // Keep the initial ['token']: the card stays disabled when the
    // limit fetch fails, as in the official limit lookup.
  }
}

let leftPanelInitialized = false;

watch(contentVisible, (visible) => {
  if (visible && !leftPanelInitialized) {
    leftPanelInitialized = true;
    void fetchRoles();
    void initLimits();
  }
});

/* Token card (AccessTokenCard.component.tsx, AuthMechanism*.tsx). */
async function fetchAuthMechanismForBot(): Promise<void> {
  try {
    cardLoading.value = true;
    const user = botUserData.value;
    if (user) {
      mechanism.value = await getAuthMechanismForBotUser(user.id);
    }
  } catch (error) {
    message.error(errorMessageText(error));
  } finally {
    cardLoading.value = false;
    isDataLoaded.value = true;
  }
}

watch(
  () => [botUserData.value?.id, disabled.value, contentVisible.value],
  ([botUserId, isDisabled, visible]) => {
    if (botUserId && !isDisabled && visible) {
      void fetchAuthMechanismForBot();
    }
  },
);

function enterTokenForm(): void {
  formExpiry.value = 'OneHour';
  formError.value = '';
  isAuthMechanismEdit.value = true;
}

async function handleTokenFormSave(): Promise<void> {
  if (!formExpiry.value) {
    formError.value = t('message.field-text-is-required', {
      fieldText: t('label.token-expiration'),
    });
    return;
  }
  formError.value = '';
  isUpdating.value = true;
  const user = botUserData.value;
  const bot = botData.value;
  try {
    if (user && bot) {
      await generateBotToken(user.id, formExpiry.value);
      // Display always comes from the refetch, never from the
      // generate response (AccessTokenCard:160-174).
      await fetchAuthMechanismForBot();
    }
  } catch (error) {
    message.error(errorMessageText(error));
  } finally {
    // The official `finally` exits the form even on failure.
    isUpdating.value = false;
    isAuthMechanismEdit.value = false;
  }
}

function onRevokeClick(): void {
  if (disabled.value) {
    return;
  }
  isModalOpen.value = true;
}

async function handleTokenRevoke(): Promise<void> {
  isTokenRemoving.value = true;
  await revokeBotsToken();
  isTokenRemoving.value = false;
  enterTokenForm();
  isModalOpen.value = false;
}

let copyTimer: ReturnType<typeof setTimeout> | undefined;

function onCopyToken(): void {
  const token = jwtToken.value;
  if (!token) {
    return;
  }
  navigator.clipboard.writeText(token).catch(() => undefined);
  copied.value = true;
  if (copyTimer !== undefined) {
    clearTimeout(copyTimer);
  }
  copyTimer = setTimeout(() => {
    copied.value = false;
  }, COPY_TOOLTIP_MS);
}

onUnmounted(() => {
  if (rolesTimer !== undefined) {
    clearTimeout(rolesTimer);
  }
  if (copyTimer !== undefined) {
    clearTimeout(copyTimer);
  }
});

/* Token expiry (BotsUtils.tsx:75-85, AuthMechanism.tsx:88-107).
 * Long format: short weekday + ordinal day + long month + 12h time.
 * The ordinal suffix applies to English locales only; the two
 * expired/expires templates are pin literals with no pin i18n key,
 * so they use new `message.token-expired-on` / `message.token-expires-on`
 * keys for the integration line (draft §8 literal table). */
function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return 'th';
  }
  if (day % 10 === 1) {
    return 'st';
  }
  if (day % 10 === 2) {
    return 'nd';
  }
  if (day % 10 === 3) {
    return 'rd';
  }
  return 'th';
}

function formatTokenExpiryDate(expiresAt: number): string {
  const parts = new Intl.DateTimeFormat(locale.value, {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(expiresAt));
  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  const day = Number(pick('day'));
  const dayLabel = String(locale.value).startsWith('en')
    ? `${day}${ordinalSuffix(day)}`
    : pick('day');
  const dayPeriod = pick('dayPeriod');
  const time = `${pick('hour')}:${pick('minute')}${dayPeriod ? ` ${dayPeriod}` : ''}`;
  return `${pick('weekday')} ${dayLabel} ${pick('month')}, ${pick('year')}, ${time}`;
}

const tokenExpiryDate = computed(() => formatTokenExpiryDate(tokenExpiresAt.value));
const isTokenExpired = computed(() => Date.now() >= tokenExpiresAt.value);
const tokenExpiryText = computed(() => {
  if (!tokenExpiresAt.value) {
    return t('message.token-has-no-expiry');
  }
  return isTokenExpired.value
    ? t('message.token-expired-on', { date: tokenExpiryDate.value })
    : t('message.token-expires-on', { date: tokenExpiryDate.value });
});
</script>

<template>
  <div v-if="isLoading" class="bot-detail__loader">
    <Spin data-testid="bot-detail-loader" />
  </div>
  <div v-else-if="isError" class="bot-detail__placeholder-host">
    <NoDataPlaceholder test-id="no-data-placeholder">
      <template #title>
        <span data-testid="error-message">
          {{ t('message.no-entity-available-with-name', { entity: t('label.bot-plural') }) }}
          <span data-testid="username" class="bot-detail__username">{{ effectiveFqn }}</span>
        </span>
      </template>
    </NoDataPlaceholder>
  </div>
  <div v-else-if="!isAdminUser" class="bot-detail__placeholder-host">
    <PermissionPlaceholder
      test-id="permission-error-placeholder"
      :permission-value="t('label.view-entity', { entity: t('label.bot-detail') })"
    />
  </div>
  <PageLayout v-else :document-title="pageTitle" test-id="bot-detail-layout">
    <template #left>
      <div class="bot-detail__left">
        <Card>
          <div data-testid="left-panel">
            <!-- U-5: the official bot SVG illustration has no product
                 asset yet; an icon block holds the position. -->
            <div class="bot-detail__illustration" data-testid="bot-profile-illustration">
              <RobotOutlined />
            </div>
            <div class="bot-detail__display-name">
              <div v-if="isDisplayNameEdit" class="bot-detail__display-name-edit">
                <Input
                  id="displayName"
                  v-model:value="displayName"
                  name="displayName"
                  :placeholder="t('label.display-name')"
                  :aria-label="t('label.display-name')"
                  data-testid="displayName"
                />
                <Button
                  type="text"
                  size="small"
                  data-testid="cancel-displayName"
                  :aria-label="t('label.cancel')"
                  @mousedown="isDisplayNameEdit = false"
                >
                  <CloseOutlined />
                </Button>
                <Button
                  type="primary"
                  size="small"
                  data-testid="save-displayName"
                  :aria-label="t('label.save')"
                  @click="handleDisplayNameChange"
                >
                  <CheckOutlined />
                </Button>
              </div>
              <div v-else class="bot-detail__display-name-view">
                <h5 v-if="displayName">{{ displayName }}</h5>
                <span v-else class="bot-detail__display-name-empty">
                  {{ t('label.add-entity', { entity: t('label.display-name') }) }}
                </span>
                <Button
                  v-if="canEditDisplayName"
                  type="text"
                  size="small"
                  data-testid="edit-displayName"
                  :title="t('label.edit-entity', { entity: t('label.display-name') })"
                  :aria-label="t('label.edit-entity', { entity: t('label.display-name') })"
                  @click="isDisplayNameEdit = true"
                >
                  <EditOutlined />
                </Button>
              </div>
            </div>
            <div v-if="botUserData?.allowImpersonation" class="bot-detail__impersonation">
              <Tooltip :title="t('message.allow-impersonation-help')">
                <Tag color="blue" data-testid="impersonation-enabled-badge">
                  {{ t('label.impersonation-enabled') }}
                </Tag>
              </Tooltip>
            </div>
            <div data-testid="asset-description-container">
              <div class="bot-detail__description-header">
                <span>{{ t('label.description') }}</span>
                <Button
                  v-if="canEditDescription"
                  type="text"
                  size="small"
                  data-testid="edit-description"
                  :title="t('label.edit-entity', { entity: t('label.description') })"
                  :aria-label="t('label.edit-entity', { entity: t('label.description') })"
                  @click="openDescriptionEditor"
                >
                  <EditOutlined />
                </Button>
              </div>
              <SmMarkdown
                v-if="!isDescriptionContentEmpty(botData?.description)"
                :markdown="botData?.description ?? ''"
              />
              <span v-else class="bot-detail__no-description">
                {{ t('label.no-description') }}
              </span>
            </div>
          </div>
        </Card>
        <Card :title="t('label.role-plural')">
          <template #extra>
            <Button
              v-if="isAdminUser && !isRolesEdit"
              type="text"
              size="small"
              data-testid="edit-roles"
              :title="t('label.edit-entity', { entity: t('label.role-plural') })"
              :aria-label="t('label.edit-entity', { entity: t('label.role-plural') })"
              @click="isRolesEdit = true"
            >
              <EditOutlined />
            </Button>
          </template>
          <div v-if="isRolesEdit">
            <Select
              id="select-role"
              v-model:value="selectedRoles"
              mode="multiple"
              :options="roleOptions"
              :filter-option="() => true"
              :placeholder="`${t('label.role-plural')}...`"
              :aria-label="t('label.role-plural')"
              style="width: 100%"
              @search="debouncedFetchRoles"
            />
            <div class="bot-detail__roles-actions">
              <Button
                type="text"
                size="small"
                data-testid="cancel-roles"
                :aria-label="t('label.cancel')"
                @mousedown="isRolesEdit = false"
              >
                <CloseOutlined />
              </Button>
              <Button
                type="primary"
                size="small"
                data-testid="save-roles"
                :aria-label="t('label.save')"
                @click="handleRolesChange"
              >
                <CheckOutlined />
              </Button>
            </div>
          </div>
          <div v-else>
            <div v-if="botUserData?.isAdmin" class="bot-detail__role-row">
              <UserOutlined />
              <span>{{ TERM_ADMIN }}</span>
            </div>
            <div
              v-for="role in botUserData?.roles ?? []"
              :key="role.id ?? role.name"
              class="bot-detail__role-row"
            >
              <UserOutlined />
              <span class="bot-detail__role-name" :title="getEntityName(role)">
                {{ getEntityName(role) }}
              </span>
            </div>
            <span v-if="!botUserData?.isAdmin && !(botUserData?.roles ?? []).length">
              {{ t('message.no-roles-assigned') }}
            </span>
          </div>
        </Card>
        <Card :title="t('label.inherited-role-plural')">
          <span v-if="!(botUserData?.inheritedRoles ?? []).length">
            {{ t('message.no-inherited-roles-found') }}
          </span>
          <div
            v-for="role in botUserData?.inheritedRoles ?? []"
            :key="role.id ?? role.name"
            class="bot-detail__role-row"
          >
            <UserOutlined />
            <span class="bot-detail__role-name" :title="getEntityName(role)">
              {{ getEntityName(role) }}
            </span>
          </div>
        </Card>
        <Modal
          :open="isDescriptionEdit"
          :title="t('label.edit-description-for', { entityName: getEntityName(botData) })"
          :ok-text="t('label.save')"
          :cancel-text="t('label.cancel')"
          destroy-on-close
          @ok="saveDescription"
          @cancel="isDescriptionEdit = false"
        >
          <SmRichTextEditor
            :initial-value="botData?.description ?? ''"
            :place-holder="t('label.enter-entity', { entity: t('label.description') })"
            @text-change="descriptionDraft = $event"
          />
        </Modal>
      </div>
    </template>
    <template #right>
      <Card :title="t('label.token-security')" data-testid="right-panel">
        <p>{{ t('message.token-security-description', { brandName }) }}</p>
      </Card>
    </template>
    <div>
      <SmBreadcrumb :items="detailBreadcrumbs" />
      <Tooltip :title="disabled ? t('message.upgrade-to-use-feature') : undefined">
        <Card data-testid="center-panel">
          <!-- The official card renders the Loader until the first
               mechanism fetch completes; a disabled card never fetches
               and keeps the Loader (AccessTokenCard:323-364). -->
          <div v-if="cardLoading || !isDataLoaded">
            <Spin data-testid="token-card-loader" />
          </div>
          <div v-else-if="isAuthMechanismEdit">
            <Form layout="vertical">
              <Form.Item :label="t('label.auth-mechanism')">
                <Select
                  disabled
                  :value="'JWT'"
                  :options="[
                    { value: 'JWT', label: t('label.om-jwt-token', { brandName }) },
                  ]"
                  :placeholder="
                    t('label.select-field', { field: t('label.auth-mechanism') })
                  "
                  data-testid="auth-mechanism"
                  style="width: 100%"
                />
              </Form.Item>
              <Form.Item
                :label="t('label.token-expiration')"
                :validate-status="formError ? 'error' : undefined"
                :help="formError || undefined"
              >
                <Select
                  v-model:value="formExpiry"
                  :options="expiryOptions"
                  :placeholder="t('message.select-token-expiration')"
                  data-testid="token-expiry"
                  style="width: 100%"
                />
              </Form.Item>
            </Form>
            <div class="bot-detail__token-form-actions">
              <Button
                v-if="!isMechanismEmpty"
                data-testid="cancel-edit"
                @click="isAuthMechanismEdit = false"
              >
                {{ t('label.cancel') }}
              </Button>
              <Button
                type="primary"
                :loading="isUpdating"
                data-testid="save-edit"
                @click="handleTokenFormSave"
              >
                {{ t('label.generate') }}
              </Button>
            </div>
          </div>
          <div v-else>
            <div class="bot-detail__token-head">
              <span>{{ t('label.om-jwt-token', { brandName }) }}</span>
              <!-- Buttons are never disabled: the caller passes the
                   literal `hasPermission` (AccessTokenCard:312). -->
              <Button v-if="jwtToken" danger data-testid="revoke-button" @click="onRevokeClick">
                {{ t('label.revoke-token') }}
              </Button>
              <Button
                v-else
                type="primary"
                data-testid="auth-mechanism"
                @click="enterTokenForm"
              >
                {{ t('label.generate-new-token') }}
              </Button>
            </div>
            <Divider />
            <p>{{ t('message.jwt-token', { brandName }) }}</p>
            <div v-if="jwtToken">
              <div class="bot-detail__token-row">
                <Input.Password
                  :value="jwtToken"
                  readonly
                  :placeholder="t('label.generate-new-token-placeholder')"
                  :aria-label="t('label.token')"
                  data-testid="token"
                  autocomplete="off"
                />
                <Tooltip
                  :title="
                    copied ? t('message.copied-to-clipboard') : t('message.copy-to-clipboard')
                  "
                  placement="left"
                >
                  <Button
                    data-testid="copy-secret"
                    :aria-label="t('message.copy-to-clipboard')"
                    @click="onCopyToken"
                  >
                    <CopyOutlined />
                  </Button>
                </Tooltip>
              </div>
              <p data-testid="token-expiry" class="bot-detail__token-expiry">
                <WarningOutlined v-if="!tokenExpiresAt" />
                {{ tokenExpiryText }}
              </p>
            </div>
            <div v-else data-testid="no-token">{{ t('message.no-token-available') }}</div>
          </div>
        </Card>
      </Tooltip>
      <Modal
        :open="isModalOpen"
        :title="t('message.are-you-sure')"
        :ok-text="t('label.confirm')"
        :cancel-text="t('label.cancel')"
        :confirm-loading="isTokenRemoving"
        data-testid="revoke-token-modal"
        @ok="handleTokenRevoke"
        @cancel="isModalOpen = false"
      >
        <p>{{ t('message.are-you-sure-to-revoke-access') }}</p>
      </Modal>
    </div>
  </PageLayout>
</template>

<style scoped>
.bot-detail__loader {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.bot-detail__placeholder-host {
  position: relative;
  min-height: 240px;
  width: 100%;
  border-radius: 12px;
  background: var(--sm-bg-container);
}

.bot-detail__left {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.bot-detail__illustration {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
  font-size: 64px;
  color: var(--sm-text-secondary);
}

.bot-detail__display-name-edit,
.bot-detail__display-name-view {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bot-detail__display-name-empty,
.bot-detail__no-description {
  color: var(--sm-text-secondary);
}

.bot-detail__impersonation {
  margin: 8px 0;
}

.bot-detail__description-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bot-detail__role-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bot-detail__role-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bot-detail__roles-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.bot-detail__username {
  font-weight: 500;
}

.bot-detail__token-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bot-detail__token-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bot-detail__token-expiry {
  margin-top: 8px;
}

.bot-detail__token-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
