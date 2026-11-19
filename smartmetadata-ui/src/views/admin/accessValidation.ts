/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

/**
 * NAME_FIELD_REGISTER_RULES (pin constants/Form.constants.ts:40-44):
 * required, maxLength 128, ENTITY_NAME_REGEX (pin
 * constants/regex.constants.ts:31, verbatim; imported from the shared
 * utils/entityName module, the single source of truth).
 */
import { ENTITY_NAME_REGEX } from '@/utils/entityName';

export const ENTITY_NAME_MAX_LENGTH = 128;

type Translate = (key: string, params?: Record<string, unknown>) => string;

export function nameFieldRules(t: Translate, fieldLabel: string) {
  return [
    { required: true, message: t('label.field-required', { field: fieldLabel }) },
    {
      max: ENTITY_NAME_MAX_LENGTH,
      message: t('message.entity-size-in-between', {
        entity: fieldLabel,
        min: 1,
        max: ENTITY_NAME_MAX_LENGTH,
      }),
    },
    { pattern: ENTITY_NAME_REGEX, message: t('message.entity-name-validation') },
  ];
}
