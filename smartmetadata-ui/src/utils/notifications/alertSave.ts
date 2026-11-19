/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { diffJsonPatch, type JsonPatchOp } from '@/admin/jsonPatch';
import { ApiError } from '@/api/client';
import type {
  AlertFilteringInput,
  AlertFormDestination,
  AlertFormValue,
  ArgumentsInput,
} from '@/types/notifications';
import type {
  CreateEventSubscriptionRequest,
  EventSubscription,
  EventSubscriptionDestination,
  EventSubscriptionFilterRule,
} from '@/types/quality';
import { DEFAULT_READ_TIMEOUT } from './alertConstants';
import {
  getConfigHeaderArrayFromObject,
  getConfigHeaderObjectFromArray,
  getConfigQueryParamsArrayFromObject,
  getConfigQueryParamsObjectFromArray,
  getEntityName,
  getRandomizedAlertName,
  type TranslateFn,
} from './alertUtils';

/**
 * Alert save/format logic, ported from pin utils/AlertsClassBase.ts,
 * utils/Alerts/ClassicAlertForm.utils.ts, and utils/formUtils.tsx
 * (handleEntityCreationError). The JSON Patch diff itself is reused
 * from admin/jsonPatch.ts (P-4); this module only owns the alert
 * semantics around it: the destinations whole-list replace, the
 * rules-without-selections input omission, and the save error mapping.
 */

const DESTINATIONS_PATH = '/destinations';

/**
 * Strip top-level undefined-valued keys (pin's omitBy(isUndefined)).
 * Pin strips the ORIGINAL side only before compare(); the port strips
 * BOTH sides: diffJsonPatch treats a present-but-undefined key in
 * `updated` as present, which would emit an invalid add-with-undefined
 * op. The observable behavior matches pin — a field undefined on both
 * sides emits no op, and a field defined on the original but undefined
 * on the new side emits `remove` either way.
 */
export function stripUndefinedTopLevel<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined)) as Partial<T>;
}

/**
 * destinationsAsAWholeListReplace (AlertsClassBase.ts:74-88): ops
 * touching `/destinations` are replaced by a single whole-list replace
 * op, appended last. A per-index diff pairs destinations wrongly after
 * a removal and leaks masked secrets under surviving ids.
 */
export function destinationsAsAWholeListReplace(
  jsonPatch: JsonPatchOp[],
  destinations: EventSubscriptionDestination[],
): JsonPatchOp[] {
  const touchesDestinations = (op: JsonPatchOp) => op.path.startsWith(DESTINATIONS_PATH);
  if (!jsonPatch.some(touchesDestinations)) {
    return jsonPatch;
  }
  return [
    ...jsonPatch.filter((op) => !touchesDestinations(op)),
    { op: 'replace', path: DESTINATIONS_PATH, value: destinations },
  ];
}

function hasSelections(input?: AlertFilteringInput): boolean {
  return (input?.filters?.length ?? 0) > 0 || (input?.actions?.length ?? 0) > 0;
}

/**
 * hasRulesWithoutSelections (AlertsClassBase.ts:132-137): rules stored
 * without the form selections that compile them. The form shows these
 * rules read-only and a save never sends `input`.
 */
export function hasRulesWithoutSelections(
  alert: Pick<EventSubscription, 'input' | 'filteringRules'>,
): boolean {
  return (
    !hasSelections(alert.input) &&
    ((alert.filteringRules?.rules?.length ?? 0) > 0 ||
      (alert.filteringRules?.actions?.length ?? 0) > 0)
  );
}

/** rulesToArgumentsInput (AlertsClassBase.ts:139-145): arguments collapse to `{name}`. */
function rulesToArgumentsInput(rules?: EventSubscriptionFilterRule[]): ArgumentsInput[] {
  return (rules ?? []).map((rule) => ({
    arguments: rule.arguments?.map((argumentName) => ({ name: argumentName })),
    effect: rule.effect,
    name: rule.name,
    prefixCondition: rule.prefixCondition,
  }));
}

/**
 * getAlertInputForForm (AlertsClassBase.ts:147-155): rules without
 * selections surface as a synthetic input built from the stored rules;
 * otherwise the stored input passes through untouched.
 */
export function getAlertInputForForm(alert: EventSubscription): AlertFilteringInput | undefined {
  return hasRulesWithoutSelections(alert)
    ? {
        filters: rulesToArgumentsInput(alert.filteringRules?.rules),
        actions: rulesToArgumentsInput(alert.filteringRules?.actions),
      }
    : alert.input;
}

/**
 * formatDestinations (AlertsClassBase.ts:188-216): each form row spreads
 * its id-matched stored destination, then overrides id/type/config/
 * category/timeout/readTimeout/notifyDownstream/downstreamDepth. The
 * form timeout/readTimeout apply to EVERY destination. Headers and
 * queryParams arrays become objects; config is always an object.
 */
export function formatDestinations(
  data: AlertFormValue,
  initialData?: EventSubscription,
): EventSubscriptionDestination[] {
  return data.destinations?.map((d) => {
    const initialDestination =
      d.id && initialData?.destinations?.find((dest) => dest.id === d.id);
    return {
      ...(initialDestination ?? {}),
      id: d.id,
      type: d.type,
      config: {
        ...d.config,
        headers: getConfigHeaderObjectFromArray(d.config?.headers),
        queryParams: getConfigQueryParamsObjectFromArray(d.config?.queryParams),
      },
      category: d.category,
      timeout: data.timeout,
      readTimeout: data.readTimeout,
      notifyDownstream: d.notifyDownstream,
      downstreamDepth: d.downstreamDepth,
    };
  });
}

/** getCommonAlertFieldsData (AlertsClassBase.ts:218-227). */
export function getCommonAlertFieldsData(
  data: AlertFormValue,
  initialData?: EventSubscription,
): {
  alertName: string;
  alertDisplayName: string;
  destinations: EventSubscriptionDestination[];
} {
  // The random name generates only when no initial name exists (?? is lazy).
  const alertName = (initialData?.name ?? getRandomizedAlertName()).trim();
  const alertDisplayName = getEntityName(data).trim();
  const destinations = formatDestinations(data, initialData);
  return { alertName, alertDisplayName, destinations };
}

/**
 * getAlertCreationData (AlertsClassBase.ts:229-256): the form spread
 * minus UI-only timeout/readTimeout, plus formatted destinations, the
 * resolved name/displayName, and owners=[current user] when a user id
 * is present. The cast mirrors pin's `finalData as CreateEventSubscription`
 * (the form's notificationTemplate may be a template-name string; OSS
 * never sets it).
 */
export function getAlertCreationData(
  data: AlertFormValue,
  initialData?: EventSubscription,
  currentUserId?: string,
): CreateEventSubscriptionRequest {
  const { alertName, alertDisplayName, destinations } = getCommonAlertFieldsData(data, initialData);
  const { timeout: _timeout, readTimeout: _readTimeout, ...finalData } = data;
  return {
    ...(finalData as unknown as CreateEventSubscriptionRequest),
    destinations,
    name: alertName,
    displayName: alertDisplayName,
    ...(currentUserId
      ? { owners: [{ id: currentUserId, type: 'user' }] }
      : {}),
  };
}

/**
 * getAlertUpdateData (AlertsClassBase.ts:258-286): the stored alert
 * spread, with description/displayName/name/owners/filteringRules
 * resources/destinations replaced. When the stored rules have no
 * selections, `input` is omitted from the object entirely, so the
 * patch carries no `/input` op and the stored rules survive.
 */
export function getAlertUpdateData(
  data: AlertFormValue,
  initialData: EventSubscription,
): EventSubscription {
  const { alertName, alertDisplayName, destinations } = getCommonAlertFieldsData(data, initialData);
  const { description, input, owners, resources } = data;
  return {
    ...initialData,
    description,
    displayName: alertDisplayName,
    name: alertName,
    ...(hasRulesWithoutSelections(initialData)
      ? {}
      : {
          input: {
            actions: input?.actions ?? [],
            filters: input?.filters ?? [],
          },
        }),
    owners,
    filteringRules: {
      ...initialData.filteringRules,
      resources: resources ?? [],
    },
    destinations: destinations ?? [],
  };
}

/** Inline alert details rendered above the form buttons (InlineAlertProps shape). */
export interface InlineAlertDetails {
  heading: string;
  description: string;
  subDescription: string;
}

/**
 * getErrorText (StringUtils.ts:233-254), over the product ApiError:
 * a string error is itself; otherwise the body's `message`, then
 * `responseMessage`, then a string body, then the fallback. A plain
 * Error with no response body yields the fallback, as in pin.
 */
export function getAlertErrorText(error: unknown, fallbackText: string): string {
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof ApiError) {
    const body = error.body;
    if (body) {
      try {
        const parsed: unknown = JSON.parse(body);
        if (parsed && typeof parsed === 'object') {
          const record = parsed as Record<string, unknown>;
          const message = record.message;
          if (typeof message === 'string' && message) {
            return message;
          }
          const responseMessage = record.responseMessage;
          if (typeof responseMessage === 'string' && responseMessage) {
            return responseMessage;
          }
        } else if (typeof parsed === 'string' && parsed) {
          return parsed;
        }
      } catch {
        return body;
      }
    }
  }
  return fallbackText;
}

/**
 * handleEntityCreationError (formUtils.tsx:33-85): 409 -> already-exists,
 * 429 -> limit-reached, else the create-error message when
 * defaultErrorType is 'create', else the server text. The subDescription
 * is always the server text (or the unexpected-error fallback).
 */
export function handleEntityCreationError(args: {
  error: unknown;
  setInlineAlertDetails: (details?: InlineAlertDetails) => void;
  entity: string;
  entityLowercase?: string;
  entityLowercasePlural?: string;
  name?: string;
  defaultErrorType?: 'create';
  t: TranslateFn;
}): void {
  const { error, setInlineAlertDetails, entity, entityLowercase, entityLowercasePlural, name, defaultErrorType, t } =
    args;
  const status = error instanceof ApiError ? error.status : undefined;
  const serverText = getAlertErrorText(error, t('server.unexpected-error'));
  const setInlineErrorValue = (description: string) => {
    setInlineAlertDetails({
      heading: t('label.error'),
      description,
      subDescription: serverText,
    });
  };
  if (status === 409) {
    setInlineErrorValue(
      t('server.entity-already-exist', {
        entity,
        entityPlural: entityLowercasePlural ?? entity,
        name,
      }),
    );
    return;
  }
  if (status === 429) {
    setInlineErrorValue(t('server.entity-limit-reached', { entity }));
    return;
  }
  setInlineErrorValue(
    defaultErrorType === 'create'
      ? t('server.entity-creation-error', { entity: entityLowercase ?? entity })
      : serverText,
  );
}

export interface HandleAlertSaveArgs {
  data: AlertFormValue;
  fqn?: string;
  initialData?: EventSubscription;
  createAlertAPI: (alert: CreateEventSubscriptionRequest) => Promise<EventSubscription>;
  updateAlertAPI: (id: string, data: JsonPatchOp[]) => Promise<EventSubscription>;
  afterSaveAction: (fqn: string) => Promise<void> | void;
  setInlineAlertDetails: (details?: InlineAlertDetails) => void;
  currentUserId?: string;
  t: TranslateFn;
  notifySuccess: (message: string) => void;
}

/**
 * handleAlertSave (AlertsClassBase.ts:288-341): update iff `fqn` and
 * `initialData` are both defined, else create. The update diffs the
 * stripped original against the new data, replaces destination ops with
 * the whole-list replace, and PATCHes by id. Success toasts with the
 * alert-plural entity; afterSaveAction receives the returned FQN, and
 * its failures land in the same catch as the save itself.
 */
export async function handleAlertSave(args: HandleAlertSaveArgs): Promise<void> {
  const {
    data,
    fqn,
    initialData,
    createAlertAPI,
    updateAlertAPI,
    afterSaveAction,
    setInlineAlertDetails,
    currentUserId,
    t,
    notifySuccess,
  } = args;
  try {
    let alertDetails: EventSubscription;
    const isUpdate = Boolean(fqn) && initialData !== undefined;
    if (isUpdate && initialData) {
      const newAlertData = getAlertUpdateData(data, initialData);
      const jsonPatch = destinationsAsAWholeListReplace(
        diffJsonPatch(
          stripUndefinedTopLevel(initialData as unknown as Record<string, unknown>),
          stripUndefinedTopLevel(newAlertData as unknown as Record<string, unknown>),
        ),
        newAlertData.destinations,
      );
      alertDetails = await updateAlertAPI(initialData.id ?? '', jsonPatch);
    } else {
      const finalData = getAlertCreationData(data, initialData, currentUserId);
      alertDetails = await createAlertAPI(finalData);
    }
    const action = isUpdate ? 'update' : 'create';
    notifySuccess(t(`server.${action}-entity-success`, { entity: t('label.alert-plural') }));
    await afterSaveAction(alertDetails.fullyQualifiedName ?? '');
  } catch (error) {
    handleEntityCreationError({
      error,
      entity: t('label.alert'),
      entityLowercase: t('label.alert-lowercase'),
      entityLowercasePlural: t('label.alert-lowercase-plural'),
      setInlineAlertDetails,
      name: data.name,
      defaultErrorType: 'create',
      t,
    });
  }
}

/**
 * The stored alert reshaped for the form/detail segments: pin's
 * ModifiedEventSubscription (AlertsClassBase.interface.ts:36-44).
 */
export interface ModifiedAlertData extends Omit<EventSubscription, 'destinations'> {
  destinations: AlertFormDestination[];
  timeout: number;
  readTimeout: number;
  /** Its rules were stored without form selections, so the form shows them read-only. */
  hasRulesWithoutSelections: boolean;
}

/**
 * getModifiedAlertDataForForm (AlertsClassBase.ts:343-374): the stored
 * alert spread, with the form input, the read-only flag, the UI-only
 * timeouts, and destinations reshaped (destinationType derived,
 * headers/queryParams object-to-array). There is deliberately NO
 * empty-destinations guard: `destinations[0]` is read directly, and the
 * throw lands in the form edit-fetch catch exactly as in pin. Do not
 * invent a guard here.
 */
export function getModifiedAlertDataForForm(alertData: EventSubscription): ModifiedAlertData {
  return {
    ...alertData,
    input: getAlertInputForForm(alertData),
    hasRulesWithoutSelections: hasRulesWithoutSelections(alertData),
    timeout: alertData.destinations[0].timeout ?? 10,
    readTimeout: alertData.destinations[0].readTimeout ?? DEFAULT_READ_TIMEOUT,
    destinations: alertData.destinations.map((destination) => {
      const isExternalDestination = destination.category === 'External';
      return {
        ...destination,
        destinationType: isExternalDestination ? destination.type : destination.category,
        config: {
          ...destination.config,
          headers: getConfigHeaderArrayFromObject(destination.config?.headers),
          queryParams: getConfigQueryParamsArrayFromObject(destination.config?.queryParams),
        },
      };
    }),
  };
}

/**
 * getClassicAlertInitialValues (ClassicAlertForm.utils.ts:21-36): the
 * form's initial values from the modified alert. displayName is
 * prefilled with displayName || name; resources come from the stored
 * filtering rules. A missing stored alertType defaults to Observability,
 * matching the capabilities hook's non-Notification mapping.
 */
export function getClassicAlertInitialValues(modified: ModifiedAlertData): AlertFormValue {
  return {
    name: modified.name,
    displayName: getEntityName(modified),
    description: modified.description,
    resources: modified.filteringRules?.resources ?? [],
    input: modified.input,
    destinations: modified.destinations,
    timeout: modified.timeout,
    readTimeout: modified.readTimeout,
    alertType: modified.alertType ?? 'Observability',
    provider: modified.provider,
    owners: modified.owners,
    notificationTemplate: modified.notificationTemplate,
  };
}
