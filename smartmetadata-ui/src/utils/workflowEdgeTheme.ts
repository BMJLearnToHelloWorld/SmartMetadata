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
 * Official WorkflowEdgeTheme (pin a3012259ca), ported as a mapping onto the
 * product's dev_ui tokens (src/styles/theme.css `--sm-color-*`). The official
 * theme keeps CSS variables intact so the canvas repaints when the root theme
 * changes; the product mapping does the same with `--sm-*` variables.
 */
export const WORKFLOW_EDGE_THEME = {
  customBackground: 'var(--sm-color-primary-bg)',
  customLabel: 'var(--sm-color-primary)',
  // Vue Flow embeds marker colors in SVG URL ids, so fallback delimiters
  // would make the generated marker reference browser-dependent.
  edge: 'var(--sm-border-color)',
  labelBorder: 'var(--sm-color-primary-bg)',
  negativeBackground: 'var(--sm-color-error-bg)',
  negativeLabel: 'var(--sm-color-error-text)',
  positiveBackground: 'var(--sm-color-success-bg)',
  positiveLabel: 'var(--sm-color-success-text)',
  warningBackground: 'var(--sm-color-warning-bg)',
  warningLabel: 'var(--sm-color-warning-text)',
} as const;

export function getWorkflowConditionTheme(condition: string): {
  backgroundColor: string;
  labelColor: string;
} {
  const normalizedCondition = condition.trim().toLowerCase();
  if (normalizedCondition === 'true' || normalizedCondition === 'approve') {
    return {
      backgroundColor: WORKFLOW_EDGE_THEME.positiveBackground,
      labelColor: WORKFLOW_EDGE_THEME.positiveLabel,
    };
  }
  if (normalizedCondition === 'reject') {
    return {
      backgroundColor: WORKFLOW_EDGE_THEME.negativeBackground,
      labelColor: WORKFLOW_EDGE_THEME.negativeLabel,
    };
  }
  if (normalizedCondition === 'false') {
    return {
      backgroundColor: WORKFLOW_EDGE_THEME.warningBackground,
      labelColor: WORKFLOW_EDGE_THEME.warningLabel,
    };
  }
  return {
    backgroundColor: WORKFLOW_EDGE_THEME.customBackground,
    labelColor: WORKFLOW_EDGE_THEME.customLabel,
  };
}
