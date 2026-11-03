/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { describe, expect, it } from 'vitest';
import { TOUR_STEPS } from './tourSteps';

describe('tourSteps', () => {
  it('has the 9 classic steps in official order with official selectors', () => {
    expect(TOUR_STEPS.map((step) => step.key)).toEqual([
      'myData',
      'explore',
      'services',
      'glossary',
      'ontology',
      'dataQuality',
      'marketplace',
      'contextCenter',
      'memories',
    ]);
    expect(TOUR_STEPS.map((step) => step.stepKey)).toEqual([
      'topics-to-catch-up-on',
      'explore-search',
      'services',
      'glossary',
      'ontology-studio',
      'data-quality-data-health',
      'data-marketplace',
      'context-center',
      'memories',
    ]);
  });

  it('maps every step to a product route name', () => {
    expect(TOUR_STEPS.map((step) => step.routeName)).toEqual([
      'home',
      'search',
      'ingestion-services',
      'governance-glossaries',
      'ontology-explorer',
      'quality-test-cases',
      'marketplace-overview',
      'context-center-overview',
      'context-center-memories',
    ]);
  });
});
