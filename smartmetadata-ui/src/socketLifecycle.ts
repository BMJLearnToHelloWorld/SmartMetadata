/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { watch } from 'vue';
import { useAuthStore } from '@/stores/auth';
import { useSocketStore } from '@/stores/socket';

/**
 * Socket lifecycle wiring (SHARED-CONTRACTS §6.1, integration line).
 *
 * One watcher on the authenticated user id re-runs the socket store's
 * gate on every auth change: a user id ensures the single connection,
 * a cleared user (logout, session loss, profile failure) disposes it
 * through the same gate — `ensureConnection` disposes when the gate
 * fails, so no separate logout hook is needed and no path can leave a
 * stale connection behind. The socket store never imports the auth
 * store; the user id travels as a parameter, per the contract.
 *
 * Installed once from main.ts, before the auth store hydrates, so the
 * first profile load already connects. The watcher is app-lifetime
 * (no owner component) and is never stopped.
 */
export function installSocketLifecycle(): void {
  const auth = useAuthStore();
  const sockets = useSocketStore();
  watch(
    () => auth.user?.id,
    (userId) => {
      sockets.ensureConnection(userId);
    },
    { immediate: true },
  );
}
