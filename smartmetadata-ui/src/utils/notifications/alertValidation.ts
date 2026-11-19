/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { AlertFormValue, RuleSectionField } from '@/types/notifications';
import type { AlertFormDestination } from '@/types/notifications';
import { ENTITY_NAME_REGEX } from '@/utils/entityName';
import { getMessageFromArgumentName, type TranslateFn } from './alertUtils';
import { getValidationPath, isInternalDestination, isWebhookDestination } from './alertFormUtils';

/**
 * Alert form validation, ported from pin
 * components/observability/Alerts/AlertAiFormFieldsValidationUtils.ts.
 * The form shows these errors only after the first submit attempt; the
 * validator itself always computes the full set. Keys are dot-joined
 * validation paths; the form looks its fields up by path.
 */

export type AlertFormValidationErrors = Record<string, string>;

export const ALERT_NAME_MAX_LENGTH = 128;

const isRequiredValueMissing = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  return value === null || value === undefined;
};

const getRequiredFieldMessage = (fieldText: string, t: TranslateFn) =>
  t('message.field-text-is-required', { fieldText });

// Mirrors NAME_FIELD_REGISTER_RULES (constants/Form.constants.ts)
// so this form accepts and rejects exactly the same names.
const setNameRuleError = (
  errors: AlertFormValidationErrors,
  name: string | undefined,
  t: TranslateFn,
): void => {
  if (errors.displayName || isRequiredValueMissing(name)) {
    return;
  }
  if ((name ?? '').length > ALERT_NAME_MAX_LENGTH) {
    errors.displayName = t('message.entity-size-in-between', {
      entity: t('label.name'),
      min: 1,
      max: ALERT_NAME_MAX_LENGTH,
    });
  } else if (!ENTITY_NAME_REGEX.test(name ?? '')) {
    errors.displayName = t('message.entity-name-validation');
  }
};

const setRequiredError = (args: {
  errors: AlertFormValidationErrors;
  fieldText: string;
  path: string;
  t: TranslateFn;
  value: unknown;
}): void => {
  if (isRequiredValueMissing(args.value)) {
    args.errors[args.path] = getRequiredFieldMessage(args.fieldText, args.t);
  }
};

const validateAlertRuleFields = (args: {
  errors: AlertFormValidationErrors;
  field: RuleSectionField;
  t: TranslateFn;
  value: AlertFormValue;
}): void => {
  const { errors, field, t, value } = args;
  const selectedRules = value.input?.[field] ?? [];
  const ruleLabel = field === 'filters' ? t('label.filter') : t('label.trigger');
  selectedRules.forEach((rule, ruleIndex) => {
    setRequiredError({
      errors,
      fieldText: ruleLabel,
      path: getValidationPath('input', field, ruleIndex, 'name'),
      t,
      value: rule.name,
    });
    rule.arguments?.forEach((argument, argumentIndex) => {
      const argumentPath = getValidationPath(
        'input',
        field,
        ruleIndex,
        'arguments',
        argumentIndex,
        'input',
      );
      // Rules shown from `filteringRules` carry no `input`: their values live in
      // the stored SpEL condition, and the form keeps them read-only.
      if (argument.input !== undefined && isRequiredValueMissing(argument.input)) {
        errors[argumentPath] = argument.name
          ? getMessageFromArgumentName(argument.name, t)
          : getRequiredFieldMessage(t('label.value'), t);
      }
    });
  });
};

const validateAlertDestinationConfig = (args: {
  destination: AlertFormDestination;
  errors: AlertFormValidationErrors;
  index: number;
  t: TranslateFn;
}): void => {
  const { destination, errors, index, t } = args;
  const destinationType = destination.destinationType;
  const configPath = (...path: (string | number)[]) =>
    getValidationPath('destinations', index, 'config', ...path);

  if (destinationType === 'Email') {
    setRequiredError({
      errors,
      fieldText: t('label.email'),
      path: configPath('receivers'),
      t,
      value: destination.config?.receivers,
    });
  }

  if (destinationType === 'Teams' || destinationType === 'Users') {
    setRequiredError({
      errors,
      fieldText: t('label.receiver-plural'),
      path: configPath('receivers'),
      t,
      value: destination.config?.receivers,
    });
  }

  if (!isWebhookDestination(destinationType)) {
    return;
  }

  setRequiredError({
    errors,
    fieldText: t('label.endpoint-url'),
    path: configPath('endpoint'),
    t,
    value: destination.config?.endpoint,
  });

  (['headers', 'queryParams'] as const).forEach((type) =>
    destination.config?.[type]?.forEach((entry, entryIndex) =>
      (['key', 'value'] as const).forEach((field) =>
        setRequiredError({
          errors,
          fieldText: t(`label.${field}`),
          path: configPath(type, entryIndex, field),
          t,
          value: entry[field],
        }),
      ),
    ),
  );

  const authType = destination.config?.authType?.type;

  if (authType === 'bearer') {
    setRequiredError({
      errors,
      fieldText: t('label.secret-key'),
      path: configPath('authType', 'secretKey'),
      t,
      value: destination.config?.authType?.secretKey,
    });
  }

  if (authType === 'oauth2') {
    setRequiredError({
      errors,
      fieldText: t('label.token-url'),
      path: configPath('authType', 'tokenUrl'),
      t,
      value: destination.config?.authType?.tokenUrl,
    });
    setRequiredError({
      errors,
      fieldText: t('label.client-id'),
      path: configPath('authType', 'clientId'),
      t,
      value: destination.config?.authType?.clientId,
    });
    setRequiredError({
      errors,
      fieldText: t('label.client-secret'),
      path: configPath('authType', 'clientSecret'),
      t,
      value: destination.config?.authType?.clientSecret,
    });
  }
};

export const validateAlertDestinationFields = (args: {
  errors: AlertFormValidationErrors;
  t: TranslateFn;
  value: Pick<AlertFormValue, 'destinations'>;
}): void => {
  const { errors, t, value } = args;
  setRequiredError({
    errors,
    fieldText: t('label.destination'),
    path: 'destinations',
    t,
    value: value.destinations,
  });

  value.destinations?.forEach((destination, index) => {
    setRequiredError({
      errors,
      fieldText: t('label.destination'),
      path: getValidationPath('destinations', index, 'destinationType'),
      t,
      value: destination.destinationType,
    });

    if (isInternalDestination(destination.destinationType)) {
      setRequiredError({
        errors,
        fieldText: t('label.type'),
        path: getValidationPath('destinations', index, 'type'),
        t,
        value: destination.type,
      });
    }

    if (destination.notifyDownstream && Number(destination.downstreamDepth) <= 0) {
      errors[getValidationPath('destinations', index, 'downstreamDepth')] = t(
        'message.value-must-be-greater-than',
        { field: t('label.downstream-depth'), minimum: 0 },
      );
    }

    validateAlertDestinationConfig({ destination, errors, index, t });
  });
};

/** Validates the alert form before passing data to the save hook. */
export const validateAlertAiForm = (
  value: AlertFormValue,
  t: TranslateFn,
): AlertFormValidationErrors => {
  const errors: AlertFormValidationErrors = {};

  setRequiredError({
    errors,
    fieldText: t('label.name'),
    path: 'displayName',
    t,
    value: value.displayName ?? value.name,
  });
  setNameRuleError(errors, value.displayName ?? value.name, t);

  setRequiredError({
    errors,
    fieldText: t('label.source'),
    path: 'resources',
    t,
    value: value.resources,
  });

  validateAlertRuleFields({ errors, field: 'filters', t, value });
  validateAlertRuleFields({ errors, field: 'actions', t, value });
  validateAlertDestinationFields({ errors, t, value });

  return errors;
};

/**
 * The field rules pin runs through RHF Controllers in addition to
 * validateAlertAiForm. The timeout fields
 * (DestinationFormItem.component.tsx:204-213, 252-261) require an
 * integer above zero; the downstream-depth field
 * (DestinationSelectItem.tsx:320-334) is required and must be above
 * zero whenever notify-downstream is on. The custom validator alone
 * lets an undefined depth pass (Number(undefined) is NaN), so the
 * depth-required check lives here; a non-finite depth fails the
 * Controller's validate even though the custom check passes it.
 */
export const validateAlertControllerFields = (
  value: AlertFormValue,
  t: TranslateFn,
): AlertFormValidationErrors => {
  const errors: AlertFormValidationErrors = {};

  const timeoutField = t('label.connection-timeout');
  if (value.timeout === undefined || value.timeout === null) {
    errors.timeout = t('label.field-required', { field: timeoutField });
  } else if (!(Number.isInteger(Number(value.timeout)) && Number(value.timeout) > 0)) {
    errors.timeout = t('label.field-invalid', { field: timeoutField });
  }

  const readTimeoutField = t('label.read-type', { type: t('label.timeout') });
  if (value.readTimeout === undefined || value.readTimeout === null) {
    errors.readTimeout = t('label.field-required', { field: readTimeoutField });
  } else if (
    !(Number.isInteger(Number(value.readTimeout)) && Number(value.readTimeout) > 0)
  ) {
    errors.readTimeout = t('label.field-invalid', { field: readTimeoutField });
  }

  value.destinations?.forEach((destination, index) => {
    if (!destination.notifyDownstream) {
      return;
    }
    const path = getValidationPath('destinations', index, 'downstreamDepth');
    if (destination.downstreamDepth === undefined || destination.downstreamDepth === null) {
      errors[path] = getRequiredFieldMessage(t('label.downstream-depth'), t);
    } else if (
      !Number.isFinite(Number(destination.downstreamDepth)) ||
      Number(destination.downstreamDepth) <= 0
    ) {
      errors[path] = t('message.value-must-be-greater-than', {
        field: t('label.downstream-depth'),
        minimum: 0,
      });
    }
  });

  return errors;
};

/** The full submit gate: the custom validator plus the Controller rules. */
export const validateAlertForm = (
  value: AlertFormValue,
  t: TranslateFn,
): AlertFormValidationErrors => ({
  ...validateAlertAiForm(value, t),
  ...validateAlertControllerFields(value, t),
});
