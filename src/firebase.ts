import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  User,
  getAuth,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import {
  Unsubscribe,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import firebaseConfig from "../firebase-applet-config.json";
import {
  ActionItem,
  CalendarEventItem,
  EmailAttachmentItem,
  EmailDraftRecord,
  EvaluationCriterionResult,
  ExtractionRecord,
  InputSourceMode,
  MailClassification,
  PriorityLevel,
  SummaryBullet,
  UrgencyLevel,
  UserProfileRecord,
  getTaskKanbanStatus,
} from "./types";
import { CountryOption, detectDefaultCountry, getCountryByCode } from "./utils/countries";

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot per Firebase integration guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("the client is offline")
    ) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const ID_REGEX = /^[a-zA-Z0-9_-]+$/;

function sanitizeId(raw: string, fallbackPrefix = "item"): string {
  const cleaned = (raw || "").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 128);
  return cleaned && ID_REGEX.test(cleaned)
    ? cleaned
    : `${fallbackPrefix}-${Date.now()}`;
}

function clampStr(val: unknown, maxLen: number, fallback = ""): string {
  const s = typeof val === "string" ? val.trim() : String(val ?? "").trim();
  return (s || fallback).slice(0, maxLen);
}

function clampInt(val: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(val));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function signInWithGooglePopup(): Promise<User> {
  const cred = await signInWithPopup(auth, googleProvider);
  return cred.user;
}

export async function signOutCurrentUser(): Promise<void> {
  await signOut(auth);
}

export async function ensureUserProfile(
  user: User,
  preferredCountry?: CountryOption,
  preferredSummaryPoints?: number
): Promise<UserProfileRecord> {
  const path = `users/${user.uid}`;
  const userRef = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      const country = getCountryByCode(String(data.countryCode || "US"));
      return {
        uid: user.uid,
        displayName: clampStr(data.displayName, 120, user.displayName || "User"),
        email: clampStr(data.email, 254, user.email || "user@example.com"),
        countryCode: country.code,
        countryName: clampStr(data.countryName, 120, country.name),
        timezone: clampStr(data.timezone, 100, country.timezone),
        defaultSummaryPoints: clampInt(data.defaultSummaryPoints, 1, 10, 3),
      };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const chosenCountry = preferredCountry ?? detectDefaultCountry();
  const summaryPts = clampInt(preferredSummaryPoints ?? 3, 1, 10, 3);
  const newProfile: UserProfileRecord = {
    uid: sanitizeId(user.uid, "uid"),
    displayName: clampStr(
      user.displayName || user.email?.split("@")[0] || "Account User",
      120,
      "Account User"
    ),
    email: clampStr(user.email || "user@example.com", 254, "user@example.com"),
    countryCode: chosenCountry.code,
    countryName: clampStr(chosenCountry.name, 120, "United States"),
    timezone: clampStr(chosenCountry.timezone, 100, "America/New_York"),
    defaultSummaryPoints: summaryPts,
  };

  try {
    await setDoc(userRef, {
      ...newProfile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateUserPreferences(
  uid: string,
  updates: {
    country?: CountryOption;
    defaultSummaryPoints?: number;
  }
): Promise<void> {
  const path = `users/${uid}`;
  const userRef = doc(db, "users", uid);
  const payload: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (updates.country) {
    payload.countryCode = updates.country.code;
    payload.countryName = clampStr(updates.country.name, 120, "United States");
    payload.timezone = clampStr(updates.country.timezone, 100, "UTC");
  }
  if (updates.defaultSummaryPoints !== undefined) {
    payload.defaultSummaryPoints = clampInt(
      updates.defaultSummaryPoints,
      1,
      10,
      3
    );
  }

  try {
    await updateDoc(userRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

function sanitizeActionItems(items: ActionItem[]): ActionItem[] {
  return (items || []).slice(0, 25).map((item, idx) => {
    const status = getTaskKanbanStatus(item);
    const completed = status === "done";
    return {
      id: sanitizeId(item.id, `task-${idx}`),
      title: clampStr(item.title, 400, "Review item"),
      owner: clampStr(item.owner, 120, "You"),
      dueDateText: clampStr(item.dueDateText, 120, "No fixed deadline"),
      dueDateIso: clampStr(item.dueDateIso, 40, ""),
      priority:
        item.priority === "High" || item.priority === "Medium" || item.priority === "Low"
          ? item.priority
          : ("Medium" as PriorityLevel),
      sourceSnippet: clampStr(item.sourceSnippet, 500, ""),
      completed,
      status,
    };
  });
}

function sanitizeCalendarEvents(events: CalendarEventItem[]): CalendarEventItem[] {
  return (events || []).slice(0, 20).map((ev, idx) => ({
    id: sanitizeId(ev.id, `ev-${idx}`),
    title: clampStr(ev.title, 300, "Scheduled Event"),
    eventType: clampStr(ev.eventType, 60, "Meeting"),
    startIso: clampStr(ev.startIso, 40, ""),
    endIso: clampStr(ev.endIso, 40, ""),
    isAllDay: Boolean(ev.isAllDay),
    location: clampStr(ev.location, 300, ""),
    organizer: clampStr(ev.organizer, 200, ""),
    attendees: (ev.attendees || [])
      .slice(0, 30)
      .map((a) => clampStr(a, 200, ""))
      .filter(Boolean),
    description: clampStr(ev.description, 1000, ""),
    statusNote: clampStr(ev.statusNote, 200, ""),
  }));
}

interface AttachmentMetaDoc {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  origin: "uploaded" | "eml" | "referenced";
  contextNote: string;
}

function sanitizeAttachmentsMeta(
  attachments?: EmailAttachmentItem[]
): AttachmentMetaDoc[] {
  return (attachments || []).slice(0, 20).map((att, idx) => ({
    id: sanitizeId(att.id, `att-${idx}`),
    fileName: clampStr(att.fileName, 240, "attachment"),
    mimeType: clampStr(att.mimeType, 120, "application/octet-stream"),
    sizeBytes: clampInt(att.sizeBytes ?? 0, 0, 50_000_000, 0),
    origin:
      att.origin === "eml" || att.origin === "uploaded" || att.origin === "referenced"
        ? att.origin
        : "referenced",
    contextNote: clampStr(att.contextNote, 400, ""),
  }));
}

function sanitizeSummaryBullets(bullets?: SummaryBullet[]): SummaryBullet[] {
  const rawBullets =
    bullets && bullets.length > 0
      ? bullets
      : [{ lead: "Summary", detail: "Extracted document summary." }];
  return rawBullets.slice(0, 10).map((b, i) => ({
    lead: clampStr(b.lead, 160, `Point ${i + 1}`),
    detail: clampStr(b.detail, 800, "Key detail extracted from source."),
  }));
}

function sanitizeCriteriaBreakdown(
  breakdown?: EvaluationCriterionResult[]
): EvaluationCriterionResult[] {
  return (breakdown || []).slice(0, 10).map((c) => ({
    criterion: clampStr(c.criterion, 120, "Criterion"),
    finding: clampStr(c.finding, 600, "Evaluated."),
    rating: clampStr(c.rating, 80, "Noted"),
  }));
}

export async function createFirestoreExtraction(
  uid: string,
  record: ExtractionRecord
): Promise<void> {
  const safeId = sanitizeId(record.id, "ext");
  const path = `extractions/${safeId}`;
  const docRef = doc(db, "extractions", safeId);

  const sanitizedBullets = sanitizeSummaryBullets(record.summaryBullets);

  const evalObj = record.mailEvaluation;
  const classification: MailClassification = evalObj?.classification ?? "Action Required";

  const urgencyLevel: UrgencyLevel =
    evalObj?.urgencyLevel === "Urgent" ||
    evalObj?.urgencyLevel === "Action Required" ||
    evalObj?.urgencyLevel === "Informational"
      ? evalObj.urgencyLevel
      : classification === "Action Required"
        ? "Action Required"
        : "Informational";

  const detectedTone = clampStr(evalObj?.detectedTone || "Neutral", 60, "Neutral");

  const sanitizedSignals = (evalObj?.detectedSignals || [])
    .slice(0, 10)
    .map((s) => clampStr(s, 200, ""))
    .filter(Boolean);

  const sanitizedBases = (evalObj?.evaluationBases || [])
    .slice(0, 10)
    .map((b) => clampStr(b, 120, ""))
    .filter(Boolean);

  const sanitizedBreakdown = sanitizeCriteriaBreakdown(evalObj?.criteriaBreakdown);

  const sourceModeStr =
    record.sourceMode === InputSourceMode.UploadFile
      ? "upload"
      : record.sourceMode === InputSourceMode.VoiceNote
        ? "voice"
        : "paste";

  const detectedLang = clampStr(record.detectedLanguage || "English", 60, "English");
  const outputLang = clampStr(
    record.outputLanguage || detectedLang,
    60,
    detectedLang
  );

  const docPayload = {
    ownerId: uid,
    createdAtIso: clampStr(
      record.createdAtIso,
      40,
      new Date().toISOString()
    ),
    countryName: clampStr(record.countryName || "United States", 120, "United States"),
    timezone: clampStr(record.timezone || "UTC", 100, "UTC"),
    sourceMode: sourceModeStr,
    sourceFileName: clampStr(record.sourceFileName || "", 240, ""),
    sourcePreview: clampStr(record.sourcePreview || "", 600, ""),
    sourceText: clampStr(
      record.sourceText || record.sourcePreview || "",
      30000,
      ""
    ),
    detectedLanguage: detectedLang,
    outputLanguage: outputLang,
    documentTitle: clampStr(record.documentTitle, 300, "Extracted Document"),
    documentType: clampStr(record.documentType, 100, "Document"),
    senderOrSource: clampStr(record.senderOrSource || "", 240, ""),
    estimatedReadMinutesSaved: clampInt(
      record.estimatedReadMinutesSaved,
      1,
      1000,
      2
    ),
    classification,
    urgencyLevel,
    detectedTone,
    requiresUserAction: Boolean(evalObj?.requiresUserAction ?? true),
    recommendedDisposition: clampStr(
      evalObj?.recommendedDisposition || "Review summary",
      200,
      "Review summary"
    ),
    evaluationRationale: clampStr(
      evalObj?.evaluationRationale || "Evaluated email content.",
      1000,
      "Evaluated email content."
    ),
    detectedSignals: sanitizedSignals,
    evaluationBases: sanitizedBases,
    criteriaBreakdown: sanitizedBreakdown,
    summaryBullets: sanitizedBullets,
    actionItems: sanitizeActionItems(record.actionItems),
    calendarEvents: sanitizeCalendarEvents(record.calendarEvents),
    attachmentsMeta: sanitizeAttachmentsMeta(record.attachments),
    workspaceNotes: clampStr(record.workspaceNotes || "", 15000, ""),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, docPayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFirestoreExtractionTasks(
  recordId: string,
  actionItems: ActionItem[]
): Promise<void> {
  const safeId = sanitizeId(recordId, "ext");
  const path = `extractions/${safeId}`;
  try {
    await updateDoc(doc(db, "extractions", safeId), {
      actionItems: sanitizeActionItems(actionItems),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreExtractionEvents(
  recordId: string,
  calendarEvents: CalendarEventItem[]
): Promise<void> {
  const safeId = sanitizeId(recordId, "ext");
  const path = `extractions/${safeId}`;
  try {
    await updateDoc(doc(db, "extractions", safeId), {
      calendarEvents: sanitizeCalendarEvents(calendarEvents),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreExtractionAttachments(
  recordId: string,
  attachments: EmailAttachmentItem[]
): Promise<void> {
  const safeId = sanitizeId(recordId, "ext");
  const path = `extractions/${safeId}`;
  try {
    await updateDoc(doc(db, "extractions", safeId), {
      attachmentsMeta: sanitizeAttachmentsMeta(attachments),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreExtractionSummary(
  recordId: string,
  documentTitle: string,
  summaryBullets: SummaryBullet[]
): Promise<void> {
  const safeId = sanitizeId(recordId, "ext");
  const path = `extractions/${safeId}`;
  const sanitizedBullets = sanitizeSummaryBullets(summaryBullets);

  try {
    await updateDoc(doc(db, "extractions", safeId), {
      documentTitle: clampStr(documentTitle, 300, "Extracted Document"),
      summaryBullets: sanitizedBullets,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreExtractionNotes(
  recordId: string,
  workspaceNotes: string
): Promise<void> {
  const safeId = sanitizeId(recordId, "ext");
  const path = `extractions/${safeId}`;
  try {
    await updateDoc(doc(db, "extractions", safeId), {
      workspaceNotes: clampStr(workspaceNotes, 15000, ""),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateFirestoreExtractionTranslation(
  recordId: string,
  payload: {
    documentTitle: string;
    summaryBullets: SummaryBullet[];
    actionItems: ActionItem[];
    calendarEvents: CalendarEventItem[];
    outputLanguage: string;
    recommendedDisposition: string;
    evaluationRationale: string;
    criteriaBreakdown?: EvaluationCriterionResult[];
  }
): Promise<void> {
  const safeId = sanitizeId(recordId, "ext");
  const path = `extractions/${safeId}`;
  const docData: Record<string, unknown> = {
    documentTitle: clampStr(payload.documentTitle, 300, "Extracted Document"),
    summaryBullets: sanitizeSummaryBullets(payload.summaryBullets),
    actionItems: sanitizeActionItems(payload.actionItems),
    calendarEvents: sanitizeCalendarEvents(payload.calendarEvents),
    outputLanguage: clampStr(payload.outputLanguage, 60, "English"),
    recommendedDisposition: clampStr(
      payload.recommendedDisposition,
      200,
      "Review summary"
    ),
    evaluationRationale: clampStr(
      payload.evaluationRationale,
      1000,
      "Evaluated email content."
    ),
    updatedAt: serverTimestamp(),
  };

  if (payload.criteriaBreakdown !== undefined) {
    docData.criteriaBreakdown = sanitizeCriteriaBreakdown(
      payload.criteriaBreakdown
    );
  }

  try {
    await updateDoc(doc(db, "extractions", safeId), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreExtraction(recordId: string): Promise<void> {
  const safeId = sanitizeId(recordId, "ext");
  const path = `extractions/${safeId}`;
  try {
    await deleteDoc(doc(db, "extractions", safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserExtractions(
  uid: string,
  onRecords: (records: ExtractionRecord[]) => void,
  onQuotaOrPermError?: (msg: string) => void
): Unsubscribe {
  const path = "extractions";
  const q = query(collection(db, path), where("ownerId", "==", uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const loaded: ExtractionRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        const attachmentsMeta = Array.isArray(d.attachmentsMeta)
          ? (d.attachmentsMeta as AttachmentMetaDoc[])
          : [];

        const rawActions = Array.isArray(d.actionItems)
          ? (d.actionItems as ActionItem[])
          : [];

        const hydratedActions: ActionItem[] = rawActions.map((item) => {
          const status = getTaskKanbanStatus(item);
          return {
            ...item,
            completed: status === "done",
            status,
          };
        });

        const rawUrgency = String(d.urgencyLevel || "");
        const urgencyLevel: UrgencyLevel | undefined =
          rawUrgency === "Urgent" ||
          rawUrgency === "Action Required" ||
          rawUrgency === "Informational"
            ? rawUrgency
            : undefined;

        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || uid),
          createdAtIso: String(d.createdAtIso || new Date().toISOString()),
          countryName: String(d.countryName || ""),
          timezone: String(d.timezone || "UTC"),
          sourceMode:
            d.sourceMode === "upload"
              ? InputSourceMode.UploadFile
              : d.sourceMode === "voice"
                ? InputSourceMode.VoiceNote
                : InputSourceMode.PasteText,
          sourceFileName: d.sourceFileName ? String(d.sourceFileName) : undefined,
          sourcePreview: String(d.sourcePreview || ""),
          sourceText:
            typeof d.sourceText === "string" && d.sourceText
              ? d.sourceText
              : undefined,
          detectedLanguage:
            typeof d.detectedLanguage === "string" && d.detectedLanguage
              ? d.detectedLanguage
              : undefined,
          outputLanguage:
            typeof d.outputLanguage === "string" && d.outputLanguage
              ? d.outputLanguage
              : undefined,
          documentTitle: String(d.documentTitle || "Extracted Document"),
          documentType: String(d.documentType || "Document"),
          senderOrSource: String(d.senderOrSource || ""),
          estimatedReadMinutesSaved: Number(d.estimatedReadMinutesSaved) || 2,
          mailEvaluation: {
            classification: (d.classification ||
              "Action Required") as MailClassification,
            urgencyLevel,
            detectedTone:
              typeof d.detectedTone === "string" && d.detectedTone
                ? d.detectedTone
                : undefined,
            requiresUserAction: Boolean(d.requiresUserAction ?? true),
            recommendedDisposition: String(d.recommendedDisposition || ""),
            evaluationRationale: String(d.evaluationRationale || ""),
            detectedSignals: Array.isArray(d.detectedSignals)
              ? d.detectedSignals.map((s: unknown) => String(s))
              : [],
            evaluationBases: Array.isArray(d.evaluationBases)
              ? d.evaluationBases.map((b: unknown) => String(b))
              : [],
            criteriaBreakdown: Array.isArray(d.criteriaBreakdown)
              ? (d.criteriaBreakdown as EvaluationCriterionResult[])
              : [],
          },
          summaryBullets: Array.isArray(d.summaryBullets)
            ? (d.summaryBullets as SummaryBullet[])
            : [],
          actionItems: hydratedActions,
          calendarEvents: Array.isArray(d.calendarEvents)
            ? (d.calendarEvents as CalendarEventItem[])
            : [],
          attachments: attachmentsMeta.map((att) => ({
            id: att.id,
            fileName: att.fileName,
            mimeType: att.mimeType,
            sizeBytes: att.sizeBytes > 0 ? att.sizeBytes : undefined,
            origin: att.origin,
            contextNote: att.contextNote,
          })),
          workspaceNotes: typeof d.workspaceNotes === "string" ? d.workspaceNotes : "",
        };
      });

      loaded.sort((a, b) =>
        (b.createdAtIso || "").localeCompare(a.createdAtIso || "")
      );
      onRecords(loaded);
    },
    (error) => {
      if (onQuotaOrPermError) {
        onQuotaOrPermError(error.message);
      }
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged structured FirestoreErrorInfo above
      }
    }
  );
}

// Email Drafts CRUD (/drafts/{draftId})
export async function saveFirestoreDraft(
  uid: string,
  draft: {
    id?: string;
    to: string;
    subject: string;
    body: string;
    formatType: string;
  },
  isExisting: boolean
): Promise<string> {
  const safeId = sanitizeId(draft.id || `draft-${Date.now()}`, "draft");
  const path = `drafts/${safeId}`;
  const docRef = doc(db, "drafts", safeId);
  const nowIso = new Date().toISOString();

  const sanitizedFields = {
    to: clampStr(draft.to, 300, ""),
    subject: clampStr(draft.subject, 300, "Untitled Draft"),
    body: clampStr(draft.body, 15000, " "),
    formatType: clampStr(draft.formatType, 60, "Formal"),
    updatedAtIso: nowIso,
  };

  if (isExisting) {
    try {
      await updateDoc(docRef, {
        ...sanitizedFields,
        updatedAt: serverTimestamp(),
      });
      return safeId;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }

  try {
    await setDoc(docRef, {
      ownerId: uid,
      ...sanitizedFields,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return safeId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteFirestoreDraft(draftId: string): Promise<void> {
  const safeId = sanitizeId(draftId, "draft");
  const path = `drafts/${safeId}`;
  try {
    await deleteDoc(doc(db, "drafts", safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function subscribeUserDrafts(
  uid: string,
  onDrafts: (drafts: EmailDraftRecord[]) => void
): Unsubscribe {
  const path = "drafts";
  const q = query(collection(db, path), where("ownerId", "==", uid));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: EmailDraftRecord[] = snapshot.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          ownerId: String(d.ownerId || uid),
          to: String(d.to || ""),
          subject: String(d.subject || "Untitled Draft"),
          body: String(d.body || ""),
          formatType: String(d.formatType || "Formal"),
          updatedAtIso: String(d.updatedAtIso || new Date().toISOString()),
        };
      });
      list.sort((a, b) =>
        (b.updatedAtIso || "").localeCompare(a.updatedAtIso || "")
      );
      onDrafts(list);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Logged structured FirestoreErrorInfo above
      }
    }
  );
}
