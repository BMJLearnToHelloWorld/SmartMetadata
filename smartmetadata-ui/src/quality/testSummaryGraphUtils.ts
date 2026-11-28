/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 * Official TestSummaryGraphUtils parameter bounds + toFiniteNumber (subset).
 */
import type { TestCaseParameterValue } from '@/types/quality';

const MIN_ROWS_PER_DIMENSION_PARAM = 'minRowsPerDimension';
const EXPECTED_VALUE_PARAMETERS = new Set(['value', 'columnCount', 'missingCountValue']);
const MIN_BOUND_PARAMETER = /^min($|[A-Z])/;
const MAX_BOUND_PARAMETER = /^max($|[A-Z])/;
const NOT_BOUND_PARAMETERS = new Set([MIN_ROWS_PER_DIMENSION_PARAM]);

const isBound = (pattern: RegExp, name: string) =>
  pattern.test(name) && !NOT_BOUND_PARAMETERS.has(name);

export function toFiniteNumber(value?: string): number | undefined {
  if ((value ?? '').trim() === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface ParameterBounds {
  expected?: number;
  min?: number;
  max?: number;
  threshold?: number;
}

export function getParameterBounds(testCaseParameterValue: TestCaseParameterValue[]): ParameterBounds {
  const valuesOf = (matches: (name: string) => boolean) =>
    testCaseParameterValue.reduce<number[]>((values, parameter) => {
      const value = toFiniteNumber(parameter.value);
      if (matches(parameter.name ?? '') && value !== undefined) {
        values.push(value);
      }
      return values;
    }, []);

  const maxBounds = valuesOf((name) => isBound(MAX_BOUND_PARAMETER, name));
  const minBounds = valuesOf((name) => isBound(MIN_BOUND_PARAMETER, name));
  const [threshold] = valuesOf((name) => name === 'threshold');

  return {
    expected: valuesOf((name) => EXPECTED_VALUE_PARAMETERS.has(name))[0],
    max: maxBounds.length === 0 ? undefined : Math.max(...maxBounds),
    min: minBounds.length === 0 ? undefined : Math.min(...minBounds),
    threshold,
  };
}