/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * The 9 classic tour steps, in official order, with the official
 * data-tour-step selectors. Route names are the product's equivalents:
 * my-data, search, services, glossary, ontology, data quality, marketplace,
 * context-center overview, context-center memories.
 */
export interface TourStep {
  key: string;
  routeName: string;
  stepKey: string;
}

export const TOUR_STEPS: TourStep[] = [
  { key: 'myData', routeName: 'home', stepKey: 'topics-to-catch-up-on' },
  { key: 'explore', routeName: 'search', stepKey: 'explore-search' },
  { key: 'services', routeName: 'ingestion-services', stepKey: 'services' },
  { key: 'glossary', routeName: 'governance-glossaries', stepKey: 'glossary' },
  { key: 'ontology', routeName: 'ontology-explorer', stepKey: 'ontology-studio' },
  { key: 'dataQuality', routeName: 'quality-test-cases', stepKey: 'data-quality-data-health' },
  { key: 'marketplace', routeName: 'marketplace-overview', stepKey: 'data-marketplace' },
  { key: 'contextCenter', routeName: 'context-center-overview', stepKey: 'context-center' },
  { key: 'memories', routeName: 'context-center-memories', stepKey: 'memories' },
];
