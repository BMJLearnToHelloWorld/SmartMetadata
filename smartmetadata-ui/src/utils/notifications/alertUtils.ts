/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type {
  AlertFormDestination,
  AlertRecentEventFilter,
  ChangeEvent,
  DiagnosticItem,
  EventSubscriptionDiagnosticInfo,
  KeyValuePair,
  ModifiedWebhookConfig,
  TypedEvent,
} from '@/types/notifications';
import type {
  EventSubscriptionDestination,
  SubscriptionCategory,
  SubscriptionType,
  WebhookDestinationConfig,
} from '@/types/quality';
import { EXTERNAL_CATEGORY_OPTIONS } from './alertConstants';

/**
 * Pure alert helpers, ported from pin utils/Alerts/AlertsUtilPure.ts.
 * Pin's utils import the i18n `t` singleton; the port takes `t` as a
 * parameter so components pass vue-i18n's `t` and unit tests pass a fake.
 * formatDiagnosticValue is deliberately NOT ported: it serves only the
 * AI-mode diagnostic tab; the classic tab uses its own formatValue below.
 */

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

/**
 * lodash `startCase` for ASCII identifiers: word boundaries at
 * lower-to-upper transitions, at uppercase-run ends (GChat -> G Chat),
 * and at `_`/`-` separators; each word keeps the rest of its casing
 * (FOO_BAR -> FOO BAR). Matches the product's local copies in
 * stores/limitBanner.ts plus the uppercase-run rule lodash applies.
 */
export function startCase(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** getEntityName (EntityNameUtils.ts:27-32): displayName || name || ''. */
export function getEntityName(entity: { displayName?: string; name?: string } | undefined): string {
  return entity?.displayName || entity?.name || '';
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string' || Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length === 0;
  }
  return false;
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/** getConfigHeaderObjectFromArray (AlertsUtilPure.ts:129-141). */
export function getConfigHeaderObjectFromArray(
  headers?: KeyValuePair[],
): Record<string, string> | undefined {
  return headers?.reduce<Record<string, string>>(
    (prev, curr) => ({ ...prev, [curr.key]: curr.value }),
    {},
  );
}

/** getConfigHeaderArrayFromObject (AlertsUtilPure.ts:148-154). */
export function getConfigHeaderArrayFromObject(
  headers?: WebhookDestinationConfig['headers'],
): KeyValuePair[] | undefined {
  if (headers === undefined) {
    return headers;
  }
  // Pin keeps raw values; the form input needs strings, so values are
  // stringified (nullish renders empty, matching an empty input).
  return Object.entries(headers).map(([key, value]) => ({
    key,
    value: value === null || value === undefined ? '' : typeof value === 'string' ? value : String(value),
  }));
}

/** getConfigQueryParamsObjectFromArray (AlertsUtilPure.ts:159-171). */
export function getConfigQueryParamsObjectFromArray(
  queryParams?: KeyValuePair[],
): Record<string, string> | undefined {
  return queryParams?.reduce<Record<string, string>>(
    (prev, curr) => ({ ...prev, [curr.key]: curr.value }),
    {},
  );
}

/** getConfigQueryParamsArrayFromObject (AlertsUtilPure.ts:176-184). */
export function getConfigQueryParamsArrayFromObject(
  queryParams?: WebhookDestinationConfig['queryParams'],
): KeyValuePair[] | undefined {
  if (queryParams === undefined) {
    return queryParams;
  }
  return Object.entries(queryParams).map(([key, value]) => ({
    key,
    value: value === null || value === undefined ? '' : typeof value === 'string' ? value : String(value),
  }));
}

/**
 * getDestinationsWithTestStatus (AlertsUtilPure.ts:192-199): positional
 * pairing — the API returns one entry per requested destination, in
 * request order, with configs redacted, so configs come from the
 * submitted destinations and only statusDetails is taken from results.
 */
export function getDestinationsWithTestStatus<T extends EventSubscriptionDestination>(
  testedDestinations: T[],
  testResults: EventSubscriptionDestination[],
): T[] {
  return testedDestinations.map((destination, index) => ({
    ...destination,
    statusDetails: testResults[index]?.statusDetails,
  }));
}

/**
 * normalizeDestinationConfig (AlertsUtilPure.ts:204-222): API objects and
 * form arrays normalized to the same comparable shape; empty
 * headers/queryParams collapse to undefined.
 */
export function normalizeDestinationConfig(
  config?: WebhookDestinationConfig | ModifiedWebhookConfig,
): Record<string, unknown> {
  const headers = Array.isArray(config?.headers)
    ? config.headers
    : getConfigHeaderArrayFromObject(config?.headers as WebhookDestinationConfig['headers']);
  const queryParams = Array.isArray(config?.queryParams)
    ? config.queryParams
    : getConfigQueryParamsArrayFromObject(
        config?.queryParams as WebhookDestinationConfig['queryParams'],
      );
  return omitUndefined({
    ...config,
    headers: isEmptyValue(headers) ? undefined : headers,
    queryParams: isEmptyValue(queryParams) ? undefined : queryParams,
  });
}

/**
 * getFormattedDestinations (AlertsUtilPure.ts:224-253): drops the
 * form-only `destinationType`, object-ifies headers/queryParams, and
 * drops empty ones. Used by the destination Test flow.
 */
export function getFormattedDestinations(
  destinations?: AlertFormDestination[],
): EventSubscriptionDestination[] | undefined {
  return destinations?.map((destination) => {
    const { destinationType: _destinationType, config, ...otherData } = destination;
    const headers = getConfigHeaderObjectFromArray(config?.headers);
    const queryParams = getConfigQueryParamsObjectFromArray(config?.queryParams);
    return {
      ...otherData,
      config: omitUndefined({
        ...config,
        headers: isEmptyValue(headers) ? undefined : headers,
        queryParams: isEmptyValue(queryParams) ? undefined : queryParams,
      }) as WebhookDestinationConfig,
    };
  });
}

/** getFunctionDisplayName (AlertsUtilPure.ts:44-61). */
export function getFunctionDisplayName(func: string, t: TranslateFn): string {
  const displayNameByFunction: Record<string, string> = {
    matchAnyEntityFqn: t('label.fqn-uppercase'),
    matchAnyOwnerName: t('label.owner-plural'),
    matchAnyEventType: t('label.event-type'),
    matchTestResult: t('label.test-entity', { entity: t('label.result-plural') }),
    matchUpdatedBy: t('label.updated-by'),
    matchAnyFieldChange: t('label.field-change'),
    matchPipelineState: t('label.pipeline-state'),
    matchIngestionPipelineState: t('label.pipeline-state'),
    matchAnySource: t('label.source-match'),
    matchAnyEntityId: t('label.entity-id-match'),
  };
  return displayNameByFunction[func] ?? '';
}

/** getAlertActionTypeDisplayName (AlertsUtilPure.ts:63-82). */
export function getAlertActionTypeDisplayName(alertActionType: SubscriptionType, t: TranslateFn): string {
  switch (alertActionType) {
    case 'ActivityFeed':
      return t('label.activity-feed-plural');
    case 'Email':
      return t('label.email');
    case 'Webhook':
      return t('label.webhook');
    case 'Slack':
      return t('label.slack');
    case 'MsTeams':
      return t('label.ms-team-plural');
    case 'GChat':
      return t('label.g-chat');
    default:
      return '';
  }
}

/** getDisplayNameForEntities (AlertsUtilPure.ts:84-93). */
export function getDisplayNameForEntities(entity: string, t: TranslateFn): string {
  switch (entity) {
    case 'kpi':
      return t('label.kpi-uppercase');
    case 'mlmodel':
      return t('label.ml-model');
    default:
      return startCase(entity);
  }
}

/** getSelectOptionsFromEnum (AlertsUtilPure.ts:95-99), over value lists. */
export function getSelectOptionsFromEnum(values: string[]): Array<{ label: string; value: string }> {
  return values.map((value) => ({ label: startCase(value), value }));
}

/** getSelectOptionsFromValues (AlertsUtilPure.ts:102-106). */
export function getSelectOptionsFromValues(values: string[]): Array<{ label: string; value: string }> {
  return values.map((value) => ({ label: startCase(value), value }));
}

/**
 * getSubscriptionTypeOptions (AlertsUtilPure.ts:108-123): all options
 * except Email are disabled for Users/Followers/Admins destinations,
 * since there is no webhook subscription provision for users.
 */
export function getSubscriptionTypeOptions(destinationType: string): Array<{
  label: string;
  value: SubscriptionType;
  disabled: boolean;
}> {
  return EXTERNAL_CATEGORY_OPTIONS.map((value) => {
    const isEmailType = value === 'Email';
    const shouldDisable =
      destinationType === 'Users' || destinationType === 'Followers' || destinationType === 'Admins';
    return { label: startCase(value), value, disabled: !isEmailType && shouldDisable };
  });
}

/** getAlertEventsFilterLabels (AlertsUtilPure.ts:255-266). */
export function getAlertEventsFilterLabels(status: AlertRecentEventFilter, t: TranslateFn): string {
  switch (status) {
    case 'successful':
      return t('label.successful');
    case 'failed':
      return t('label.failed');
    case 'all':
      return t('label.all');
    default:
      return '';
  }
}

/** The eight displayable event-detail fields (AlertRecentEventsTab.interface). */
export interface AlertEventDetailsToDisplay {
  eventType?: string;
  entityId?: string;
  userName?: string;
  previousVersion?: number;
  currentVersion?: number;
  reason?: string;
  source?: string;
  failingSubscriptionId?: string;
}

/** getLabelsForEventDetails (AlertsUtilPure.ts:268-291). */
export function getLabelsForEventDetails(prop: keyof AlertEventDetailsToDisplay, t: TranslateFn): string {
  switch (prop) {
    case 'eventType':
      return t('label.event-type');
    case 'entityId':
      return t('label.entity-id', { entity: t('label.entity') });
    case 'userName':
      return t('label.user-name');
    case 'previousVersion':
      return t('label.previous-version');
    case 'currentVersion':
      return t('label.current-version');
    case 'reason':
      return t('label.reason');
    case 'source':
      return t('label.source');
    case 'failingSubscriptionId':
      return t('label.failing-subscription-id');
    default:
      return '';
  }
}

/**
 * getChangeEventDataFromTypedEvent (AlertsUtilPure.ts:293-350). Failed
 * events nest the change event inside the outer object; reason/source/
 * failingSubscriptionId always come from the outer object. The fallback
 * id embeds the status so a failed and a successful unreadable row
 * sharing a timestamp still get distinct keys.
 */
export function getChangeEventDataFromTypedEvent(typedEvent: TypedEvent): {
  changeEventData: ChangeEvent;
  changeEventDataToDisplay: AlertEventDetailsToDisplay;
} {
  const outer = typedEvent.data[0];
  if (!outer) {
    const fallbackId = `unreadable-${typedEvent.status}-${typedEvent.timestamp}`;
    return {
      changeEventData: { id: fallbackId, timestamp: typedEvent.timestamp },
      changeEventDataToDisplay: {
        eventType: undefined,
        entityId: undefined,
        userName: undefined,
        previousVersion: undefined,
        currentVersion: undefined,
        reason: undefined,
        source: undefined,
        failingSubscriptionId: undefined,
      },
    };
  }
  let changeEventData: ChangeEvent = outer;
  if (typedEvent.status === 'failed' && outer.changeEvent !== undefined) {
    changeEventData = outer.changeEvent;
  }
  const { eventType, entityId, userName, previousVersion, currentVersion } = changeEventData;
  const { reason, source, failingSubscriptionId } = outer;
  return {
    changeEventData,
    changeEventDataToDisplay: {
      reason,
      source,
      failingSubscriptionId,
      eventType,
      entityId,
      userName,
      previousVersion,
      currentVersion,
    },
  };
}

/** getDiagnosticItems (AlertsUtilPure.ts:352-385): fixed six-item order. */
export function getDiagnosticItems(
  diagnosticData: EventSubscriptionDiagnosticInfo | undefined,
  t: TranslateFn,
): DiagnosticItem[] {
  return [
    {
      key: t('label.latest-offset'),
      value: diagnosticData?.latestOffset,
      description: t('message.latest-offset-description'),
    },
    {
      key: t('label.current-offset'),
      value: diagnosticData?.currentOffset,
      description: t('message.current-offset-description'),
    },
    {
      key: t('label.starting-offset'),
      value: diagnosticData?.startingOffset,
      description: t('message.starting-offset-description'),
    },
    {
      key: t('label.successful-event-plural'),
      value: diagnosticData?.successfulEventsCount,
      description: t('message.successful-events-description'),
    },
    {
      key: t('label.failed-event-plural'),
      value: diagnosticData?.failedEventsCount,
      description: t('message.failed-events-description'),
    },
    {
      key: t('label.processed-all-event-plural'),
      value: diagnosticData?.hasProcessedAllEvents,
      description: t('message.processed-all-events-description'),
    },
  ];
}

/**
 * The diagnostic tab's own formatValue (AlertDiagnosticInfoTab.tsx:58-64):
 * booleans render as literal Yes/No, everything else via String(value) —
 * including String(undefined). NOT formatDiagnosticValue (AI tab only,
 * which renders `--` for unset values).
 */
export function formatDiagnosticTabValue(value: unknown, t: TranslateFn): string {
  if (typeof value === 'boolean') {
    return t(value ? 'label.yes' : 'label.no');
  }
  return String(value);
}

const RANDOM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * getRandomizedAlertName (AlertsUtilPure.ts:396-401): `OpenMetadata_alert_`
 * plus 9 random alphanumerics. Pin uses crypto-random-string; the port
 * draws from crypto.getRandomValues with rejection sampling (no new
 * dependency, no modulo bias). The prefix is pin's OPEN_METADATA constant
 * (ServiceType.constant.ts:32), capital O — the draft's lowercase
 * rendering is a transcription slip; the source wins.
 */
export function getRandomizedAlertName(): string {
  const bytes = new Uint8Array(16);
  const chars: string[] = [];
  while (chars.length < 9) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      // 62 * 4 = 248: reject the tail so every symbol is equally likely.
      if (byte < 248) {
        chars.push(RANDOM_ALPHABET[byte % 62]);
        if (chars.length === 9) {
          break;
        }
      }
    }
  }
  return `OpenMetadata_alert_${chars.join('')}`;
}

/** getMessageFromArgumentName (AlertsUtilPure.ts:403-431). */
export function getMessageFromArgumentName(argumentName: string, t: TranslateFn): string {
  const requiredList = (entity: string) =>
    t('message.field-text-is-required', { fieldText: t('label.entity-list', { entity }) });
  const namedEntity = (entity: string) => t('label.entity-name', { entity });
  const fieldTextEntityByArgument: Record<string, string> = {
    fqnList: t('label.fqn-uppercase'),
    domainList: t('label.domain'),
    tableNameList: namedEntity(t('label.table')),
    entityNameList: namedEntity(t('label.entity')),
    ownerNameList: namedEntity(t('label.owner-plural')),
    updateByUserList: namedEntity(t('label.user')),
    userList: namedEntity(t('label.user')),
    eventTypeList: namedEntity(t('label.event')),
    entityIdList: t('label.entity-id', { entity: t('label.data-asset') }),
    pipelineStateList: t('label.pipeline-state'),
    ingestionPipelineStateList: t('label.pipeline-state'),
    testStatusList: t('label.test-suite-status'),
    testResultList: t('label.test-case-result'),
    contractStatusList: t('label.data-contract-status'),
    testSuiteList: t('label.test-suite'),
  };
  const entity = fieldTextEntityByArgument[argumentName];
  return entity ? requiredList(entity) : '';
}

/**
 * formatEventCount (AlertsUtilPure.ts:437-440): `${count ?? 0}` with a
 * trailing `+` when the server evaluated only the first unread events.
 * Counts arrive as `unknown` (pin types them `any`); String() matches
 * pin's template interpolation for numbers and numeric strings.
 */
export function formatEventCount(count: unknown, isLowerBound?: boolean): string {
  return `${count ?? 0}${isLowerBound ? '+' : ''}`;
}

/** getAlertDestinationCategoryIcons keys: category/type -> icon name (ObservabilityUtils). */
export function isSubscriptionCategoryName(
  value: string,
): value is SubscriptionCategory {
  return (
    value === 'Admins' ||
    value === 'Assignees' ||
    value === 'External' ||
    value === 'Followers' ||
    value === 'Mentions' ||
    value === 'Owners' ||
    value === 'Teams' ||
    value === 'Users'
  );
}
