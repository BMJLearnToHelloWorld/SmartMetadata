/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { ComposerTranslation } from 'vue-i18n';

const STATUS_KEYS: Record<string, string> = {
  New: 'observability.incidents.statusNew',
  Ack: 'observability.incidents.statusAck',
  Resolved: 'observability.incidents.statusResolved',
};

export function incidentStatusLabel(t: ComposerTranslation, status?: string): string {
  if (!status) {
    return '—';
  }
  const key = STATUS_KEYS[status];
  return key ? String(t(key)) : status;
}
