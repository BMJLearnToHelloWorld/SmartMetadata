<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
import { Button } from 'ant-design-vue';
import { nextTick, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = defineProps<{ text: string }>();

const { t } = useI18n();
const textRef = ref<HTMLElement | null>(null);
const isExpanded = ref(false);
const isClamped = ref(false);

/**
 * Official ReindexFailures.ErrorMessage (pin a3012259ca): the error
 * text is clamped to two lines; when the text overflows, a
 * More/Less toggle expands it. The clamp is measured from the
 * rendered paragraph, never guessed from the string length.
 */
function measureClamp(): void {
  const paragraph = textRef.value?.querySelector('p');
  if (paragraph && !isExpanded.value) {
    isClamped.value = paragraph.scrollHeight > paragraph.clientHeight;
  }
}

onMounted(() => {
  void nextTick(measureClamp);
});

watch(
  () => [props.text, isExpanded.value],
  () => {
    void nextTick(measureClamp);
  },
);
</script>

<template>
  <span ref="textRef" style="display: inline-flex; align-items: flex-start; min-width: 0; flex: 1">
    <p
      :style="
        isExpanded
          ? 'margin: 0; word-break: break-word'
          : 'margin: 0; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden'
      "
    >
      {{ text }}
    </p>
    <Button
      v-if="isClamped || isExpanded"
      data-testid="error-message-toggle"
      size="small"
      type="link"
      @click="isExpanded = !isExpanded"
    >
      {{ t(isExpanded ? 'label.less-lowercase' : 'label.more-lowercase') }}
    </Button>
  </span>
</template>
