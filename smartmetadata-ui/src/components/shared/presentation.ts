/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Shared presentation sizes, as data tables — never per-call-site
 * if/else chains. Every value below is an observed official width from
 * the reference snapshot, with its source file in the comment; values
 * the snapshot does not contain are absent from this table by design
 * (they are residuals, not invented defaults).
 */
export const MODAL_SIZES = {
  /** Confirm / delete dialogs. LineageNodeDeleteModal.tsx:61, LineageOverlays.tsx:184 (width 400). */
  confirm: 400,
  /** Standard forms. LineageConfigModal.tsx:67, AddPipeLineModal.tsx:148 (width 520). */
  form: 520,
  /** Export dialogs. EntityExportModal.component.tsx:165 (width 480). */
  export: 480,
  /**
   * Delete-confirmation dialogs. GlossaryTermRelationSettings.tsx:430
   * and IntakeFormsPage.tsx:289 (Dialog width 480). A separate entry
   * from `export`: same width, different official surface.
   */
  deleteDialog: 480,
  /** Wide forms. EditCustomPropertyModal.tsx:27,55 (MODAL_WIDTH = 720). */
  wide: 720,
  /** Extra-wide dialogs. AdvanceSearchModal.component.tsx:52 (Dialog width 1080). */
  xl: 1080,
} as const;

export type ModalSizeKey = keyof typeof MODAL_SIZES;

export const DRAWER_WIDTHS = {
  /**
   * Feed / activity panels. ActivityFeedDrawer.tsx + Feeds.constants.ts:107
   * (FEED_DRAWER_WIDTH = 'max(40vw, 480px)').
   */
  feed: 'max(40vw, 480px)',
  /**
   * Form panels. AddCustomProperty.tsx:253-259 (SlideoutMenu width 700
   * when no side panel is shown).
   */
  form: 700,
  /**
   * Relation-type form panel. GlossaryTermRelationSettings.tsx:368
   * (SlideoutMenu width 500).
   */
  relationTypeForm: 500,
  /**
   * Workflow creation panel. WorkflowsPage.tsx:438 (SlideoutMenu
   * width 640).
   */
  workflowCreate: 640,
  /**
   * Intake-form designer panel. IntakeFormDesignerModal.tsx:56
   * (SlideoutMenu width "75%").
   */
  intakeDesigner: '75%',
} as const;

export type DrawerWidthKey = keyof typeof DRAWER_WIDTHS;
