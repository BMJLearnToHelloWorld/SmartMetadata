/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { useAlertRuleKeys } from './useAlertRuleKeys';

describe('useAlertRuleKeys', () => {
  it('assigns stable keys, removes the key at the removed index, and never reuses ids', async () => {
    const count = ref(2);
    let exposed!: ReturnType<typeof useAlertRuleKeys>;
    const probe = defineComponent({
      setup() {
        exposed = useAlertRuleKeys(count);
        return () => h('div');
      },
    });
    mount(probe);
    const [first, second] = exposed.keys.value;
    expect(first).not.toBe(second);

    count.value = 3;
    await nextTick();
    expect(exposed.keys.value.slice(0, 2)).toEqual([first, second]);
    const third = exposed.keys.value[2];

    exposed.removeKey(0);
    count.value = 2;
    await nextTick();
    expect(exposed.keys.value).toEqual([second, third]);

    count.value = 3;
    await nextTick();
    expect(exposed.keys.value[2]).not.toBe(first);
    expect(exposed.keys.value.slice(0, 2)).toEqual([second, third]);
  });
});
