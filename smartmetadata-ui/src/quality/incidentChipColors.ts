/**
 * Official STATUS_COLORS / SEVERITY_COLORS (Color.constants.ts) for incident chips.
 * Hex stand-ins where design tokens are unavailable in the product shell.
 */
export interface IncidentChipPalette {
  bg: string;
  color: string;
  border: string;
}

export const INCIDENT_STATUS_CHIP_COLORS: Record<string, IncidentChipPalette> = {
  New: { bg: '#f4f3ff', color: '#5925dc', border: '#5925dc' },
  Ack: { bg: '#f0f9ff', color: '#026aa2', border: '#026aa2' },
  Assigned: { bg: '#fffaeb', color: '#b54708', border: '#b54708' },
  Resolved: { bg: '#ecfdf3', color: '#027a48', border: '#027a48' },
};

export const INCIDENT_SEVERITY_CHIP_COLORS: Record<string, IncidentChipPalette> = {
  Severity1: { bg: '#fef3f2', color: '#b42318', border: '#b42318' },
  Severity2: { bg: '#fff6ed', color: '#c4320a', border: '#c4320a' },
  Severity3: { bg: '#fffaeb', color: '#b54708', border: '#b54708' },
  Severity4: { bg: '#eff8ff', color: '#175cd3', border: '#175cd3' },
  Severity5: { bg: '#f9f5ff', color: '#6941c6', border: '#6941c6' },
  NoSeverity: { bg: '#f5f5f5', color: '#535862', border: '#535862' },
};