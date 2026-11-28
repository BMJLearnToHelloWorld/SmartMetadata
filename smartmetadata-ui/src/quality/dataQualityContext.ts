/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { computed, inject, type ComputedRef, type InjectionKey } from 'vue';

/** Pin DataQualityProvider createActions (DataQualityPage.tsx). */
export interface DataQualityCreateActions {
  onAddTestCase: () => void;
  onAddBundleSuite: () => void;
  canCreateTestCase: boolean;
  canCreateBundleSuite: boolean;
}

export interface DataQualityContextValue {
  createActions?: DataQualityCreateActions;
  isActive: boolean;
}

export const dataQualityContextKey: InjectionKey<DataQualityContextValue> =
  Symbol('dataQualityContext');

const defaultContext = computed<DataQualityContextValue>(() => ({ isActive: true }));

export function useDataQualityContext(): DataQualityContextValue {
  const ctx = inject<ComputedRef<DataQualityContextValue>>(dataQualityContextKey, defaultContext);
  return ctx.value;
}