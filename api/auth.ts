import { timingSafeEqual } from "node:crypto";
import type { ApiRequest } from "./types.js";

const pinPattern = /^[a-zA-Z0-9]+$/;

export function getExpectedAccessPin(): string | undefined {
  const pin = process.env.ACCESS_PIN?.trim() || process.env.SYNC_TOKEN?.trim();
  return pin || undefined;
}

export function isAccessConfigured(): boolean {
  return Boolean(getExpectedAccessPin());
}

export function isPinValid(pin: string | undefined): boolean {
  const expected = getExpectedAccessPin();
  const actual = pin?.trim();
  if (!expected || !actual) return false;
  if (!pinPattern.test(actual)) return false;

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(actual);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}

export function isAuthorized(request: ApiRequest): boolean {
  const header = request.headers.authorization;
  const actual = Array.isArray(header) ? header[0] : header;
  return isPinValid(actual?.replace(/^Bearer\s+/i, ""));
}
