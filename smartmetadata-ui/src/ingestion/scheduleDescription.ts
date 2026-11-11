/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';

/**
 * Port of official useScheduleDescriptionTexts +
 * DateTimeUtils.getScheduleDescriptionTexts (openmetadata-ui, pin
 * a3012259ca): cronstrue parses the cron into a verbose two-part
 * description — the text up to the first comma, then the capitalised
 * remainder. cronstrue is lazy-loaded on first call (~15 KB brotli),
 * so the first render returns empty strings until the import resolves,
 * then the component re-renders with the parsed values. An unparsable
 * cron returns empty strings, never a hand-written approximation.
 */
type CronstrueModule = typeof import('cronstrue');

let cronstrueModule: CronstrueModule | null = null;
let cronstruePromise: Promise<CronstrueModule> | null = null;

export function ensureCronstrueLoaded(): Promise<CronstrueModule> {
  if (cronstrueModule) {
    return Promise.resolve(cronstrueModule);
  }
  if (!cronstruePromise) {
    cronstruePromise = import('cronstrue').then((module) => {
      cronstrueModule = module;
      return module;
    });
  }
  return cronstruePromise;
}

export function getLoadedCronstrue(): CronstrueModule | null {
  return cronstrueModule;
}

export interface ScheduleDescriptionTexts {
  descriptionFirstPart: string;
  descriptionSecondPart: string;
}

const EMPTY_TEXTS: ScheduleDescriptionTexts = {
  descriptionFirstPart: '',
  descriptionSecondPart: '',
};

function capitalize(text: string): string {
  if (!text) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** cronstrue locale names differ from the product's BCP 47 tags. */
export function cronstrueLocaleFor(locale: string): string {
  if (locale.toLowerCase().startsWith('zh')) {
    return 'zh_CN';
  }
  return 'en';
}

export function getScheduleDescriptionTexts(
  scheduleInterval: string | undefined | null,
  locale = 'en',
): ScheduleDescriptionTexts {
  if (!scheduleInterval) {
    return EMPTY_TEXTS;
  }
  if (!cronstrueModule) {
    void ensureCronstrueLoaded();
    return EMPTY_TEXTS;
  }
  try {
    const scheduleDescription = cronstrueModule.default.toString(scheduleInterval, {
      use24HourTimeFormat: false,
      verbose: true,
      locale: cronstrueLocaleFor(locale),
    });
    const firstSentenceEndIndex = scheduleDescription.indexOf(',');
    if (firstSentenceEndIndex === -1) {
      return { descriptionFirstPart: scheduleDescription.trim(), descriptionSecondPart: '' };
    }
    return {
      descriptionFirstPart: scheduleDescription.slice(0, firstSentenceEndIndex).trim(),
      descriptionSecondPart: capitalize(scheduleDescription.slice(firstSentenceEndIndex + 1).trim()),
    };
  } catch {
    return EMPTY_TEXTS;
  }
}

/**
 * Vue port of official useScheduleDescriptionTexts: returns reactive
 * description parts for the cron, re-evaluating once cronstrue loads
 * and whenever the cron expression changes.
 */
export function useScheduleDescriptionTexts(
  scheduleInterval: Ref<string | undefined | null> | (() => string | undefined | null),
  locale = 'en',
): Ref<ScheduleDescriptionTexts> {
  const texts = ref<ScheduleDescriptionTexts>(EMPTY_TEXTS);
  const loaded = ref(Boolean(getLoadedCronstrue()));
  let cancelled = false;

  function refresh(): void {
    texts.value = getScheduleDescriptionTexts(
      typeof scheduleInterval === 'function' ? scheduleInterval() : scheduleInterval.value,
      locale,
    );
  }

  onMounted(() => {
    if (getLoadedCronstrue()) {
      refresh();
      return;
    }
    void ensureCronstrueLoaded().then(() => {
      if (!cancelled) {
        loaded.value = true;
        refresh();
      }
    });
  });
  onUnmounted(() => {
    cancelled = true;
  });
  watch(loaded, refresh);
  watch(
    () => (typeof scheduleInterval === 'function' ? scheduleInterval() : scheduleInterval.value),
    refresh,
  );
  refresh();
  return texts;
}
