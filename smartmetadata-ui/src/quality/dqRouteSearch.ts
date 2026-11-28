/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import type { LocationQuery, RouteLocationNormalizedLoaded } from 'vue-router';

/** Serialize vue-router query the way location.search is stored for tab memory. */
export function routeQueryToSearch(route: RouteLocationNormalizedLoaded): string {
  const keys = Object.keys(route.query).filter((key) => key !== 'tab');
  if (keys.length === 0) {
    return '';
  }
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = route.query[key];
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null) {
          params.append(key, String(item));
        }
      }
    } else {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

export function searchStringToQuery(search: string): LocationQuery {
  if (!search) {
    return {};
  }
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) {
    return {};
  }
  const params = new URLSearchParams(raw);
  const query: LocationQuery = {};
  for (const key of new Set([...params.keys()])) {
    const all = params.getAll(key);
    query[key] = all.length > 1 ? all : all[0] ?? undefined;
  }
  return query;
}

/** Pin getCurrentISODate: ISO local timestamp without offset suffix. */
export function getCurrentIsoDateLabel(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}