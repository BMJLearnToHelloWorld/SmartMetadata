/**
 * Copyright 2026 SmartMetadata authors.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */
import type { EntityRef } from './api';

export interface Paged<T> {
  data: T[];
  after?: string;
  before?: string;
  total?: number;
}

export type IncludeFilter = 'non-deleted' | 'deleted' | 'all';

export interface AdminUser {
  id: string;
  name: string;
  displayName?: string;
  email?: string;
  description?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  deleted?: boolean;
  teams: EntityRef[];
  roles: EntityRef[];
}

export interface CreateUserRequest {
  name: string;
  email: string;
  displayName?: string;
  description?: string;
  isAdmin?: boolean;
  isBot?: boolean;
  password?: string;
  confirmPassword?: string;
  createPasswordType?: 'ADMIN_CREATE' | 'USER_CREATE';
  teams?: string[];
  roles?: string[];
}

export interface AdminTeam {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  teamType: string;
  isJoinable?: boolean;
  deleted?: boolean;
  userCount?: number;
  users: EntityRef[];
  defaultRoles: EntityRef[];
  parents: EntityRef[];
  policies: EntityRef[];
}

export interface CreateTeamRequest {
  name: string;
  teamType: string;
  displayName?: string;
  description?: string;
  isJoinable?: boolean;
  parents?: string[];
  defaultRoles?: string[];
  users?: string[];
}

export interface AdminRole {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deleted?: boolean;
  policies: EntityRef[];
  users: EntityRef[];
  teams: EntityRef[];
}

export interface PolicyRule {
  name: string;
  description?: string;
  effect?: string;
  operations: string[];
  resources: string[];
  condition?: string;
}

export interface AdminPolicy {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  enabled?: boolean;
  deleted?: boolean;
  owners: EntityRef[];
  teams: EntityRef[];
  roles: EntityRef[];
  rules: PolicyRule[];
}

export interface AdminBot {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deleted?: boolean;
  botUser?: EntityRef;
}

export interface CreateBotRequest {
  name: string;
  botUser: string;
  displayName?: string;
  description?: string;
  botUserEmail: string;
}

export type JwtTokenExpiry = 'OneHour' | '1' | '7' | '30' | '60' | '90' | 'Unlimited';

export interface JwtAuthMechanism {
  JWTToken?: string;
  JWTTokenExpiry?: string;
  JWTTokenExpiresAt?: number;
}

export interface AuthConfiguration {
  provider?: string;
  providerName?: string;
  clientType?: string;
  enableSelfSignup?: boolean;
  enableAutoRedirect?: boolean;
  clientId?: string;
  authority?: string;
  callbackUrl?: string;
}

export interface LoginConfiguration {
  maxLoginFailAttempts?: number;
  accessBlockTime?: number;
  jwtTokenExpiryTime?: number;
}

export interface EmailConfiguration {
  emailingEntity?: string;
  supportUrl?: string;
  enableSmtpServer?: boolean;
  senderMail?: string;
  serverEndpoint?: string;
  serverPort?: number;
  username?: string;
  password?: string;
  transportationStrategy?: string;
  templates?: string;
}

export interface SystemSetting {
  configType: string;
  configValue: unknown;
}

export interface ServerVersion {
  version?: string;
  revision?: string;
  timestamp?: number;
}
