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
  ArgumentsInput,
  RuleSectionField,
} from '@/types/notifications';
import type {
  EventSubscriptionFilterRule,
  InputType,
  SubscriptionCategory,
  SubscriptionType,
} from '@/types/quality';
import { SUBSCRIPTION_CATEGORIES } from '@/types/quality';
import { ALERT_AI_DEFAULT_DOWNSTREAM_DEPTH, EXTERNAL_CATEGORY_OPTIONS } from './alertConstants';
import { getConfigFieldFromDestinationType } from './alertDestinations';
import type { TranslateFn } from './alertUtils';
import { officialConditionDisplayName } from '@/quality/alertCatalogDisplay';

/**
 * Form field helpers, ported from pin
 * components/observability/Alerts/AlertAiFormFieldsPureUtils.ts. Only
 * the functions the classic form chain uses are ported: the AI-form
 * section-visibility helpers and the React immutable-update machinery
 * (setValueAtPath/updateAlertAiValue) belong to the AI-mode parallel UI
 * or to React state, and have no place in the Vue form, which mutates
 * reactive state directly.
 */

/** isInternalDestination (AlertAiFormFieldsPureUtils.ts:44-49): a category other than External. */
export const isInternalDestination = (destinationType?: string): boolean =>
  Boolean(destinationType) &&
  (SUBSCRIPTION_CATEGORIES as readonly string[]).includes(destinationType as string) &&
  destinationType !== 'External';

export type WebhookDestinationType = 'Slack' | 'MsTeams' | 'GChat' | 'Webhook';

/** isWebhookDestination (AlertAiFormFieldsPureUtils.ts:52-58). */
export const isWebhookDestination = (
  destinationType?: string,
): destinationType is WebhookDestinationType =>
  destinationType === 'Slack' ||
  destinationType === 'MsTeams' ||
  destinationType === 'GChat' ||
  destinationType === 'Webhook';

/** getStringArrayValue (AlertAiFormFieldsPureUtils.ts:61-67). */
export const getStringArrayValue = (value?: string | string[]): string[] => {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
};

/** getCommaSeparatedStringArray (AlertAiFormFieldsPureUtils.ts:70-74). */
export const getCommaSeparatedStringArray = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

/** getArgumentPath (AlertAiFormFieldsPureUtils.ts:77-82). */
export const getArgumentPath = (
  field: RuleSectionField,
  name: number,
  index: number,
  key: 'input' | 'name',
): (string | number)[] => ['input', field, name, 'arguments', index, key];

/** getValidationPath (AlertAiFormFieldsPureUtils.ts:85-86). */
export const getValidationPath = (...path: (string | number)[]): string => path.join('.');

/** getCommaSeparatedValues (AlertAiFormFieldsPureUtils.ts:89-90). */
export const getCommaSeparatedValues = (value?: string | string[]): string =>
  Array.isArray(value) ? value.join(', ') : value ?? '';

/** getListValue (AlertAiFormFieldsPureUtils.ts:93-94). */
export const getListValue = (value?: string | string[]): string[] => getStringArrayValue(value);

/** getTextArgumentCopy (AlertAiFormFieldsPureUtils.ts:258-319). */
export const getTextArgumentCopy = (
  argument: string,
  t: TranslateFn,
): { label: string; placeholder: string } => {
  switch (argument) {
    case 'domainList':
      return {
        label: t('label.domain'),
        placeholder: t('label.search-by-type', { type: t('label.domain-lowercase') }),
      };
    case 'fqnList':
      return {
        label: t('label.fqn-uppercase'),
        placeholder: t('label.search-by-type', { type: t('label.fqn-uppercase') }),
      };
    case 'tableNameList':
      return {
        label: t('label.table'),
        placeholder: t('label.search-by-type', { type: t('label.table-lowercase') }),
      };
    case 'ownerNameList':
      return {
        label: t('label.owner'),
        placeholder: t('label.search-by-type', { type: t('label.owner-lowercase-plural') }),
      };
    case 'updateByUserList':
    case 'userList':
      return {
        label: t('label.user'),
        placeholder: t('label.search-by-type', { type: t('label.user') }),
      };
    case 'entityIdList':
      return {
        label: t('label.entity-id', { entity: t('label.data-asset') }),
        placeholder: t('label.search-by-type', {
          type: t('label.entity-id', { entity: t('label.data-asset') }),
        }),
      };
    case 'testSuiteList':
      return {
        label: t('label.test-suite'),
        placeholder: t('label.search-by-type', { type: t('label.test-suite') }),
      };
    case 'entityNameList':
    default:
      return {
        label: t('label.entity'),
        placeholder: t('label.search-by-type', { type: t('label.entity-lowercase') }),
      };
  }
};

export interface RuleItem {
  id: string;
  isDisabled: boolean;
  label: string;
}

/**
 * getRuleItems (AlertAiFormFieldsPureUtils.ts:345-369): rules on offer,
 * with the already-chosen ones disabled, plus any saved rule the
 * sources no longer offer, listed by name and disabled, so the dropdown
 * never shows it blank.
 */
export const getRuleItems = (
  supportedRules: EventSubscriptionFilterRule[] | undefined,
  selectedRules: ArgumentsInput[],
): RuleItem[] => {
  const offered = (supportedRules ?? [])
    .filter((rule): rule is EventSubscriptionFilterRule & { name: string } => Boolean(rule.name))
    .map((rule) => ({
      id: rule.name,
      isDisabled: selectedRules.some((selectedRule) => selectedRule.name === rule.name),
      label: officialConditionDisplayName(rule.name, rule.displayName),
    }));
  const seen = new Set<string>();
  const unknown: RuleItem[] = [];
  for (const rule of selectedRules) {
    if (rule.name && !offered.some((item) => item.id === rule.name) && !seen.has(rule.name)) {
      seen.add(rule.name);
      unknown.push({ id: rule.name, isDisabled: true, label: officialConditionDisplayName(rule.name) });
    }
  }
  return [...offered, ...unknown];
};

/** getRuleCopy (AlertAiFormFieldsPureUtils.ts:372-383). */
export const getRuleCopy = (
  field: RuleSectionField,
  t: TranslateFn,
): { description: string; label: string; placeholder: string } => {
  const label = field === 'filters' ? t('label.filter') : t('label.trigger');
  return {
    description:
      field === 'filters'
        ? t('message.alerts-filter-description')
        : t('message.alerts-trigger-description'),
    label,
    placeholder: t('label.select-field', { field: label }),
  };
};

/**
 * getRuntimeArguments (AlertAiFormFieldsPureUtils.ts:386-399): a rule
 * whose descriptor asks for runtime input renders the descriptor's
 * arguments; any other rule renders the argument names it already
 * holds.
 */
export const getRuntimeArguments = (
  selectedRule: ArgumentsInput | undefined,
  supportedRules: EventSubscriptionFilterRule[] | undefined,
): string[] => {
  const selectedRuleConfig = supportedRules?.find((rule) => rule.name === selectedRule?.name);
  return selectedRuleConfig?.inputType === ('runtime' satisfies InputType)
    ? selectedRuleConfig.arguments ?? []
    : selectedRule?.arguments
        ?.map((argument) => argument.name)
        .filter((argument): argument is string => Boolean(argument)) ?? [];
};

/** getRulesWithName (AlertAiFormFieldsPureUtils.ts:402-423): rename a rule, reset its argument skeleton. */
export const getRulesWithName = (args: {
  index: number;
  ruleName: string;
  selectedRules: ArgumentsInput[];
  supportedRules?: EventSubscriptionFilterRule[];
}): ArgumentsInput[] => {
  const { index, ruleName, selectedRules, supportedRules } = args;
  const nextRules = [...selectedRules];
  nextRules[index] = {
    ...nextRules[index],
    arguments: supportedRules
      ?.find((rule) => rule.name === ruleName)
      ?.arguments?.map((argument) => ({ input: [], name: argument })),
    name: ruleName,
  };
  return nextRules;
};

/** getRulesWithEffect (AlertAiFormFieldsPureUtils.ts:426-438). */
export const getRulesWithEffect = (
  selectedRules: ArgumentsInput[],
  index: number,
  isIncluded: boolean,
): ArgumentsInput[] => {
  const nextRules = [...selectedRules];
  nextRules[index] = {
    ...nextRules[index],
    effect: isIncluded ? 'include' : 'exclude',
  };
  return nextRules;
};

/** getRulesWithAddedRule (AlertAiFormFieldsPureUtils.ts:441-444). */
export const getRulesWithAddedRule = (selectedRules: ArgumentsInput[]): ArgumentsInput[] => [
  ...selectedRules,
  { effect: 'include' },
];

/** getRulesWithoutIndex (AlertAiFormFieldsPureUtils.ts:447-450). */
export const getRulesWithoutIndex = (
  selectedRules: ArgumentsInput[],
  index: number,
): ArgumentsInput[] => selectedRules.filter((_, ruleIndex) => ruleIndex !== index);

/** hasExternalDestinationConfig (AlertAiFormFieldsPureUtils.ts:453-460). */
export const hasExternalDestinationConfig = (
  destinations: AlertFormDestination[],
): boolean =>
  destinations.some(
    (destination) =>
      destination.category === 'External' &&
      EXTERNAL_CATEGORY_OPTIONS.some((item) => item === destination.type),
  );

/**
 * getDestinationTypeUpdate (AlertAiFormFieldsPureUtils.ts:463-493):
 * choosing another destination type restarts the row — category, type,
 * config and downstream settings are all replaced, nothing carries
 * over. A header row leaves the destination untouched.
 */
export const getDestinationTypeUpdate = (
  destination: AlertFormDestination,
  nextDestinationType: string,
): AlertFormDestination => {
  if (nextDestinationType.startsWith('header-')) {
    return destination;
  }
  const isInternalDestinationType = isInternalDestination(nextDestinationType);
  const configField = getConfigFieldFromDestinationType(nextDestinationType);
  return {
    category: isInternalDestinationType
      ? (nextDestinationType as SubscriptionCategory)
      : 'External',
    destinationType: nextDestinationType as SubscriptionCategory | SubscriptionType,
    config: configField ? { [configField]: true } : undefined,
    downstreamDepth: undefined,
    notifyDownstream: undefined,
    type: isInternalDestinationType ? undefined : (nextDestinationType as SubscriptionType),
  };
};

/** getDestinationWithNotifyDownstream (AlertAiFormFieldsPureUtils.ts:496-505). */
export const getDestinationWithNotifyDownstream = (
  destination: AlertFormDestination,
  notifyDownstream: boolean,
): AlertFormDestination => ({
  ...destination,
  downstreamDepth: notifyDownstream
    ? destination?.downstreamDepth ?? ALERT_AI_DEFAULT_DOWNSTREAM_DEPTH
    : undefined,
  notifyDownstream,
});
