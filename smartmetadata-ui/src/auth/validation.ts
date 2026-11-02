/**
 * Copyright 2026 SmartMetadata authors.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Auth form validation, copied in rule (not code) from the official
 * frontend: EMAIL_REG_EX and passwordRegex in
 * openmetadata-ui/.../constants/regex.constants.ts.
 *
 * One deliberate deviation: the official passwordRegex carries the /g
 * flag, which makes repeated .test() calls stateful via lastIndex. The
 * product pattern drops /g so validation is deterministic.
 */
export const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export const PASSWORD_PATTERN =
  /^(?=.*\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[^\w\d\s:])([^\s]){8,56}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

export function isValidPassword(value: string): boolean {
  return PASSWORD_PATTERN.test(value);
}

export function passwordsMatch(password: string, confirmPassword: string): boolean {
  return password.length > 0 && password === confirmPassword;
}
