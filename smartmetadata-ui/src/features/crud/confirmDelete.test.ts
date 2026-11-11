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

  it('runs an async onOk and resolves true only after it succeeds (P-18)', async () => {
    let ran = false;
    let capturedOnOk: (() => unknown) | undefined;
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      capturedOnOk = config.onOk as (() => unknown) | undefined;
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const result = confirmDelete({
      title: 'Delete',
      content: 'Are you sure?',
      okText: 'Delete',
      cancelText: 'Cancel',
      onOk: async () => {
        await Promise.resolve();
        ran = true;
      },
    });
    expect(capturedOnOk).toBeDefined();
    // antd keeps the modal open while the returned promise is pending.
    expect(capturedOnOk!()).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(true);
    expect(ran).toBe(true);
  });

  it('leaves the confirm pending when the async onOk rejects (P-18)', async () => {
    let capturedOnOk: (() => unknown) | undefined;
    vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      capturedOnOk = config.onOk as (() => unknown) | undefined;
      return { destroy: vi.fn(), update: vi.fn() } as never;
    });
    const result = confirmDelete({
      title: 'Delete',
      content: 'Are you sure?',
      okText: 'Delete',
      cancelText: 'Cancel',
      onOk: async () => {
        throw new Error('delete failed');
      },
    });
    // The rejection propagates to antd (modal stays open for retry/cancel);
    // the caller's promise stays pending.
    await expect(capturedOnOk!() as Promise<unknown>).rejects.toThrow('delete failed');
    const raced = await Promise.race([
      result.then(() => 'resolved'),
      new Promise((resolve) => setTimeout(() => resolve('pending'), 50)),
    ]);
    expect(raced).toBe('pending');
  });
});
