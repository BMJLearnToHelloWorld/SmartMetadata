/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { defineComponent, h } from 'vue';

export default defineComponent({
  name: 'VChart',
  props: {
    option: { type: Object, default: () => ({}) },
    autoresize: { type: Boolean, default: false },
  },
  setup() {
    return () => h('div', { 'data-testid': 'v-chart' });
  },
});
