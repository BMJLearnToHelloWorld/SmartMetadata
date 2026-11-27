/**
 * Official incident severity option labels.
 * Live official ZH UI keeps English "Severity N"; "没有严重性" / "No Severity"
 * comes from i18n (official label.no-entity + label.severity).
 */
export const INCIDENT_SEVERITY_OPTIONS = [
  'Severity1',
  'Severity2',
  'Severity3',
  'Severity4',
  'Severity5',
] as const;

export function officialSeverityLabel(severity: string | undefined, noSeverityLabel: string): string {
  if (!severity) {
    return noSeverityLabel;
  }
  const level = severity.replace(/\D/g, '');
  return level ? `Severity ${level}` : severity;
}
