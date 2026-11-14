// Sign-up consent, stored on users/{uid}.consent. Korean PIPA asks for privacy
// consent separately from the terms, with optional items kept optional, and a
// parent's consent for children under 14.

/** Bump when the Terms or Privacy Policy change in a way users must re-accept. */
export const CONSENT_VERSION = "2026-11-14";

export interface Consent {
  version: string;
  terms: boolean;
  privacy: boolean;
  /** Optional: live activity visible to teachers (presence/{uid}). */
  activity: boolean;
  /** 14 or older, or a parent or guardian agreed. */
  age: boolean;
}

export function parseConsent(v: unknown): Consent | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (typeof c.version !== "string") return null;
  return { version: c.version, terms: c.terms === true, privacy: c.privacy === true, activity: c.activity === true, age: c.age === true };
}

/** Whether the user has accepted everything required in the current version. */
export const hasRequiredConsent = (c: Consent | null) => !!c && c.version === CONSENT_VERSION && c.terms && c.privacy && c.age;
