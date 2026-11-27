import { describe, expect, it } from 'vitest';
import { INCIDENT_SEVERITY_OPTIONS, officialSeverityLabel } from './incidentSeverity';

describe('officialSeverityLabel', () => {
  it('renders official live labels: 没有严重性 and English Severity N', () => {
    expect(officialSeverityLabel(undefined, '没有严重性')).toBe('没有严重性');
    expect(officialSeverityLabel('Severity1', '没有严重性')).toBe('Severity 1');
    expect(officialSeverityLabel('Severity5', 'No Severity')).toBe('Severity 5');
    expect(INCIDENT_SEVERITY_OPTIONS).toEqual([
      'Severity1',
      'Severity2',
      'Severity3',
      'Severity4',
      'Severity5',
    ]);
  });
});
