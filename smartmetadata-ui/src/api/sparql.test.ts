/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPARQL_QUERY,
  getAvailableSparqlInferences,
  getTermDisplayText,
  resolveSparqlInference,
} from './sparql';

describe('sparql helpers', () => {
  it('renders triple terms in N-Triples syntax', () => {
    expect(
      getTermDisplayText({
        type: 'triple',
        value: {
          subject: { type: 'uri', value: 'https://example.test/a' },
          predicate: { type: 'uri', value: 'https://example.test/p' },
          object: { type: 'literal', value: 'v', 'xml:lang': 'en' },
        },
      }),
    ).toBe('<<( <https://example.test/a> <https://example.test/p> "v"@en )>>');
    expect(getTermDisplayText({ type: 'bnode', value: 'b0' })).toBe('b0');
    expect(getTermDisplayText({ type: 'literal', value: 'x', datatype: 'http://www.w3.org/2001/XMLSchema#integer' })).toBe(
      'x',
    );
    expect(getTermDisplayText({ type: 'uri', value: 'https://example.test/a' })).toBe(
      'https://example.test/a',
    );
  });

  it('maps status levels to inference options, always including none', () => {
    expect(getAvailableSparqlInferences(['CUSTOM'])).toEqual(['none', 'custom']);
    expect(getAvailableSparqlInferences([])).toEqual(['none']);
    expect(getAvailableSparqlInferences()).toEqual(['none']);
  });

  it('falls back to none when the requested level is unavailable', () => {
    const available = getAvailableSparqlInferences(['RDFS']);
    expect(resolveSparqlInference('owl', available)).toBe('none');
    expect(resolveSparqlInference('rdfs', available)).toBe('rdfs');
    expect(resolveSparqlInference('custom', available)).toBe('none');
  });

  it('ships a default query with all nine prefixes', () => {
    expect(DEFAULT_SPARQL_QUERY).toContain('PREFIX om:');
    expect(DEFAULT_SPARQL_QUERY).toContain('SELECT ?s ?p ?o');
    expect(DEFAULT_SPARQL_QUERY).toContain('?s ?p ?o');
    expect(DEFAULT_SPARQL_QUERY).toContain('LIMIT 10');
  });
});
