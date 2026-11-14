/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0.
 */
import { mount } from '@vue/test-utils';
import Antd, { Alert } from 'ant-design-vue';
import { describe, expect, it } from 'vitest';
import type { OrchestratorStatus } from '@/types/ingestion';
import AirflowMessageBanner from './AirflowMessageBanner.vue';

const DISABLED = 'pipeline service disabled';
const UNREACHABLE = 'pipeline service unreachable';

function mountBanner(status: OrchestratorStatus | null, checked: boolean) {
  return mount(AirflowMessageBanner, {
    props: { status, checked, disabledMessage: DISABLED, unreachableMessage: UNREACHABLE },
    global: { plugins: [Antd] },
  });
}

function bannerText(wrapper: ReturnType<typeof mountBanner>): string | null {
  const placeholder = wrapper.find('[data-testid="no-airflow-placeholder"]');
  if (!placeholder.exists()) {
    return null;
  }
  expect(placeholder.attributes('role')).toBe('status');
  return wrapper.findComponent(Alert).props('message') as string;
}

describe('AirflowMessageBanner (official AirflowMessageBanner)', () => {
  it('renders nothing while the probe has not settled', () => {
    expect(bannerText(mountBanner({ code: 500, platform: 'airflow' }, false))).toBeNull();
  });

  it('shows the disabled message when the platform is disabled, even with a 200 code', () => {
    expect(
      bannerText(mountBanner({ code: 200, platform: 'disabled' }, true)),
    ).toBe(DISABLED);
  });

  it('shows the server reason when the service does not answer 200', () => {
    expect(
      bannerText(mountBanner({ code: 500, platform: 'airflow', reason: 'boom' }, true)),
    ).toBe('boom');
  });

  it('falls back to the unreachable message when no reason is given', () => {
    expect(bannerText(mountBanner({ code: 500, platform: 'airflow' }, true))).toBe(UNREACHABLE);
    expect(bannerText(mountBanner(null, true))).toBe(UNREACHABLE);
  });

  it('shows the reason on a hybrid platform and stays silent otherwise', () => {
    expect(
      bannerText(mountBanner({ code: 200, platform: 'Hybrid', reason: 'hybrid note' }, true)),
    ).toBe('hybrid note');
    expect(bannerText(mountBanner({ code: 200, platform: 'Hybrid' }, true))).toBeNull();
    expect(bannerText(mountBanner({ code: 200, platform: 'airflow' }, true))).toBeNull();
  });
});
