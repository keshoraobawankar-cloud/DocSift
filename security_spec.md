# Firestore Security Specification — Distill

## 1. Data Invariants

1. **Default-Deny Catch-All**: Any path outside `/users/{userId}`, `/extractions/{extractionId}`, and `/drafts/{draftId}` is unconditionally denied (`allow read, write: if false`).
2. **Verified Authentication Gate**: Every write operation (`create`, `update`, `delete`) across all collections requires `request.auth != null && request.auth.token.email_verified == true`.
3. **Strict PII Isolation (`/users/{userId}`)**:
   - `list` is unconditionally denied (`allow list: if false`) so no user can enumerate profiles or scrape emails.
   - `get` is permitted strictly when `request.auth.uid == userId && resource.data.uid == request.auth.uid`.
   - `uid`, `email`, and `createdAt` are immutable after profile creation.
4. **Relational Existence & Ownership (`/extractions/{extractionId}` & `/drafts/{draftId}`)**:
   - An extraction or draft document can only be created if `incoming().ownerId == request.auth.uid` AND `exists(/databases/$(database)/documents/users/$(request.auth.uid))` (no orphaned documents without an initialized user profile).
   - `get` and `list` strictly enforce `resource.data.ownerId == request.auth.uid` on the server side (zero client-side filter delegation, zero `get()` calls inside `list`).
5. **System-Only Field Immutability & Action-Based Updates**:
   - AI-generated evaluation fields (`classification`, `urgencyLevel`, `detectedTone`, `detectedLanguage`, `requiresUserAction`, `recommendedDisposition`, `evaluationRationale`, `detectedSignals`, `evaluationBases`, `criteriaBreakdown`), `sourceText`, and `ownerId` / `createdAt` are immutable during client updates.
   - Client updates on `/extractions/{extractionId}` must satisfy `isValidExtraction(incoming())` first and match one of six explicit `affectedKeys().hasOnly(...)` actions: `UpdateTasks` (including Kanban `status`), `UpdateEvents`, `UpdateAttachments`, `UpdateSummary` (`summaryBullets`, `documentTitle`), `UpdateWorkspaceNotes` (`workspaceNotes`), or `UpdateTranslation` (`documentTitle`, `summaryBullets`, `actionItems`, `calendarEvents`, `outputLanguage`, `recommendedDisposition`, `evaluationRationale`).
6. **Volumetric & Type Bounds**:
   - Every path ID matches `^[a-zA-Z0-9_\-]+$` with length `<= 128`.
   - Every string field enforces explicit `.size()` bounds (`sourceText <= 30000`, `workspaceNotes <= 15000`, `body <= 15000`, `urgencyLevel <= 40`, `detectedTone <= 60`, `detectedLanguage <= 60`, `outputLanguage <= 60`) and every array field enforces `.size() <= MAX` plus element structure checks.
   - `createdAt` and `updatedAt` must equal `request.time` on creation, and `updatedAt == request.time` on updates.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Identity Spoofing on Extraction Create**: Authenticated `userA` writes `/extractions/ext_1` with `ownerId: "userB"`. -> `PERMISSION_DENIED`.
2. **Orphaned Extraction Create**: Authenticated `userA` (without `/users/userA` profile) writes `/extractions/ext_1`. -> `PERMISSION_DENIED` (fails `exists()` check).
3. **Unverified Email Spoof Write**: Authenticated token with `email_verified: false` attempts to create `/users/userA`. -> `PERMISSION_DENIED`.
4. **PII Blanket Read / User Scraping**: Authenticated `userA` attempts `get(/users/userB)` or `list(/users)`. -> `PERMISSION_DENIED`.
5. **Cross-Tenant Query Scraping**: Authenticated `userA` runs unconstrained `list(/extractions)` without `where("ownerId", "==", "userA")`. -> `PERMISSION_DENIED` (`resource.data.ownerId == request.auth.uid` rejects).
6. **Shadow / Ghost Field Injection**: `userA` updates `/users/userA` adding `"isAdmin": true`. -> `PERMISSION_DENIED` (blocked by `hasOnly` in `isValidUserProfile` and `affectedKeys().hasOnly(...)`).
7. **System-Generated Evaluation Tampering**: `userA` attempts to update `classification` or `urgencyLevel` on an existing `/extractions/ext_1`. -> `PERMISSION_DENIED` (blocked by `affectedKeys().hasOnly(...)` action branches).
8. **Ownership Transfer Attack**: `userA` updates `/extractions/ext_1` changing `ownerId` to `"userB"`. -> `PERMISSION_DENIED`.
9. **Timestamp Forgery**: `userA` creates `/extractions/ext_1` with a backdated `createdAt` instead of `serverTimestamp()` (`request.time`). -> `PERMISSION_DENIED`.
10. **ID Poisoning Attack**: `userA` creates `/extractions/` with a 300-character or special-character document ID. -> `PERMISSION_DENIED` (`isValidId` rejects).
11. **Value Poisoning on Allowed Update Key**: `userA` updates `actionItems` on `/extractions/ext_1` passing an invalid Kanban `status: "hacked"` or 500-item array instead of bounded `'todo' | 'in_progress' | 'done'`. -> `PERMISSION_DENIED` (`isValidExtraction(incoming())` wraps update and rejects).
12. **Immortal `createdAt` Mutation**: `userA` updates `displayName` on `/users/userA` while also mutating `createdAt`. -> `PERMISSION_DENIED`.
