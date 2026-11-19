/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { deleteEventSubscription } from '@/api/eventSubscriptions';
import { reportErrorToast, type AlertSearchHooks } from './alertSourceSearch';

/**
 * hardDeleteEntity (DeleteWidgetUtils.ts:35-70) for event
 * subscriptions: the A-group delete wire plus pin's toasts. Success
 * toasts `server.entity-deleted-successfully` with the entity name;
 * failure toasts the server text with the delete-entity-error
 * fallback, under showErrorToast's suppression — a forbidden DELETE
 * still toasts, since suppression covers forbidden reads only. The
 * non-200 branch has no Vue equivalent: the product client throws on
 * non-2xx, so resolution is success. Returns whether the delete
 * landed; callers close the confirmation either way.
 */
export async function hardDeleteAlert(
  entityName: string,
  entityId: string,
  hooks: AlertSearchHooks & { notifySuccess: (message: string) => void },
): Promise<boolean> {
  try {
    await deleteEventSubscription(entityId);
    hooks.notifySuccess(
      hooks.t('server.entity-deleted-successfully', { entity: entityName }),
    );
    return true;
  } catch (error) {
    reportErrorToast(error, hooks, {
      method: 'DELETE',
      fallbackMessage: hooks.t('server.delete-entity-error', { entity: entityName }),
    });
    return false;
  }
}
