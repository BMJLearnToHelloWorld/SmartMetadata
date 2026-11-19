/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import type { AnnouncementType } from './collaboration';
import type { EntityRef } from './api';
import type {
  AlertFilteringInput,
  AlertType,
  ArgumentsInput,
  Effect,
  EventSubscription,
  EventSubscriptionDestination,
  EventSubscriptionFilterRule,
  HttpMethod,
  InputType,
  PrefixCondition,
  ProviderType,
  SourceKind,
  SubscriptionCategory,
  SubscriptionType,
  WebhookAuthConfig,
  WebhookDestinationConfig,
} from './quality';

/**
 * 07-only types: alert capabilities, typed events, diagnostics, the alert
 * form state, and the announcement form state. Wire entity shapes live in
 * types/quality.ts (EventSubscription) and types/collaboration.ts
 * (Announcement); this module only adds what no other section consumes.
 * All shapes are ported from the pin generated types and the pin
 * AlertsClassBase interface, with anchors at each declaration.
 */

/** The two alert faces (D-N0). Both surfaces coexist; never merged. */
export type AlertFace = 'Notification' | 'Observability';

/** Detail tab route values (enums/Alerts.enum.ts: AlertDetailTabs). */
export const ALERT_DETAIL_TABS = ['configuration', 'recentEvents', 'diagnostic-info'] as const;
export type AlertDetailTab = (typeof ALERT_DETAIL_TABS)[number];
export const DEFAULT_ALERT_DETAIL_TAB: AlertDetailTab = 'configuration';

/** Recent-events filter values (enums/Alerts.enum.ts: AlertRecentEventFilters). */
export const ALERT_RECENT_EVENT_FILTERS = ['all', 'successful', 'failed'] as const;
export type AlertRecentEventFilter = (typeof ALERT_RECENT_EVENT_FILTERS)[number];

/** TypedEvent status (generated/events/api/typedEvent.ts:307-311). */
export type TypedEventStatus = 'failed' | 'successful' | 'unprocessed';

/** EventType wire values (generated/events/api/typedEvent.ts:281-302). */
export const EVENT_TYPES = [
  'entityCreated',
  'entityDeleted',
  'entityFieldsChanged',
  'entityLineageAdded',
  'entityLineageDeleted',
  'entityLineageUpdated',
  'entityNoChange',
  'entityRestored',
  'entitySoftDeleted',
  'entityUpdated',
  'logicalTestCaseAdded',
  'ontologyChangeSetApplied',
  'ontologyImported',
  'ontologyRelationshipTypeUpdated',
  'postCreated',
  'postUpdated',
  'threadCreated',
  'threadUpdated',
  'userLogin',
  'userLogout',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * ChangeEvent (generated/events/api/typedEvent.ts:43-128). `changeDescription`
 * and `entity` stay opaque: the Recent Events tab only stringifies the
 * change description into a read-only code editor, never reads its fields.
 * The failed-event nesting (changeEvent/failingSubscriptionId/reason/source)
 * is part of the same interface in pin.
 */
export interface ChangeEvent {
  changeDescription?: unknown;
  currentVersion?: number;
  domains?: string[];
  entity?: unknown;
  entityFullyQualifiedName?: string;
  entityId?: string;
  entityType?: string;
  eventType?: EventType | string;
  id?: string;
  impersonatedBy?: string;
  incrementalChangeDescription?: unknown;
  previousVersion?: number;
  recursive?: boolean;
  timestamp?: number;
  userName?: string;
  changeEvent?: ChangeEventClass;
  failingSubscriptionId?: string;
  reason?: string;
  source?: string;
}

/** Nested failed change event (typedEvent.ts:209-276). Pin requires the
 * identity fields; the port leaves them optional per the mapper convention
 * because the event-data reader accesses them defensively. */
export interface ChangeEventClass {
  changeDescription?: unknown;
  currentVersion?: number;
  domains?: string[];
  entity?: unknown;
  entityFullyQualifiedName?: string;
  entityId?: string;
  entityType?: string;
  eventType?: EventType | string;
  id?: string;
  impersonatedBy?: string;
  incrementalChangeDescription?: unknown;
  previousVersion?: number;
  recursive?: boolean;
  timestamp?: number;
  userName?: string;
}

/** TypedEvent (generated/events/api/typedEvent.ts:16-29). */
export interface TypedEvent {
  data: ChangeEvent[];
  status: TypedEventStatus;
  timestamp: number;
}

/**
 * EventsRecord (generated/events/api/eventsRecord.ts:17-40). Pin types the
 * counts `any`; the port types them `unknown` and formats them with
 * `String(count ?? 0)`, matching pin's `${count ?? 0}` interpolation.
 */
export interface EventsRecord {
  countsAreLowerBound?: boolean;
  failedEventsCount?: unknown;
  pendingEventsCount?: unknown;
  successfulEventsCount?: unknown;
  totalEventsCount?: unknown;
}

/** EventSubscriptionDiagnosticInfo (eventSubscriptionDiagnosticInfo.ts:17-64). */
export interface EventSubscriptionDiagnosticInfo {
  currentOffset?: unknown;
  failedEventsCount?: unknown;
  hasProcessedAllEvents?: boolean;
  latestOffset?: unknown;
  relevantUnprocessedEventsCount?: unknown;
  relevantUnprocessedEventsCountIsLowerBound?: boolean;
  relevantUnprocessedEventsList?: ChangeEvent[];
  startingOffset?: unknown;
  successfulEventsCount?: unknown;
  totalUnprocessedEventsCount?: unknown;
  totalUnprocessedEventsList?: ChangeEvent[];
}

/** AlertCapabilitiesRequest (alertCapabilitiesRequest.ts:17-28). */
export interface AlertCapabilitiesRequest {
  alertType: AlertType;
  input?: AlertFilteringInput;
  sources?: string[];
}

/** AlertCapabilities (alertCapabilities.ts:18-45). */
export interface AlertCapabilities {
  alertType: AlertType;
  containerEntities?: string[];
  eventTypes?: string[];
  filters: AlertConditionCapability[];
  recipientCategories?: SubscriptionCategory[];
  sources: AlertSourceCapability[];
  triggers: AlertConditionCapability[];
}

/** AlertConditionCapability (alertCapabilities.ts:61-68). */
export interface AlertConditionCapability {
  condition: EventSubscriptionFilterRule;
  sources: string[];
}

/** AlertSourceCapability (alertCapabilities.ts:143-161). */
export interface AlertSourceCapability {
  canJoin?: boolean;
  kind: SourceKind;
  name: string;
  reason?: string;
  selected?: boolean;
  warning?: string;
}

/** Key/value pair for the form's headers/queryParams arrays. */
export interface KeyValuePair {
  key: string;
  value: string;
}

/**
 * ModifiedWebhookConfig (AlertsClassBase.interface.ts:26-29): headers and
 * queryParams are key/value arrays in the form, objects on the wire.
 * Spelled out field by field instead of `Omit<WebhookDestinationConfig>`:
 * the wire interface carries a string index signature, and `Omit` over
 * it collapses `keyof` to `string`, dropping every named field from the
 * result (vue-tsc then reads `authType`/`receivers` as `{}`).
 */
export interface ModifiedWebhookConfig {
  authType?: WebhookAuthConfig;
  endpoint?: string;
  headers?: KeyValuePair[];
  httpMethod?: HttpMethod;
  queryParams?: KeyValuePair[];
  receivers?: string[];
  sendToAdmins?: boolean;
  sendToFollowers?: boolean;
  sendToOwners?: boolean;
  [key: string]: unknown;
}

/**
 * Form destination row. Pin's ModifiedDestination
 * (AlertsClassBase.interface.ts:31-34) requires destinationType/category/
 * type, but the form appends `{}` for a new row, so every field is optional
 * until the user selects; save validation (not the type) guarantees the
 * wire-required fields. `destinationType` exists only on the form row —
 * the wire Destination carries `category` + `type` instead.
 */
export interface AlertFormDestination {
  id?: string;
  destinationType?: SubscriptionType | SubscriptionCategory;
  category?: SubscriptionCategory;
  type?: SubscriptionType;
  config?: ModifiedWebhookConfig;
  channel?: string;
  downstreamDepth?: number | null;
  enabled?: boolean;
  notifyDownstream?: boolean;
  readTimeout?: number;
  statusDetails?: EventSubscriptionDestination['statusDetails'];
  timeout?: number;
}

/**
 * Alert form state: the pin ModifiedCreateEventSubscription shape
 * (AlertsClassBase.interface.ts:46-58) as the form actually holds it —
 * create-shaped (top-level `resources`, no filteringRules) plus the
 * UI-only timeout/readTimeout. `hasRulesWithoutSelections` is deliberately
 * NOT part of this state: pin computes it from the stored alert plus the
 * current input (AlertsClassBase.hasRulesWithoutSelections) and the form
 * receives it as a separate read-only flag. `alertType` keeps the full
 * pin union (a stored alert may be Custom); the face (Notification vs
 * Observability) comes from the route, and the capabilities hook maps
 * non-Notification to Observability exactly as pin's useAlertResources.
 */
export interface AlertFormValue {
  name?: string;
  displayName?: string;
  description?: string;
  resources?: string[];
  input?: AlertFilteringInput;
  destinations: AlertFormDestination[];
  /**
   * Optional while the form is being edited: clearing a timeout input
   * empties the field, and the controller validation — not the type —
   * is what rejects the empty value at save. Defaults refill both on
   * load, so a saved form always carries them.
   */
  timeout?: number;
  readTimeout?: number;
  alertType: AlertType;
  provider?: ProviderType;
  owners?: EntityRef[];
  notificationTemplate?: string | EntityRef;
}

/** The stored alert as the form/detail segments read it back. */
export type AlertFormInitialData = EventSubscription;

/**
 * What the capabilities answer supports for the current selection
 * (AlertSelectionUtil.getSelectionSupport): the form derives section
 * visibility, rule options, and destination categories from this alone.
 * supportedFilters/supportedTriggers carry the unwrapped rule conditions,
 * not the capability wrappers.
 */
export interface AlertSelectionSupport {
  supportedFilters?: EventSubscriptionFilterRule[];
  supportedTriggers?: EventSubscriptionFilterRule[];
  containerEntities?: string[];
  supportedEventTypes?: string[];
  /** Who inside the platform the alert can be sent to. Unknown until the server has answered. */
  recipientCategories?: SubscriptionCategory[];
  /** Whether the sources support any filter, and so whether the filters section is shown. */
  hasFilters?: boolean;
  /** Whether the sources support any trigger, and so whether the triggers section is shown. */
  hasTriggers?: boolean;
}

/** Rule-section field names (AlertAiFormFields.interface.ts). */
export type RuleSectionField = 'actions' | 'filters';

/** One diagnostic row (getDiagnosticItems fixed order, pin key/value/description). */
export interface DiagnosticItem {
  key: string;
  value: unknown;
  description: string;
}

/** Announcement form modes (SystemAnnouncementForm.types.ts). */
export type AnnouncementFormMode = 'create' | 'edit' | 'duplicate';

/**
 * Announcement form values (AnnouncementModal.interface.ts:
 * AnnouncementFormValues). Dates are epoch millis or null while unset;
 * the date field bridges calendar-day strings to these values.
 */
export interface AnnouncementFormValues {
  title: string;
  description: string;
  startTime: number | null;
  endTime: number | null;
  type: AnnouncementType;
  color?: string;
  customTypeName?: string;
}

/** Re-exported wire enums for 07 consumers that only import this module. */
export type {
  AlertFilteringInput,
  AlertType,
  ArgumentsInput,
  Effect,
  EventSubscription,
  EventSubscriptionDestination,
  EventSubscriptionFilterRule,
  InputType,
  PrefixCondition,
  ProviderType,
  SourceKind,
  SubscriptionCategory,
  SubscriptionType,
  WebhookAuthConfig,
  WebhookDestinationConfig,
};
