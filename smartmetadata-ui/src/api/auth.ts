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

/**
 * Stage 9 auth endpoints, mirroring official rest/auth-API.ts paths
 * (axiosClient base /api/v1 there; the product client prefixes /api and
 * these paths carry /v1, so the final URLs match).
 * All three run unauthenticated: they are the pre-login calls.
 */
export interface SignupRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export function signupUser(payload: SignupRequest): Promise<number> {
  return apiRequest<number>('/v1/users/signup', { json: payload, auth: false });
}

export function requestPasswordResetLink(email: string): Promise<number> {
  return apiRequest<number>('/v1/users/generatePasswordResetLink', {
    json: { email },
    auth: false,
  });
}

export interface PasswordResetRequest {
  token: string;
  username: string;
  password: string;
  confirmPassword: string;
}

export function resetUserPassword(payload: PasswordResetRequest): Promise<unknown> {
  return apiRequest('/v1/users/password/reset', { json: payload, auth: false });
}

/**
 * Official confirmRegistration (rest/auth-API.ts): PUT
 * /users/registrationConfirmation?token=... . A non-empty response means
 * the account is verified; an empty one leaves it unverified (the
 * confirmation page renders the token-expired state for both empty and
 * failed responses).
 */
export function confirmRegistration(token: string): Promise<unknown> {
  return apiRequest('/v1/users/registrationConfirmation', {
    method: 'PUT',
    query: { token },
    auth: false,
  });
}

export function logoutOnServer(token: string, refreshToken?: string): Promise<unknown> {
  return apiRequest('/v1/users/logout', {
    json: {
      token,
      ...(refreshToken ? { refreshToken } : {}),
    },
  });
}
