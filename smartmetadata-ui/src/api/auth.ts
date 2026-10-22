/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { JwtResponse, LoginUser } from '@/types/api';
import { apiRequest } from './client';

export function loginWithPassword(email: string, encodedPassword: string): Promise<JwtResponse> {
  return apiRequest<JwtResponse>('/v1/users/login', {
    json: { email, password: encodedPassword },
    auth: false,
  });
}

export function fetchLoggedInUser(): Promise<LoginUser> {
  return apiRequest<LoginUser>('/v1/users/loggedInUser');
}

export function logoutOnServer(token: string, refreshToken?: string): Promise<unknown> {
  return apiRequest('/v1/users/logout', {
    json: {
      token,
      ...(refreshToken ? { refreshToken } : {}),
    },
  });
}
