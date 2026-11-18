<!--
Copyright 2026 SmartMetadata authors.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the Apache License at

    http://www.apache.org/licenses/LICENSE-2.0
-->
<script setup lang="ts">
import { Button, Input } from 'ant-design-vue';
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import AnnouncementBannerPreview from '@/components/notifications/AnnouncementBannerPreview.vue';
import AnnouncementColorSelect from '@/components/notifications/AnnouncementColorSelect.vue';
import AnnouncementDateField from '@/components/notifications/AnnouncementDateField.vue';
import AnnouncementTypeSelect from '@/components/notifications/AnnouncementTypeSelect.vue';
import SmRichTextEditor from '@/components/shared/SmRichTextEditor.vue';
import { useAuthStore } from '@/stores/auth';
import type { Announcement, AnnouncementType } from '@/types/collaboration';
import type { AnnouncementFormValues } from '@/types/notifications';
import type { TranslateFn } from '@/utils/notifications/alertUtils';
import type { AlertSearchHooks } from '@/utils/notifications/alertSourceSearch';
import {
  ANNOUNCEMENT_TITLE_MAX_LENGTH,
  CUSTOM_TYPE_NAME_MAX_LENGTH,
  getSystemAnnouncementDefaultValues,
  hasAnnouncementFormErrors,
  toAnnouncementTypeFields,
  validateAnnouncementForm,
  type SystemAnnouncementFormMode,
} from '@/utils/notifications/announcementUtils';
import { saveSystemAnnouncement } from '@/views/collaboration/useSystemAnnouncements';

/**
 * Pin `SystemAnnouncementForm` (353 lines): add, edit or duplicate a
 * system announcement — one with no entity link, shown to the whole
 * organization. Type, title, window and a rich-text description,
 * with a live preview of the banner beside them. It navigates
 * nowhere itself: the surface says where Cancel and Save lead.
 *
 * Validation runs in pin's `mode: 'onChange'` shape: the submit gate
 * tracks every rule live from the start, while each field's error
 * message only shows once that field has been edited (or, for the
 * end date, re-judged after a start change while it holds a value).
 * Leaving Custom drops the colour and name errors, as pin's
 * `clearErrors` does. The values themselves stay, and the save
 * mapping drops them outside Custom.
 */
const props = defineProps<{
  mode: SystemAnnouncementFormMode;
  /** The announcement being edited or duplicated. */
  announcement?: Announcement;
  hooks: AlertSearchHooks;
  notifySuccess: (message: string) => void;
}>();
const emit = defineEmits<{
  cancel: [];
  saved: [announcement: Announcement];
}>();

const { t } = useI18n();
const translate = t as unknown as TranslateFn;
const authStore = useAuthStore();

const isEdit = computed(() => props.mode === 'edit' && Boolean(props.announcement));
const isCustom = computed(() => values.value.type === 'Custom');

const values = ref<AnnouncementFormValues>(
  getSystemAnnouncementDefaultValues(
    props.mode,
    (title) => t('label.entity-copy', { entity: title }),
    props.announcement,
  ),
);

const touched = ref(new Set<string>());
const saving = ref(false);

const errors = computed(() => validateAnnouncementForm(values.value, translate));
const isValid = computed(() => !hasAnnouncementFormErrors(errors.value));

function shownError(field: string): string | undefined {
  if (!touched.value.has(field)) {
    return undefined;
  }
  const error = errors.value[field as keyof typeof errors.value];
  return typeof error === 'string' ? error : undefined;
}

function isFieldInvalid(field: string): boolean {
  return touched.value.has(field) && errors.value[field as keyof typeof errors.value] !== undefined;
}

function markTouched(field: string): void {
  touched.value = new Set(touched.value).add(field);
}

function onTypeChange(next: AnnouncementType): void {
  values.value = { ...values.value, type: next };
  // Leaving Custom drops its colour and name requirements, so their errors go too.
  if (next !== 'Custom') {
    const nextTouched = new Set(touched.value);
    nextTouched.delete('color');
    nextTouched.delete('customTypeName');
    touched.value = nextTouched;
  }
}

function onStartChange(next: number | null): void {
  values.value = { ...values.value, startTime: next };
  markTouched('startTime');
  // Moving the start can invalidate an end that was fine against the
  // old one; only re-judge an end that exists, or its required rule
  // would fire before it is reached.
  if (values.value.endTime != null) {
    markTouched('endTime');
  }
}

async function submit(): Promise<void> {
  if (!isValid.value) {
    return;
  }
  const { title, description, startTime, endTime } = values.value;
  // The rules gate submit, so both dates are set by now; the guard
  // narrows the form's nullable type to the `number` the API takes.
  if (startTime == null || endTime == null) {
    return;
  }
  saving.value = true;
  try {
    await saveSystemAnnouncement({
      original: isEdit.value ? props.announcement : undefined,
      request: {
        displayName: title.trim(),
        description,
        startTime,
        endTime,
        ...toAnnouncementTypeFields(values.value),
      },
      hooks: props.hooks,
      t: translate,
      notifySuccess: props.notifySuccess,
      onSaved: (saved) => emit('saved', saved),
    });
  } finally {
    saving.value = false;
  }
}

function onTitleInput(next: string): void {
  values.value = { ...values.value, title: next };
  markTouched('title');
}
</script>

<template>
  <div class="system-announcement-form">
    <div class="system-announcement-form__scroll">
      <div class="system-announcement-form__column">
        <div
          class="system-announcement-form__fields"
          data-testid="system-announcement-form"
        >
          <div class="system-announcement-form__field">
            <span class="system-announcement-form__label">
              {{ t('label.announcement-type') }} *
            </span>
            <AnnouncementTypeSelect :value="values.type" @change="onTypeChange" />
          </div>

          <div v-if="isCustom" class="system-announcement-form__row">
            <div class="system-announcement-form__field system-announcement-form__field--grow">
              <label class="system-announcement-form__label" for="customTypeName">
                {{ t('label.custom-name') }} *
              </label>
              <Input
                id="customTypeName"
                :value="values.customTypeName ?? ''"
                data-testid="custom-type-name"
                :maxlength="CUSTOM_TYPE_NAME_MAX_LENGTH"
                :placeholder="t('label.enter-entity-name', { entity: t('label.announcement') })"
                :status="isFieldInvalid('customTypeName') ? 'error' : undefined"
                @update:value="
                  values = { ...values, customTypeName: $event };
                  markTouched('customTypeName');
                "
              />
              <p
                v-if="shownError('customTypeName')"
                class="system-announcement-form__hint system-announcement-form__hint--error"
              >
                {{ shownError('customTypeName') }}
              </p>
            </div>

            <div class="system-announcement-form__field system-announcement-form__field--grow">
              <span class="system-announcement-form__label">{{ t('label.color') }} *</span>
              <AnnouncementColorSelect
                :value="values.color"
                @change="
                  values = { ...values, color: $event };
                  markTouched('color');
                "
              />
              <p
                v-if="shownError('color')"
                class="system-announcement-form__hint system-announcement-form__hint--error"
                data-testid="color-error"
              >
                {{ shownError('color') }}
              </p>
            </div>
          </div>

          <div class="system-announcement-form__field">
            <label class="system-announcement-form__label" for="announcement-title">
              {{ t('label.title') }} *
            </label>
            <Input
              id="announcement-title"
              :value="values.title"
              data-testid="title"
              :maxlength="ANNOUNCEMENT_TITLE_MAX_LENGTH"
              :placeholder="t('message.enter-title-here')"
              :status="isFieldInvalid('title') ? 'error' : undefined"
              @update:value="onTitleInput"
            />
            <p
              class="system-announcement-form__hint"
              :class="{ 'system-announcement-form__hint--error': shownError('title') }"
            >
              {{ shownError('title') ?? `${values.title.length}/${ANNOUNCEMENT_TITLE_MAX_LENGTH}` }}
            </p>
          </div>

          <div class="system-announcement-form__row">
            <AnnouncementDateField
              id="startTime"
              :label="t('label.start-date')"
              :value="values.startTime"
              :error="shownError('startTime')"
              @change="onStartChange"
            />
            <AnnouncementDateField
              id="endTime"
              boundary="end"
              :label="t('label.end-date')"
              :value="values.endTime"
              :error="shownError('endTime')"
              @change="
                values = { ...values, endTime: $event };
                markTouched('endTime');
              "
            />
          </div>

          <div class="system-announcement-form__field">
            <span class="system-announcement-form__label">{{ t('label.description') }} *</span>
            <SmRichTextEditor
              data-testid="description"
              :initial-value="values.description"
              :place-holder="t('message.enter-a-description')"
              @text-change="
                values = { ...values, description: $event };
                markTouched('description');
              "
            />
            <p
              v-if="shownError('description')"
              class="system-announcement-form__hint system-announcement-form__hint--error"
              data-testid="description-error"
            >
              {{ shownError('description') }}
            </p>
          </div>
        </div>

        <AnnouncementBannerPreview
          :created-by="isEdit ? props.announcement?.createdBy : authStore.user?.name"
          :values="values"
        />
      </div>
    </div>

    <div class="system-announcement-form__footer">
      <Button data-testid="announcement-cancel" @click="emit('cancel')">
        {{ t('label.cancel') }}
      </Button>
      <Button
        type="primary"
        data-testid="announcement-submit"
        :disabled="!isValid"
        :loading="saving"
        @click="submit"
      >
        {{
          isEdit
            ? t('label.save-changes')
            : t('label.add-entity', { entity: t('label.announcement') })
        }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.system-announcement-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.system-announcement-form__scroll {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
}

.system-announcement-form__column {
  display: flex;
  flex-direction: column;
  gap: 24px;
  width: 100%;
  max-width: 50%;
  padding: 0 24px 24px;
}

.system-announcement-form__fields {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
}

.system-announcement-form__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.system-announcement-form__field--grow {
  min-width: 0;
  flex: 1;
}

.system-announcement-form__row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.system-announcement-form__label {
  font-weight: 500;
}

.system-announcement-form__hint {
  color: var(--sm-text-secondary);
  margin: 0;
}

.system-announcement-form__hint--error {
  color: var(--sm-color-error);
}

.system-announcement-form__footer {
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid var(--sm-border-secondary);
  padding: 16px 24px;
}
</style>
