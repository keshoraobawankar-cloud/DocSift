/**
 * Firestore Security Rules Adversarial Test Specification ("Dirty Dozen")
 * Verifies that all adversarial payloads against /users/{userId} and
 * /extractions/{extractionId} are rejected with PERMISSION_DENIED.
 */

export interface AdversarialCase {
  id: number;
  name: string;
  collectionPath: string;
  operation: "get" | "list" | "create" | "update" | "delete";
  auth: { uid: string; email: string; email_verified: boolean } | null;
  payload?: Record<string, unknown>;
  expectedOutcome: "PERMISSION_DENIED";
}

export const DIRTY_DOZEN_CASES: AdversarialCase[] = [
  {
    id: 1,
    name: "Identity spoofing on extraction create",
    collectionPath: "/extractions/ext_spoof_1",
    operation: "create",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { ownerId: "user_b", documentTitle: "Spoofed Doc" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 2,
    name: "Orphaned extraction without parent user profile",
    collectionPath: "/extractions/ext_orphan_1",
    operation: "create",
    auth: { uid: "user_no_profile", email: "np@example.com", email_verified: true },
    payload: { ownerId: "user_no_profile", documentTitle: "Orphan Doc" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 3,
    name: "Unverified email token write attempt",
    collectionPath: "/users/user_unverified",
    operation: "create",
    auth: { uid: "user_unverified", email: "u@example.com", email_verified: false },
    payload: { uid: "user_unverified", displayName: "Unverified" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 4,
    name: "PII cross-user profile get attempt",
    collectionPath: "/users/user_b",
    operation: "get",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 5,
    name: "Unconstrained extractions list scraping",
    collectionPath: "/extractions",
    operation: "list",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 6,
    name: "Shadow ghost field injection (isAdmin: true)",
    collectionPath: "/users/user_a",
    operation: "update",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { displayName: "Alice", isAdmin: true },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 7,
    name: "Tampering with immutable AI urgencyLevel or classification field",
    collectionPath: "/extractions/ext_valid_1",
    operation: "update",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { urgencyLevel: "Informational" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 8,
    name: "Extraction ownership transfer on update",
    collectionPath: "/extractions/ext_valid_1",
    operation: "update",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { ownerId: "user_b" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 9,
    name: "Client-forged backdated createdAt timestamp",
    collectionPath: "/users/user_a",
    operation: "create",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { uid: "user_a", createdAt: "2020-01-01T00:00:00Z" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 10,
    name: "Path ID poisoning with 200-char string",
    collectionPath: `/extractions/${"x".repeat(200)}`,
    operation: "create",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { ownerId: "user_a" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 11,
    name: "Value poisoning on whitelisted actionItems Kanban status",
    collectionPath: "/extractions/ext_valid_1",
    operation: "update",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { actionItems: [{ status: "invalid_stage" }] },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 12,
    name: "Mutating immutable createdAt during profile update",
    collectionPath: "/users/user_a",
    operation: "update",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { displayName: "Updated", createdAt: "2026-10-30T00:00:00Z" },
    expectedOutcome: "PERMISSION_DENIED",
  },
  {
    id: 13,
    name: "Oversized sourceText payload exceeding 30KB bound or mutating sourceText on update",
    collectionPath: "/extractions/ext_valid_1",
    operation: "update",
    auth: { uid: "user_a", email: "a@example.com", email_verified: true },
    payload: { sourceText: "x".repeat(35000) },
    expectedOutcome: "PERMISSION_DENIED",
  },
];
