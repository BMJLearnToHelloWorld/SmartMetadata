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
 * Single authenticated Socket.IO client (ported from official
 * `context/WebSocketProvider/WebSocketProvider.tsx` at pin a3012259ca,
 * per 02 §1 + t364 Q-01–Q-13).
 *
 * One Pinia store holds the single Socket instance for the logged-in
 * user and exposes it read-only; components consume it through
 * `useSocketChannel` and must never construct a socket themselves.
 *
 * Product gate (stricter than official's user-id-only gate): a
 * connection is built only when a non-empty session accessToken AND a
 * user id are both available. The token is re-read from storage before
 * every (re)connect and never cached; a rejected handshake triggers no
 * active session refresh — only a storage re-read (Q-05).
 *
 * Reconnection is driven here, not by the library (official
 * `driveReconnects`, :54-95): 3 attempts, `min(1000 * 2^attempts,
 * 5000)` backoff, budget reset on connect, no retry for
 * `io client disconnect` / `io server disconnect`.
 *
 * L2 cross-node gap (02 §4.1, source-proven, record only): broadcast
 * delivery is node-local in the current backend (`publishToAll` has no
 * production caller); this client does not and cannot fix that. The
 * nginx Upgrade configuration (P-DEP-1) is a deployment prerequisite,
 * not part of this module.
 */
import { io, type Socket } from 'socket.io-client';
import { defineStore } from 'pinia';
import { computed, shallowRef } from 'vue';
import { loadSession } from '@/auth/token';
import { apiBaseUrl } from '@/api/client';

export const SOCKET_RECONNECT_ATTEMPTS = 3;
export const SOCKET_RECONNECT_BASE_DELAY_MS = 1000;
export const SOCKET_RECONNECT_MAX_DELAY_MS = 5000;

export const NON_RETRIABLE_DISCONNECT_REASONS: ReadonlySet<string> = new Set([
  'io client disconnect',
  'io server disconnect',
]);

export interface SocketConnectionTarget {
  /** Origin to connect to; undefined means same-origin (no URL argument). */
  url?: string;
  /** Engine.IO path. */
  path: string;
}

/**
 * Path derivation (t364 Q-02): the API base's path prefix is kept and
 * `/v1/push/feed` appended; an absolute base also contributes its
 * origin. The REST URL is never used as a socket namespace.
 */
export function deriveSocketTarget(apiBase: string): SocketConnectionTarget {
  let origin: string | undefined;
  let prefix: string;
  if (/^https?:\/\//.test(apiBase)) {
    const parsed = new URL(apiBase);
    origin = parsed.origin;
    prefix = parsed.pathname;
  } else {
    prefix = apiBase;
  }
  const path = `${prefix.replace(/\/+$/, '')}/v1/push/feed`;
  return origin === undefined ? { path } : { url: origin, path };
}

function readAccessToken(): string | null {
  return loadSession(window.localStorage)?.accessToken ?? null;
}

export const useSocketStore = defineStore('socket', () => {
  const socketRef = shallowRef<Socket | null>(null);
  let currentUserId: string | undefined;
  let generation = 0;
  let reconnectAttempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function clearReconnectTimer(): void {
    if (reconnectTimer !== undefined) {
      clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
    }
  }

  function scheduleReconnect(socket: Socket, socketGeneration: number): void {
    if (
      disposed ||
      socketGeneration !== generation ||
      reconnectTimer !== undefined ||
      reconnectAttempts >= SOCKET_RECONNECT_ATTEMPTS
    ) {
      return;
    }
    const delay = Math.min(
      SOCKET_RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempts,
      SOCKET_RECONNECT_MAX_DELAY_MS,
    );
    reconnectAttempts += 1;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      if (disposed || socketGeneration !== generation) {
        return;
      }
      const freshToken = readAccessToken();
      if (!freshToken) {
        // Session gone mid-retry: stop and dispose the connection.
        disposeConnection();
        return;
      }
      socket.io.opts.query = { ...socket.io.opts.query, token: freshToken };
      socket.connect();
    }, delay);
  }

  function driveReconnects(socket: Socket, socketGeneration: number): void {
    socket.on('connect', () => {
      reconnectAttempts = 0;
    });
    socket.on('connect_error', () => {
      scheduleReconnect(socket, socketGeneration);
    });
    socket.on('disconnect', (reason: string) => {
      if (!NON_RETRIABLE_DISCONNECT_REASONS.has(reason)) {
        scheduleReconnect(socket, socketGeneration);
      }
    });
  }

  function disposeConnection(): void {
    generation += 1;
    disposed = true;
    clearReconnectTimer();
    reconnectAttempts = 0;
    currentUserId = undefined;
    const socket = socketRef.value;
    socketRef.value = null;
    socket?.disconnect();
  }

  /**
   * Build the single connection for `userId` when the gate passes
   * (non-empty accessToken + user id). Idempotent for the same user;
   * a user change disposes the old connection first. Wiring (auth
   * watcher / logout) lives outside this module — see the shared
   * contract note.
   */
  function ensureConnection(userId: string | undefined | null): Socket | null {
    const token = readAccessToken();
    if (!token || !userId) {
      if (socketRef.value) {
        disposeConnection();
      }
      return null;
    }
    if (socketRef.value && currentUserId === userId) {
      return socketRef.value;
    }
    if (socketRef.value) {
      disposeConnection();
    }
    disposed = false;
    generation += 1;
    const socketGeneration = generation;
    currentUserId = userId;
    reconnectAttempts = 0;

    const target = deriveSocketTarget(apiBaseUrl());
    const socket = (
      target.url === undefined
        ? io({ path: target.path, reconnection: false, query: { token, userId }, transports: ['websocket'] })
        : io(target.url, { path: target.path, reconnection: false, query: { token, userId }, transports: ['websocket'] })
    ) as Socket;
    // A superseding dispose/ensure between construction and publication
    // must not publish a dead socket over the working one.
    if (socketGeneration !== generation || disposed) {
      socket.disconnect();
      return socketRef.value;
    }
    driveReconnects(socket, socketGeneration);
    socketRef.value = socket;
    return socket;
  }

  return {
    /** Read-only current socket (exposed as a getter; watch `() => store.socket`). */
    socket: computed(() => socketRef.value),
    ensureConnection,
    disposeConnection,
  };
});
