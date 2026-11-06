/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  CloudSyncOutlined,
  DashboardOutlined,
  DiffOutlined,
  FlagOutlined,
  PlayCircleOutlined,
  SafetyOutlined,
  SettingOutlined,
  StarOutlined,
  UndoOutlined,
} from '@ant-design/icons-vue';
import { markRaw, type Component } from 'vue';
import type { WorkflowNodeSubType } from '@/types/governance';
import {
  SM_COLOR_CYAN_600,
  SM_COLOR_ERROR,
  SM_COLOR_FUCHSIA_600,
  SM_COLOR_PRIMARY,
  SM_COLOR_PURPLE_600,
  SM_COLOR_SUCCESS,
  SM_COLOR_WARNING,
} from '@/theme/tokens';

/**
 * Official NodeIconUtils (pin a3012259ca), ported to the product's icon
 * set (R-6). Official ships its own SVG glyphs; the product's only icon
 * dependency is @ant-design/icons-vue, so each official icon maps to the
 * closest antd glyph and each official color maps to the matching product
 * token. The subtype→icon/color contract is unchanged; only the glyph
 * source differs.
 *
 * CANVAS map (used on the canvas): setEntityCertification is non-canvas
 * only in official, so it falls back to the star here, exactly as in
 * official's canvas map. The full map (used by the palette) includes it.
 */

export interface WorkflowNodeIcon {
  icon: Component;
  color: string;
}

const FULL_ICON_MAP: Record<string, WorkflowNodeIcon> = {
  startEvent: { icon: markRaw(PlayCircleOutlined), color: SM_COLOR_SUCCESS },
  endEvent: { icon: markRaw(FlagOutlined), color: SM_COLOR_ERROR },
  setEntityAttributeTask: {
    icon: markRaw(SettingOutlined),
    color: SM_COLOR_PRIMARY,
  },
  setEntityCertificationTask: {
    icon: markRaw(SettingOutlined),
    color: SM_COLOR_PRIMARY,
  },
  checkEntityAttributesTask: {
    icon: markRaw(CheckSquareOutlined),
    color: SM_COLOR_WARNING,
  },
  checkChangeDescriptionTask: {
    icon: markRaw(DiffOutlined),
    color: SM_COLOR_CYAN_600,
  },
  userApprovalTask: {
    icon: markRaw(CheckCircleOutlined),
    color: SM_COLOR_FUCHSIA_600,
  },
  dataCompletenessTask: {
    icon: markRaw(DashboardOutlined),
    color: SM_COLOR_SUCCESS,
  },
  collectMetadataTask: {
    icon: markRaw(DashboardOutlined),
    color: SM_COLOR_WARNING,
  },
  rollbackEntityTask: {
    icon: markRaw(UndoOutlined),
    color: SM_COLOR_ERROR,
  },
  policyAgentTask: {
    icon: markRaw(SafetyOutlined),
    color: SM_COLOR_PRIMARY,
  },
  sinkTask: {
    icon: markRaw(CloudSyncOutlined),
    color: SM_COLOR_PURPLE_600,
  },
};

const FALLBACK_ICON: WorkflowNodeIcon = {
  icon: markRaw(StarOutlined),
  color: SM_COLOR_PRIMARY,
};

export function getWorkflowNodeIcon(
  subType: WorkflowNodeSubType | string | undefined,
): WorkflowNodeIcon {
  if (!subType) {
    return FALLBACK_ICON;
  }
  return FULL_ICON_MAP[subType] ?? FALLBACK_ICON;
}

export function getWorkflowCanvasNodeIcon(
  subType: WorkflowNodeSubType | string | undefined,
): WorkflowNodeIcon {
  // The canvas map is the full map minus the non-canvas subtypes.
  if (subType === 'setEntityCertificationTask') {
    return FALLBACK_ICON;
  }
  return getWorkflowNodeIcon(subType);
}
