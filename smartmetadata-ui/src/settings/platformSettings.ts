/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Personal-space platform-settings section registry (D-CFG-3 host lane).
 *
 * Pin `components/discovery/personal-space/Profile/tabs/platform-settings/
 * PlatformSettings.constants.ts:102-107` (a3012259ca) registers one entry
 * per settings section: `{ id: 'lineage', icon, titleKey,
 * descriptionKey, hasEditView: true }`, and `PlatformSettingsPanel.tsx:
 * 87,123` maps the id to its read-only summary component and its edit
 * form. The product has no AI-shell personal-space Profile page, so the
 * registry lives here and the panel mounts on the product's profile page
 * (`views/admin/UserDetailView.vue`, tab `platform-settings`); the
 * section ids and title/description keys are pin-identical.
 *
 * A later settings lane adds a section by appending one entry here and
 * mounting its component in `PlatformSettingsPanel.vue` — no other file
 * needs to know the section list.
 */
export interface PlatformSettingsSection {
  id: string;
  titleKey: string;
  descriptionKey: string;
  hasEditView: boolean;
}

export const PLATFORM_SETTINGS_SECTIONS: readonly PlatformSettingsSection[] = [
  {
    id: 'lineage',
    titleKey: 'settings.lineage.title',
    descriptionKey: 'settings.lineage.description',
    hasEditView: true,
  },
];

export function platformSettingsSection(id: string): PlatformSettingsSection | undefined {
  return PLATFORM_SETTINGS_SECTIONS.find((section) => section.id === id);
}
