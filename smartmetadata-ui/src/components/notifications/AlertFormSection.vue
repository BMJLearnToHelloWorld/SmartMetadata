<!--
  Copyright 2026 SmartMetadata authors.
  Licensed under the Apache License, Version 2.0.
-->
<script setup lang="ts">
/**
 * Form section shell (pin FormCardSection): a card with a heading, a
 * description line, and the fields. The dashed dividers between
 * segments live in the parent, not here.
 */
defineProps<{ heading: string; subHeading?: string }>();
</script>

<template>
  <section class="alert-form-section">
    <h3 class="alert-form-section__heading">{{ heading }}</h3>
    <p v-if="subHeading" class="alert-form-section__subheading">{{ subHeading }}</p>
    <slot />
  </section>
</template>

<style scoped>
.alert-form-section__heading {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  margin: 0 0 4px;
}

.alert-form-section__subheading {
  color: var(--sm-text-secondary);
  margin: 0 0 16px;
}
</style>
