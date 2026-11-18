/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EventSubscriptionDestination } from '@/types/quality';
import { SUBSCRIPTION_CATEGORIES } from '@/types/quality';
import type { AlertFormDestination, ModifiedWebhookConfig } from '@/types/notifications';
import {
  EXTERNAL_CATEGORY_OPTIONS,
  EXTERNAL_DESTINATION_TYPES,
  INTERNAL_CATEGORY_OPTIONS,
} from './alertConstants';
import { normalizeDestinationConfig, startCase, type TranslateFn } from './alertUtils';

/**
 * Destination helpers, ported from pin utils/ObservabilityUtils.tsx,
 * DestinationFormItem.utils.ts, DestinationSelectItem.utils.ts and
 * DestinationConfigField.utils.ts. The grouped-option icons are
 * returned as the category/type value the component maps to its icon;
 * pin returns rendered JSX, which a pure module cannot.
 */

/** EMAIL_REG_EX (regex.constants.ts). */
export const EMAIL_REG_EX = /^\S+@\S+\.\S+$/;

/** isValidEmailAddress (DestinationConfigField.utils.ts:16). */
export const isValidEmailAddress = (email: string): boolean => EMAIL_REG_EX.test(email);

/**
 * checkIfDestinationIsInternal (ObservabilityUtils.tsx:58-62): true
 * for every subscription category — External included. Call sites
 * combine it with the destination type, so do not "fix" it.
 */
export const checkIfDestinationIsInternal = (destinationName: string): boolean =>
  (SUBSCRIPTION_CATEGORIES as readonly string[]).includes(destinationName);

/** getConfigFieldFromDestinationType (ObservabilityUtils.tsx:64-75). */
export const getConfigFieldFromDestinationType = (destinationType: string): string => {
  switch (destinationType) {
    case 'Admins':
      return 'sendToAdmins';
    case 'Owners':
      return 'sendToOwners';
    case 'Followers':
      return 'sendToFollowers';
    default:
      return '';
  }
};

export interface GroupedDestinationOption {
  id: string;
  label: string;
  /** The category/type value; the component maps it to its icon. Absent on header rows. */
  iconValue?: string;
  isDisabled?: boolean;
}

/**
 * buildGroupedOptions (DestinationSelectItem.utils.ts:27-57): the
 * recipients inside the platform the selected sources can reach, as
 * the server offers them, and the one this destination already has, so
 * an alert saved with another stays editable. Until the server has
 * answered, only that one. External options are never filtered.
 */
export const buildGroupedOptions = (
  internalLabel: string,
  externalLabel: string,
  offeredCategories: string[] = [],
  currentCategory?: string,
): GroupedDestinationOption[] => {
  const shown = new Set(offeredCategories);
  if (currentCategory) {
    shown.add(currentCategory);
  }
  const internalOptions = INTERNAL_CATEGORY_OPTIONS.filter((value) => shown.has(value));
  return [
    { id: 'header-internal', label: internalLabel, isDisabled: true },
    ...internalOptions.map((value) => ({
      id: value,
      label: startCase(value),
      iconValue: value,
    })),
    { id: 'header-external', label: externalLabel, isDisabled: true },
    ...EXTERNAL_CATEGORY_OPTIONS.map((value) => ({
      id: value,
      label: startCase(value),
      iconValue: value,
    })),
  ];
};

/** hasExternalDestination (DestinationFormItem.utils.ts:19-26). */
export const hasExternalDestination = (
  destinations: Array<Pick<EventSubscriptionDestination, 'category' | 'type'>>,
): boolean =>
  destinations.some(
    ({ category, type }) =>
      category === 'External' &&
      (EXTERNAL_DESTINATION_TYPES as readonly string[]).includes(type ?? ''),
  );

/** isTestableExternalDestination (DestinationFormItem.utils.ts:28-30): external with a non-empty config. */
export const isTestableExternalDestination = (
  destination: EventSubscriptionDestination,
): boolean =>
  destination.category === 'External' &&
  destination.config !== undefined &&
  Object.keys(destination.config).length > 0;

/** getTestableExternalDestinations (DestinationFormItem.utils.ts:32-34). */
export const getTestableExternalDestinations = (
  destinations: EventSubscriptionDestination[] = [],
): EventSubscriptionDestination[] => destinations.filter(isTestableExternalDestination);

/**
 * alignDestinationsWithTestStatus (DestinationFormItem.utils.ts:46-57):
 * re-aligns the per-tested-destination status list back to the form's
 * full destination row order, placing each tested row's result at its
 * original form index and `undefined` for non-tested rows, so each row
 * looks its own status up by form index instead of by value-equality,
 * which collapses duplicate destinations onto the first matching entry.
 */
export const alignDestinationsWithTestStatus = (
  formDestinations: EventSubscriptionDestination[] = [],
  testedDestinationsWithStatus: EventSubscriptionDestination[],
): (EventSubscriptionDestination | undefined)[] => {
  let testedIndex = 0;
  return formDestinations.map((destination) =>
    isTestableExternalDestination(destination)
      ? testedDestinationsWithStatus[testedIndex++]
      : undefined,
  );
};

/** getExpandedConfigKeys (DestinationConfigField.utils.ts:18-21). */
export const getExpandedConfigKeys = (
  isExpanded: boolean,
  advancedConfigId: string,
): Set<string> => (isExpanded ? new Set([advancedConfigId]) : new Set<string>());

/** Order-insensitive deep equality for JSON-shaped values (pin lodash isEqual). */
const deepEqualJson = (left: unknown, right: unknown): boolean => {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => deepEqualJson(item, right[index]))
    );
  }
  if (
    left !== null &&
    right !== null &&
    typeof left === 'object' &&
    typeof right === 'object'
  ) {
    const leftEntries = Object.entries(left as Record<string, unknown>);
    const rightRecord = right as Record<string, unknown>;
    return (
      leftEntries.length === Object.keys(rightRecord).length &&
      leftEntries.every(
        ([key, value]) => key in rightRecord && deepEqualJson(value, rightRecord[key]),
      )
    );
  }
  return false;
};

/**
 * The tested status for a destination row
 * (DestinationSelectItem.tsx:91-109): the status applies only while
 * the row still equals the tested destination — type, category and
 * normalized config — so editing a row after testing hides its stale
 * status instead of showing it against different values.
 */
export const getDestinationStatusDetails = (
  destination: Pick<AlertFormDestination, 'type' | 'category' | 'config'>,
  destinationsWithStatus: (EventSubscriptionDestination | undefined)[] | undefined,
  index: number,
): EventSubscriptionDestination['statusDetails'] => {
  const statusDestination = destinationsWithStatus?.[index];
  if (!statusDestination) {
    return undefined;
  }
  const matches = deepEqualJson(
    { type: destination.type, category: destination.category, config: normalizeDestinationConfig(destination.config as ModifiedWebhookConfig | undefined) },
    {
      type: statusDestination.type,
      category: statusDestination.category,
      config: normalizeDestinationConfig(statusDestination.config),
    },
  );
  return matches ? statusDestination.statusDetails : undefined;
};

/**
 * getDestinationStatusAlertData's label (AlertsUtil.tsx:352-356): any
 * status other than Success reads as Failed.
 */
export const getDestinationStatusLabel = (
  destinationStatus: string | undefined,
  t: TranslateFn,
): string =>
  destinationStatus === 'Success' ? t('label.success') : t('label.failed');
