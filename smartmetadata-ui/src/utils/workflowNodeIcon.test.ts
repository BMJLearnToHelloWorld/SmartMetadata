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
import {
  SM_COLOR_CYAN_600,
  SM_COLOR_ERROR,
  SM_COLOR_FUCHSIA_600,
  SM_COLOR_PRIMARY,
  SM_COLOR_PURPLE_600,
  SM_COLOR_SUCCESS,
  SM_COLOR_WARNING,
} from '@/theme/tokens';
import {
  getWorkflowCanvasNodeIcon,
  getWorkflowNodeIcon,
} from './workflowNodeIcon';

/**
 * R-6: official's subtype→icon/color contract, rendered with the product's
 * ant-design glyphs and token colors. The mapping is the contract; only
 * the glyph source differs.
 */

describe('getWorkflowNodeIcon', () => {
  it.each([
    ['startEvent', PlayCircleOutlined, SM_COLOR_SUCCESS],
    ['endEvent', FlagOutlined, SM_COLOR_ERROR],
    ['setEntityAttributeTask', SettingOutlined, SM_COLOR_PRIMARY],
    ['setEntityCertificationTask', SettingOutlined, SM_COLOR_PRIMARY],
    ['checkEntityAttributesTask', CheckSquareOutlined, SM_COLOR_WARNING],
    ['checkChangeDescriptionTask', DiffOutlined, SM_COLOR_CYAN_600],
    ['userApprovalTask', CheckCircleOutlined, SM_COLOR_FUCHSIA_600],
    ['dataCompletenessTask', DashboardOutlined, SM_COLOR_SUCCESS],
    ['collectMetadataTask', DashboardOutlined, SM_COLOR_WARNING],
    ['rollbackEntityTask', UndoOutlined, SM_COLOR_ERROR],
    ['policyAgentTask', SafetyOutlined, SM_COLOR_PRIMARY],
    ['sinkTask', CloudSyncOutlined, SM_COLOR_PURPLE_600],
  ] as const)('maps %s to its glyph and color', (subType, icon, color) => {
    const mapped = getWorkflowNodeIcon(subType);
    expect(mapped.icon).toBe(icon);
    expect(mapped.color).toBe(color);
  });

  it('falls back to the star for unknown or missing subtypes', () => {
    expect(getWorkflowNodeIcon('notATask')).toEqual({
      icon: StarOutlined,
      color: SM_COLOR_PRIMARY,
    });
    expect(getWorkflowNodeIcon(undefined)).toEqual({
      icon: StarOutlined,
      color: SM_COLOR_PRIMARY,
    });
  });
});

describe('getWorkflowCanvasNodeIcon', () => {
  it('matches the full map for canvas subtypes', () => {
    expect(getWorkflowCanvasNodeIcon('userApprovalTask')).toEqual(
      getWorkflowNodeIcon('userApprovalTask'),
    );
    expect(getWorkflowCanvasNodeIcon('sinkTask')).toEqual(
      getWorkflowNodeIcon('sinkTask'),
    );
  });

  it('falls back to the star for the non-canvas certification task', () => {
    // Official's canvas map has no setEntityCertification entry.
    expect(getWorkflowCanvasNodeIcon('setEntityCertificationTask')).toEqual({
      icon: StarOutlined,
      color: SM_COLOR_PRIMARY,
    });
  });
});
