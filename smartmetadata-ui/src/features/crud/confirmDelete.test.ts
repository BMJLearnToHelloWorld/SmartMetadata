/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { Modal } from 'ant-design-vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { confirmDelete } from './confirmDelete';

describe('confirmDelete', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens ant Modal.confirm with ok-danger and resolves true on OK', async () => {
    const spy = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      expect(config.okType).toBe('danger');
      expect(config.okButtonProps).toMatchObject({ danger: true, type: 'primary' });
      expect(config.wrapClassName).toBe('sm-confirm-delete');
      expect(config.title).toBe('Delete');
      expect(config.content).toContain('cannot be undone');
      void Promise.resolve(config.onOk?.());
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });

    await expect(
      confirmDelete({
        title: 'Delete',
        content: 'Are you sure you want to delete warehouse? This action cannot be undone.',
        okText: 'Delete',
        cancelText: 'Cancel',
      }),
    ).resolves.toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('resolves false when the confirm is cancelled', async () => {
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      void Promise.resolve(config.onCancel?.());
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });

    await expect(
      confirmDelete({
        title: 'Delete',
        content: 'Are you sure?',
        okText: 'Delete',
        cancelText: 'Cancel',
      }),
    ).resolves.toBe(false);
  });
});
