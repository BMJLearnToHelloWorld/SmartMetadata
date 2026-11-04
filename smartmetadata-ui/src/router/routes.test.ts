/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import { describe, expect, it } from 'vitest';
import { router } from './index';

describe('data access request routes', () => {
  it('registers the list and create routes without colliding with task routes', () => {
    const routes = router.getRoutes();
    const list = routes.find((route) => route.name === 'data-access-requests');
    const create = routes.find((route) => route.name === 'data-access-request-new');
    expect(list?.path).toBe('/data-access-requests');
    expect(create?.path).toBe('/data-access-requests/new');
    expect(routes.find((route) => route.name === 'task')?.path).toBe('/tasks/:id');
    // Names are not unique in this router: alias records share their
    // route's name (e.g. the task-forms settings alias). Paths are not
    // globally unique either: getRoutes() flattens the tree, so the
    // AppShell parent '/' and its '' index child both surface as '/'.
    // That is standard Vue Router structure, not a duplicate registration.
    // So collision is asserted on the new paths only: each occurs once.
    const paths = routes.map((route) => route.path);
    expect(paths.filter((path) => path === '/data-access-requests').length).toBe(1);
    expect(paths.filter((path) => path === '/data-access-requests/new').length).toBe(1);
  });
});
