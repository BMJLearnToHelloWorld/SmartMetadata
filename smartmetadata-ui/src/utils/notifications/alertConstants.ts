/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { SubscriptionCategory, SubscriptionType } from '@/types/quality';

/**
 * Alert constants, ported from pin constants/Alerts.constants.tsx and
 * components/observability/Alerts/AlertAiFormFields.constants.ts.
 * Tailwind class-name maps from the pin constants are deliberately not
 * ported: the Vue form renders with dev_ui tokens and antd components.
 */

/** DEFAULT_READ_TIMEOUT (Alerts.constants.tsx:80). */
export const DEFAULT_READ_TIMEOUT = 12;

/** ALERT_AI_DEFAULT_CONNECTION_TIMEOUT (AlertAiFormFields.constants.ts:16). */
export const ALERT_AI_DEFAULT_CONNECTION_TIMEOUT = 10;

/** ALERT_AI_DEFAULT_DOWNSTREAM_DEPTH (AlertAiFormFields.constants.ts:17). */
export const ALERT_AI_DEFAULT_DOWNSTREAM_DEPTH = 1;

/** Description textarea rows (AlertAiFormFields.constants.ts:18). */
export const ALERT_AI_DESCRIPTION_TEXT_AREA_ROWS = 5;

/** OAuth2 token URL placeholder (AlertAiFormFields.constants.ts:20-21). */
export const ALERT_AI_OAUTH_TOKEN_URL_PLACEHOLDER = 'https://auth.example.com/oauth/token';

/** PAGE_SIZE_LARGE (constants.ts:62): search page size for rule arguments. */
export const PAGE_SIZE_LARGE = 50;

/** NO_DATA_PLACEHOLDER (constants.ts:96). */
export const NO_DATA_PLACEHOLDER = '--';

/** Destination dropdown tabs (Alerts.constants.tsx:26-29). */
export const DESTINATION_DROPDOWN_TABS = { internal: 'internal', external: 'external' } as const;

/**
 * Internal destination categories: SubscriptionCategory minus External
 * (Alerts.constants.tsx:31-34). Option values are startCase(category),
 * which is the identity for these single-word values.
 */
export const INTERNAL_CATEGORY_OPTIONS: SubscriptionCategory[] = [
  'Admins',
  'Assignees',
  'Followers',
  'Mentions',
  'Owners',
  'Teams',
  'Users',
];

/**
 * External destination types: SubscriptionType minus ActivityFeed and
 * GovernanceWorkflowChangeEvent, in enum order
 * (Alerts.constants.tsx:46-52). Values are the wire strings.
 */
export const EXTERNAL_CATEGORY_OPTIONS: SubscriptionType[] = [
  'Email',
  'GChat',
  'MsTeams',
  'Slack',
  'Webhook',
];

/** EXTERNAL_DESTINATION_TYPES: the values of EXTERNAL_CATEGORY_OPTIONS. */
export const EXTERNAL_DESTINATION_TYPES: readonly SubscriptionType[] = EXTERNAL_CATEGORY_OPTIONS;

/**
 * Endpoint placeholders by destination type
 * (Alerts.constants.tsx:69-78). The Email placeholder carries a literal
 * return-arrow character, pin-verbatim.
 */
export const DESTINATION_TYPE_BASED_PLACEHOLDERS: Partial<Record<SubscriptionType, string>> = {
  Slack: 'https://hooks.slack.com/services/XXXXX/XXXXX/XXXXX',
  MsTeams: 'https://outlook.office.com/webhook/XXXXX/XXXXX/XXXXX',
  GChat: 'https://chat.googleapis.com/v1/spaces/XXXXX/messages?key=XXXXX',
  Webhook: 'https://example.com',
  Email: 'Add ↵ separated Email addresses',
};

/** DATA_CONTRACT_ALERT_FILTERS (Alerts.constants.tsx:82-87). */
export const DATA_CONTRACT_ALERT_FILTERS = [
  'filterByFqn',
  'filterByDomain',
  'filterByOwner',
  'filterByEntityName',
] as const;

/** DATA_CONTRACT_ALERT_ACTIONS (Alerts.constants.tsx:89-92). */
export const DATA_CONTRACT_ALERT_ACTIONS = [
  'GetDataContractStatusUpdates',
  'GetDataContractValidationFailures',
] as const;

/**
 * DATA_CONTRACT_STATUS_OPTIONS (Alerts.constants.tsx:94-99). Labels are
 * i18n keys resolved by the caller.
 */
export const DATA_CONTRACT_STATUS_OPTIONS = [
  { labelKey: 'label.success', value: 'Success' },
  { labelKey: 'label.failed', value: 'Failed' },
  { labelKey: 'label.running', value: 'Running' },
  { labelKey: 'label.aborted', value: 'Aborted' },
] as const;

/**
 * Empty-state features (ALERT_EMPTY_STATE_FEATURES, Alerts.constants.tsx:101-129).
 * Icon glyphs live with the rendering component (ant-design equivalents of
 * pin's ZapFast/MarkerPin01/Bell01); the Tailwind icon color classes have
 * no product equivalent and are not carried over.
 */
export const ALERT_EMPTY_STATE_FEATURES = [
  {
    key: 'trigger',
    titleKey: 'label.pick-a-trigger',
    descriptionKey: 'message.alert-pick-a-trigger-description',
  },
  {
    key: 'destination',
    titleKey: 'label.choose-the-destination',
    descriptionKey: 'message.alert-choose-destination-description',
  },
  {
    key: 'stay-ahead',
    titleKey: 'label.stay-ahead',
    descriptionKey: 'message.alert-stay-ahead-description',
  },
] as const;

/**
 * SEARCHABLE_ARGUMENTS (AlertAiFormFields.constants.ts:23-33): rule
 * arguments rendered as search autocompletes instead of text inputs.
 */
export const SEARCHABLE_ARGUMENTS = new Set([
  'domainList',
  'entityIdList',
  'entityNameList',
  'fqnList',
  'ownerNameList',
  'tableNameList',
  'testSuiteList',
  'updateByUserList',
  'userList',
]);

/** System alert name fetched by the A/C chains (ActivityFeedAlert). */
export const ACTIVITY_FEED_ALERT_NAME = 'ActivityFeedAlert';

/** Destinations min-count error path (DestinationFormItem.constants.ts). */
export const DESTINATIONS_MIN_COUNT_ERROR_PATH = 'root.destinations-required';
