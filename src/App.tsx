/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CalendarPlus,
  CheckCircle2,
  FileCode2,
  FileJson,
  Globe,
  Layers,
  Loader2,
  LogOut,
  Moon,
  Puzzle,
  Sun,
  X,
} from "lucide-react";
import {
  ActionItem,
  CalendarEventItem,
  EmailAttachmentItem,
  EmailDraftRecord,
  EvaluationCriterionResult,
  ExtractionRecord,
  InputSourceMode,
  KanbanStatus,
  MailClassification,
  MailEvaluation,
  PriorityLevel,
  SummaryBullet,
  UploadedFilePayload,
  UrgencyLevel,
  UserProfileRecord,
  ViewTab,
  getTaskKanbanStatus,
} from "./types";
import {
  auth,
  createFirestoreExtraction,
  deleteFirestoreDraft,
  deleteFirestoreExtraction,
  ensureUserProfile,
  saveFirestoreDraft,
  signInWithGooglePopup,
  signOutCurrentUser,
  subscribeUserDrafts,
  subscribeUserExtractions,
  updateFirestoreExtractionAttachments,
  updateFirestoreExtractionEvents,
  updateFirestoreExtractionNotes,
  updateFirestoreExtractionSummary,
  updateFirestoreExtractionTasks,
  updateFirestoreExtractionTranslation,
  updateUserPreferences,
} from "./firebase";
import {
  ALL_COUNTRIES,
  CountryOption,
  detectDefaultCountry,
  getCountryByCode,
} from "./utils/countries";
import { AuthScreen } from "./components/AuthScreen";
import {
  EVALUATION_BASIS_OPTIONS,
  SourceInputPanel,
} from "./components/SourceInputPanel";
import { DraftsPanel } from "./components/DraftsPanel";
import {
  ExtractionResultView,
  ResultSubPane,
  UrgencyIndicator,
} from "./components/ExtractionResultView";
import { ActionQueueView } from "./components/ActionQueueView";
import { CalendarQueueView } from "./components/CalendarQueueView";
import { AttachmentsView } from "./components/AttachmentsView";
import { SavedDocsView } from "./components/SavedDocsView";
import { EmailFormatsModal } from "./components/EmailFormatsModal";
import { AutomationHubModal } from "./components/AutomationHubModal";
import {
  clearAllAttachmentPayloads,
  deleteAttachmentPayloads,
  saveAttachmentPayload,
} from "./utils/attachmentStore";
import {
  UrgentDueTaskMatch,
  findHighPriorityTasksDueWithin24h,
} from "./utils/urgentTaskDetector";
import { normalizeAudioMime } from "./utils/emlParser";
import {
  downloadBatchBundledIcs,
  downloadBatchConsolidatedJson,
  downloadBatchConsolidatedMarkdown,
} from "./utils/exporters";

const STORAGE_KEY_THEME = "distill_theme_v1";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function getLocalRecordsCacheKey(uid: string): string {
  return `distill_records_v2_${uid}`;
}

const VALID_CLASSIFICATIONS: MailClassification[] = [
  "Action Required",
  "Promotional / Marketing",
  "Newsletter / Digest",
  "Transactional / Receipt",
  "Informational / FYI",
  "Suspicious / Unsolicited",
];

function normalizePriority(val: unknown): PriorityLevel {
  if (val === "High" || val === "Medium" || val === "Low") return val;
  const s = String(val || "").toLowerCase();
  if (s.includes("high") || s.includes("urgent")) return "High";
  if (s.includes("low")) return "Low";
  return "Medium";
}

function normalizeClassification(val: unknown): MailClassification {
  if (
    typeof val === "string" &&
    VALID_CLASSIFICATIONS.includes(val as MailClassification)
  ) {
    return val as MailClassification;
  }
  const lower = String(val || "").toLowerCase();
  if (lower.includes("promo") || lower.includes("market")) {
    return "Promotional / Marketing";
  }
  if (lower.includes("news") || lower.includes("digest")) {
    return "Newsletter / Digest";
  }
  if (lower.includes("transact") || lower.includes("receipt")) {
    return "Transactional / Receipt";
  }
  if (
    lower.includes("suspicious") ||
    lower.includes("spam") ||
    lower.includes("phish")
  ) {
    return "Suspicious / Unsolicited";
  }
  if (lower.includes("info") || lower.includes("fyi")) {
    return "Informational / FYI";
  }
  return "Action Required";
}

function normalizeUrgencyLevel(
  val: unknown,
  classification: MailClassification
): UrgencyLevel {
  if (
    val === "Urgent" ||
    val === "Action Required" ||
    val === "Informational"
  ) {
    return val;
  }
  const lower = String(val || "").toLowerCase();
  if (
    lower.includes("urgent") ||
    lower.includes("critical") ||
    lower.includes("immediate")
  ) {
    return "Urgent";
  }
  if (
    lower.includes("info") ||
    lower.includes("fyi") ||
    lower.includes("low")
  ) {
    return "Informational";
  }
  if (lower.includes("action")) {
    return "Action Required";
  }
  if (
    classification === "Informational / FYI" ||
    classification === "Newsletter / Digest" ||
    classification === "Promotional / Marketing" ||
    classification === "Transactional / Receipt"
  ) {
    return "Informational";
  }
  return "Action Required";
}

function parseFirestoreErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (
    raw.toLowerCase().includes("quota exceeded") ||
    raw.toLowerCase().includes("resource-exhausted")
  ) {
    return "Cloud database quota reached. Your summaries remain cached locally in your browser.";
  }
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    if (parsed?.error) {
      if (
        parsed.error.toLowerCase().includes("quota exceeded") ||
        parsed.error.toLowerCase().includes("resource-exhausted")
      ) {
        return "Cloud database quota reached. Your summaries remain cached locally in your browser.";
      }
      return parsed.error;
    }
  } catch {
    // Non-JSON error string
  }
  return raw;
}

/**
 * Strips bulky base64/text payloads before saving metadata to localStorage
 * (full binary payloads live in IndexedDB so multi-MB PDFs/images never overflow localStorage).
 */
function stripLargeAttachmentPayloads(
  records: ExtractionRecord[]
): ExtractionRecord[] {
  return records.map((rec) => {
    const cappedSourceText = rec.sourceText
      ? rec.sourceText.slice(0, 25_000)
      : undefined;
    if (!rec.attachments || rec.attachments.length === 0) {
      return cappedSourceText !== rec.sourceText
        ? { ...rec, sourceText: cappedSourceText }
        : rec;
    }
    return {
      ...rec,
      sourceText: cappedSourceText,
      attachments: rec.attachments.map((att) => {
        const keepInline =
          (att.base64 ? att.base64.length : 0) +
            (att.textContent ? att.textContent.length : 0) <
          28_000;
        if (keepInline) return att;
        return {
          id: att.id,
          fileName: att.fileName,
          mimeType: att.mimeType,
          sizeBytes: att.sizeBytes,
          origin: att.origin,
          contextNote: att.contextNote,
        };
      }),
    };
  });
}

function prepareExtractionInputs(
  files: UploadedFilePayload[],
  trimmedText: string
): {
  textSegments: string[];
  inlineBinaryFiles: Array<{
    mimeType: string;
    base64: string;
    fileName: string;
  }>;
  hasAudioInput: boolean;
} {
  const textSegments: string[] = [];
  if (trimmedText) {
    textSegments.push(trimmedText);
  }

  const inlineBinaryFiles: Array<{
    mimeType: string;
    base64: string;
    fileName: string;
  }> = [];
  let hasAudioInput = false;

  const flatFiles: UploadedFilePayload[] = [];
  for (const f of files) {
    flatFiles.push(f);
    if (f.embeddedAttachments && f.embeddedAttachments.length > 0) {
      for (const emb of f.embeddedAttachments) {
        flatFiles.push(emb);
      }
    }
  }

  for (const f of flatFiles) {
    const lowerName = f.fileName.toLowerCase();
    const isDocx = f.mimeType === DOCX_MIME || lowerName.endsWith(".docx");
    const audioMime = normalizeAudioMime(f.mimeType, f.fileName);

    if (audioMime) {
      hasAudioInput = true;
    }

    if (f.extractedText && f.mimeType === "message/rfc822") {
      if (!trimmedText && textSegments.length === 0) {
        textSegments.push(f.extractedText);
      } else {
        textSegments.push(
          `--- Attached Email (${f.fileName}) ---\n${f.extractedText}`
        );
      }
    } else if (f.extractedText && (f.mimeType.startsWith("text/") || isDocx)) {
      textSegments.push(
        `--- Attached Document (${f.fileName}) ---\n${f.extractedText}`
      );
    } else if (
      f.base64 &&
      (isDocx ||
        Boolean(audioMime) ||
        ["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
          f.mimeType
        ))
    ) {
      inlineBinaryFiles.push({
        mimeType: isDocx ? DOCX_MIME : audioMime || f.mimeType,
        base64: f.base64,
        fileName: f.fileName,
      });
    }
  }

  return { textSegments, inlineBinaryFiles, hasAudioInput };
}

interface BuildRecordOptions {
  recordId?: string;
  ownerId?: string;
  countryName: string;
  timezone: string;
  sourceMode: InputSourceMode;
  uploadedFiles?: UploadedFilePayload[];
  fallbackSourceText?: string;
  fallbackSenderOrSource?: string;
  activeBases: string[];
  createdAtIso?: string;
}

function buildRecordFromExtractionData(
  data: Record<string, unknown>,
  options: BuildRecordOptions
): ExtractionRecord {
  const recordId =
    options.recordId ||
    `ext-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const files = options.uploadedFiles ?? [];

  const rawEval =
    (data.mailEvaluation as Record<string, unknown> | undefined) ?? {};
  const classification = normalizeClassification(rawEval.classification);
  const urgencyLevel = normalizeUrgencyLevel(
    rawEval.urgencyLevel,
    classification
  );
  const detectedToneRaw =
    typeof rawEval.detectedTone === "string"
      ? rawEval.detectedTone.trim()
      : "";

  const criteriaBreakdown: EvaluationCriterionResult[] = Array.isArray(
    rawEval.criteriaBreakdown
  )
    ? rawEval.criteriaBreakdown.map(
        (item: {
          criterion?: unknown;
          finding?: unknown;
          rating?: unknown;
        }) => ({
          criterion: String(item?.criterion || "Criterion"),
          finding: String(item?.finding || ""),
          rating: String(item?.rating || "Evaluated"),
        })
      )
    : [];

  const mailEvaluation: MailEvaluation = {
    classification,
    urgencyLevel,
    detectedTone: detectedToneRaw || "Formal",
    requiresUserAction:
      typeof rawEval.requiresUserAction === "boolean"
        ? rawEval.requiresUserAction
        : classification === "Action Required",
    recommendedDisposition: String(
      rawEval.recommendedDisposition || "Review extracted summary"
    ),
    evaluationRationale: String(
      rawEval.evaluationRationale ||
        "Evaluated message structure, sender cues, tone, and obligation language."
    ),
    detectedSignals: Array.isArray(rawEval.detectedSignals)
      ? rawEval.detectedSignals.map((s: unknown) => String(s))
      : [],
    evaluationBases:
      Array.isArray(rawEval.evaluationBases) &&
      rawEval.evaluationBases.length > 0
        ? rawEval.evaluationBases.map((b: unknown) => String(b))
        : options.activeBases,
    criteriaBreakdown,
  };

  const parsedBullets: SummaryBullet[] = Array.isArray(data.summaryBullets)
    ? data.summaryBullets
        .slice(0, 10)
        .map((b: { lead?: unknown; detail?: unknown }, idx: number) => ({
          lead: String(b?.lead || `Point ${idx + 1}`),
          detail: String(b?.detail || ""),
        }))
    : [];

  const summaryBullets: SummaryBullet[] =
    parsedBullets.length > 0
      ? parsedBullets
      : [
          {
            lead: "Core Summary",
            detail:
              "Reviewed source content with no additional bullet points returned.",
          },
        ];

  const actionItems: ActionItem[] = Array.isArray(data.actionItems)
    ? data.actionItems.map(
        (
          item: {
            title?: unknown;
            owner?: unknown;
            dueDateText?: unknown;
            dueDateIso?: unknown;
            priority?: unknown;
            sourceSnippet?: unknown;
          },
          idx: number
        ) => ({
          id: `${recordId}-task-${idx}`,
          title: String(item?.title || "Review item"),
          owner: String(item?.owner || "You"),
          dueDateText: String(item?.dueDateText || "No fixed deadline"),
          dueDateIso: String(item?.dueDateIso || ""),
          priority: normalizePriority(item?.priority),
          sourceSnippet: String(item?.sourceSnippet || ""),
          completed: false,
          status: "todo" as KanbanStatus,
        })
      )
    : [];

  const calendarEvents: CalendarEventItem[] = Array.isArray(data.calendarEvents)
    ? data.calendarEvents.map(
        (
          ev: {
            title?: unknown;
            eventType?: unknown;
            startIso?: unknown;
            endIso?: unknown;
            isAllDay?: unknown;
            location?: unknown;
            organizer?: unknown;
            attendees?: unknown[];
            description?: unknown;
            statusNote?: unknown;
          },
          idx: number
        ) => ({
          id: `${recordId}-ev-${idx}`,
          title: String(ev?.title || "Scheduled Event"),
          eventType: String(ev?.eventType || "Meeting"),
          startIso: String(ev?.startIso || ""),
          endIso: String(ev?.endIso || ""),
          isAllDay: Boolean(ev?.isAllDay),
          location: String(ev?.location || ""),
          organizer: String(ev?.organizer || ""),
          attendees: Array.isArray(ev?.attendees)
            ? ev.attendees.map((a) => String(a))
            : [],
          description: String(ev?.description || ""),
          statusNote: String(ev?.statusNote || ""),
        })
      )
    : [];

  const recordAttachments: EmailAttachmentItem[] = [];
  const uploadedNamesLower = new Set<string>();

  const allFiles: UploadedFilePayload[] = [];
  for (const f of files) {
    allFiles.push(f);
    if (f.embeddedAttachments && f.embeddedAttachments.length > 0) {
      for (const emb of f.embeddedAttachments) {
        allFiles.push(emb);
      }
    }
  }

  for (const f of allFiles) {
    if (f.mimeType === "message/rfc822") continue;
    uploadedNamesLower.add(f.fileName.toLowerCase());
    const attItem: EmailAttachmentItem = {
      id: `${recordId}-att-${f.id}`,
      fileName: f.fileName,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      origin: f.origin,
      contextNote:
        f.origin === "eml"
          ? "Extracted directly from .eml email attachment"
          : normalizeAudioMime(f.mimeType, f.fileName)
            ? "Voice note / audio recording processed via speech-to-text"
            : "Uploaded with document for extraction",
      base64: f.base64,
      textContent: f.extractedText,
    };
    recordAttachments.push(attItem);
    void saveAttachmentPayload({
      id: attItem.id,
      base64: f.base64,
      textContent: f.extractedText,
      mimeType: f.mimeType,
      fileName: f.fileName,
    });
  }

  if (Array.isArray(data.referencedAttachments)) {
    data.referencedAttachments.forEach(
      (
        ref: {
          fileName?: unknown;
          mimeHint?: unknown;
          contextNote?: unknown;
        },
        idx: number
      ) => {
        const name = String(ref?.fileName || "").trim();
        if (!name || uploadedNamesLower.has(name.toLowerCase())) return;
        recordAttachments.push({
          id: `${recordId}-ref-${idx}`,
          fileName: name,
          mimeType: String(ref?.mimeHint || "Document"),
          origin: "referenced",
          contextNote: String(ref?.contextNote || "Mentioned in source text"),
        });
      }
    );
  }

  const fullSourceText = String(
    data.resolvedSourceText || options.fallbackSourceText || ""
  )
    .trim()
    .slice(0, 30000);

  const detectedLanguage =
    typeof data.detectedLanguage === "string" && data.detectedLanguage.trim()
      ? data.detectedLanguage.trim()
      : undefined;
  const outputLanguage =
    typeof data.outputLanguage === "string" && data.outputLanguage.trim()
      ? data.outputLanguage.trim()
      : undefined;

  return {
    id: recordId,
    ownerId: options.ownerId,
    createdAtIso: options.createdAtIso || new Date().toISOString(),
    countryName: options.countryName,
    timezone: options.timezone,
    sourceMode: options.sourceMode,
    sourceFileName: files[0]?.fileName,
    sourcePreview:
      fullSourceText.slice(0, 280) ||
      files.map((f) => f.fileName).join(", ") ||
      "Extracted document",
    sourceText: fullSourceText || undefined,
    detectedLanguage,
    outputLanguage,
    documentTitle: String(
      data.documentTitle || files[0]?.fileName || "Extracted Document"
    ),
    documentType: String(data.documentType || "Document"),
    senderOrSource: String(
      data.senderOrSource || options.fallbackSenderOrSource || ""
    ),
    estimatedReadMinutesSaved: Math.max(
      1,
      Number(data.estimatedReadMinutesSaved) || 3
    ),
    mailEvaluation,
    summaryBullets,
    actionItems,
    calendarEvents,
    attachments: recordAttachments,
    workspaceNotes: "",
  };
}

export default function App() {
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfileRecord | null>(null);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ViewTab>(ViewTab.Workspace);
  const [resultSubPane, setResultSubPane] = useState<ResultSubPane>("overview");

  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_THEME);
      return saved === "dark";
    } catch {
      return false;
    }
  });

  // Country-only selection (every country name, zero city names)
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(
    detectDefaultCountry
  );
  const [summaryPointCount, setSummaryPointCount] = useState<number>(3);
  const [targetLanguage, setTargetLanguage] = useState<string>("Auto");

  // Batch Multi-File Processing State
  const [batchMode, setBatchMode] = useState<"separate" | "combined">(
    "separate"
  );
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
  } | null>(null);
  const [lastBatchIds, setLastBatchIds] = useState<string[]>([]);

  // Translation & Smart Automation Hub State
  const [isTranslatingRecord, setIsTranslatingRecord] =
    useState<boolean>(false);
  const [isAutomationOpen, setIsAutomationOpen] = useState<boolean>(false);
  const [pendingInboxCount, setPendingInboxCount] = useState<number>(0);
  const syncedWebhookIdsRef = useRef<Set<string>>(new Set());

  const [selectedEvaluationBases, setSelectedEvaluationBases] = useState<
    string[]
  >([
    EVALUATION_BASIS_OPTIONS[0].id,
    EVALUATION_BASIS_OPTIONS[1].id,
    EVALUATION_BASIS_OPTIONS[3].id,
    EVALUATION_BASIS_OPTIONS[4].id,
  ]);
  const [customEvaluationBasis, setCustomEvaluationBasis] =
    useState<string>("");

  const [sourceMode, setSourceMode] = useState<InputSourceMode>(
    InputSourceMode.PasteText
  );
  const [textValue, setTextValue] = useState<string>("");
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFilePayload[]>([]);
  const [focusHint, setFocusHint] = useState<string>("");
  const [isEmailFormatsOpen, setIsEmailFormatsOpen] = useState<boolean>(false);

  const [records, setRecords] = useState<ExtractionRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const userClearedActiveRef = useRef<boolean>(false);

  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // Email Draft Composer State
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftTo, setDraftTo] = useState<string>("");
  const [draftSubject, setDraftSubject] = useState<string>("");
  const [draftBody, setDraftBody] = useState<string>("");
  const [draftFormatStyle, setDraftFormatStyle] = useState<string>("Formal");
  const [draftNotes, setDraftNotes] = useState<string>("");
  const [draftReplyContext, setDraftReplyContext] = useState<string>("");
  const [isGeneratingDraft, setIsGeneratingDraft] = useState<boolean>(false);
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);
  const [savedDrafts, setSavedDrafts] = useState<EmailDraftRecord[]>([]);

  // Toast Notification Micro-Interaction + App Launch Urgent (<24h) Task Alert
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const [urgentDueMatches, setUrgentDueMatches] = useState<
    UrgentDueTaskMatch[]
  >([]);
  const urgentToastTimerRef = useRef<number | null>(null);
  const launchUrgentAlertedUidRef = useRef<string | null>(null);
  const selectedCountryTimezoneRef = useRef<string>(selectedCountry.timezone);
  selectedCountryTimezoneRef.current = selectedCountry.timezone;

  const workspaceToken = useMemo(() => {
    if (!currentUser) return "distill-guest";
    const cleanUid = currentUser.uid
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 12)
      .toLowerCase();
    return `distill-${cleanUid || "workspace"}`;
  }, [currentUser]);

  const dismissUrgentToast = useCallback(() => {
    setUrgentDueMatches([]);
    if (urgentToastTimerRef.current !== null) {
      window.clearTimeout(urgentToastTimerRef.current);
      urgentToastTimerRef.current = null;
    }
  }, []);

  const evaluateLaunchUrgentTasks = useCallback(
    (
      uid: string,
      candidateRecords: ExtractionRecord[],
      markLaunchCompleteIfEmpty: boolean
    ) => {
      if (launchUrgentAlertedUidRef.current === uid) {
        return;
      }
      const matches = findHighPriorityTasksDueWithin24h(
        candidateRecords,
        selectedCountryTimezoneRef.current
      );
      if (matches.length > 0) {
        launchUrgentAlertedUidRef.current = uid;
        setUrgentDueMatches(matches);
        if (urgentToastTimerRef.current !== null) {
          window.clearTimeout(urgentToastTimerRef.current);
        }
        urgentToastTimerRef.current = window.setTimeout(() => {
          setUrgentDueMatches([]);
          urgentToastTimerRef.current = null;
        }, 9500);
      } else if (markLaunchCompleteIfEmpty) {
        launchUrgentAlertedUidRef.current = uid;
      }
    },
    []
  );

  const notifyToast = useCallback((message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      if (urgentToastTimerRef.current !== null) {
        window.clearTimeout(urgentToastTimerRef.current);
      }
    };
  }, []);

  // Theme class sync
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_KEY_THEME, isDark ? "dark" : "light");
    } catch {
      // Ignore storage quota errors
    }
  }, [isDark]);

  // Listen to Firebase Auth state & sync local history cache + Firestore collections
  useEffect(() => {
    let unsubExtractions: (() => void) | null = null;
    let unsubDrafts: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubExtractions) {
        unsubExtractions();
        unsubExtractions = null;
      }
      if (unsubDrafts) {
        unsubDrafts();
        unsubDrafts = null;
      }

      setCurrentUser(user);
      setAuthReady(true);
      setSyncWarning(null);

      if (!user) {
        launchUrgentAlertedUidRef.current = null;
        dismissUrgentToast();
        setUserProfile(null);
        setRecords([]);
        setActiveRecordId(null);
        setSavedDrafts([]);
        setActiveDraftId(null);
        setLastBatchIds([]);
        setPendingInboxCount(0);
        return;
      }

      // 1. Privacy-First Local History Cache: Load immediately from browser localStorage
      try {
        const cachedRaw = localStorage.getItem(
          getLocalRecordsCacheKey(user.uid)
        );
        if (cachedRaw) {
          const parsed = JSON.parse(cachedRaw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cachedRecords = parsed as ExtractionRecord[];
            setRecords(cachedRecords);
            setActiveRecordId(
              (prev) => prev ?? (cachedRecords[0]?.id || null)
            );
            evaluateLaunchUrgentTasks(user.uid, cachedRecords, false);
          }
        }
      } catch {
        // Ignore localStorage parse errors
      }

      // 2. Ensure User Profile in Firestore
      void ensureUserProfile(user, selectedCountry, summaryPointCount)
        .then((profile) => {
          setUserProfile(profile);
          setSelectedCountry(getCountryByCode(profile.countryCode));
          setSummaryPointCount(profile.defaultSummaryPoints);
        })
        .catch((err) => {
          setSyncWarning(parseFirestoreErrorMessage(err));
        });

      // 3. Subscribe to Firestore Extractions & mirror into local browser cache
      unsubExtractions = subscribeUserExtractions(
        user.uid,
        (cloudRecords) => {
          setRecords((prev) => {
            const inlineAttachmentLookup = new Map<
              string,
              EmailAttachmentItem
            >();
            const localSourceTextLookup = new Map<string, string>();
            for (const existingRec of prev) {
              if (existingRec.sourceText) {
                localSourceTextLookup.set(
                  existingRec.id,
                  existingRec.sourceText
                );
              }
              for (const att of existingRec.attachments ?? []) {
                if (att.base64 || att.textContent) {
                  inlineAttachmentLookup.set(att.id, att);
                }
              }
            }

            const merged = cloudRecords.map((rec) => ({
              ...rec,
              sourceText: rec.sourceText || localSourceTextLookup.get(rec.id),
              attachments: (rec.attachments ?? []).map((att) => {
                const cachedInline = inlineAttachmentLookup.get(att.id);
                return cachedInline ? { ...att, ...cachedInline } : att;
              }),
            }));

            try {
              localStorage.setItem(
                getLocalRecordsCacheKey(user.uid),
                JSON.stringify(stripLargeAttachmentPayloads(merged))
              );
            } catch {
              // Ignore localStorage quota warnings
            }

            return merged;
          });

          setActiveRecordId((prevId) => {
            if (prevId && cloudRecords.some((r) => r.id === prevId)) {
              return prevId;
            }
            if (userClearedActiveRef.current) {
              return null;
            }
            return cloudRecords[0]?.id ?? null;
          });

          // Alert on launch if cloud records contain High-priority tasks due within 24h
          evaluateLaunchUrgentTasks(user.uid, cloudRecords, true);
        },
        (errMsg) => {
          setSyncWarning(parseFirestoreErrorMessage(errMsg));
        }
      );

      // 4. Subscribe to Firestore Email Drafts
      unsubDrafts = subscribeUserDrafts(user.uid, (drafts) => {
        setSavedDrafts(drafts);
      });
    });

    return () => {
      unsubAuth();
      if (unsubExtractions) unsubExtractions();
      if (unsubDrafts) unsubDrafts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist optimistic local updates to browser localStorage cache
  const persistLocalCache = useCallback(
    (nextRecords: ExtractionRecord[]) => {
      if (!currentUser) return;
      try {
        localStorage.setItem(
          getLocalRecordsCacheKey(currentUser.uid),
          JSON.stringify(stripLargeAttachmentPayloads(nextRecords))
        );
      } catch {
        // Ignore storage quota errors
      }
    },
    [currentUser]
  );

  const openRecordInWorkspace = useCallback(
    (
      recordId: string,
      pane: ResultSubPane = "overview"
    ) => {
      userClearedActiveRef.current = false;
      setActiveRecordId(recordId);
      setResultSubPane(pane);
      if (sourceMode === InputSourceMode.DraftEmail) {
        setSourceMode(InputSourceMode.PasteText);
      }
      setActiveTab(ViewTab.Workspace);
    },
    [sourceMode]
  );

  // Sync queued items from Direct Email Webhook or Companion Browser Extension
  const handleSyncWebhookInbox = useCallback(async (): Promise<number> => {
    if (!currentUser || !workspaceToken) return 0;

    try {
      const resp = await fetch(
        `/api/webhooks/inbox?token=${encodeURIComponent(workspaceToken)}`
      );
      if (!resp.ok) return 0;
      const payload = (await resp.json()) as {
        count?: number;
        items?: Array<{
          id: string;
          receivedAtIso: string;
          channel: "webhook" | "extension";
          sender: string;
          subject: string;
          extraction: Record<string, unknown>;
        }>;
      };

      const incomingItems = Array.isArray(payload.items) ? payload.items : [];
      if (incomingItems.length === 0) {
        setPendingInboxCount(0);
        return 0;
      }

      const freshItems = incomingItems.filter(
        (item) => !syncedWebhookIdsRef.current.has(item.id)
      );
      const ackIds = incomingItems.map((item) => item.id);

      await fetch("/api/webhooks/inbox/ack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: workspaceToken, ids: ackIds }),
      });

      setPendingInboxCount(0);

      if (freshItems.length === 0) return 0;

      const activeBases = [
        ...selectedEvaluationBases,
        ...(customEvaluationBasis.trim() ? [customEvaluationBasis.trim()] : []),
      ];

      const newSyncedRecords = freshItems.map((item, idx) => {
        syncedWebhookIdsRef.current.add(item.id);
        const safeId =
          item.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 96) ||
          `inbound-${Date.now()}-${idx}`;
        return buildRecordFromExtractionData(item.extraction ?? {}, {
          recordId: safeId,
          ownerId: currentUser.uid,
          countryName: selectedCountry.name,
          timezone: selectedCountry.timezone,
          sourceMode: InputSourceMode.PasteText,
          fallbackSenderOrSource: item.sender,
          activeBases,
          createdAtIso: item.receivedAtIso || new Date().toISOString(),
        });
      });

      setRecords((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const uniqueNew = newSyncedRecords.filter(
          (r) => !existingIds.has(r.id)
        );
        if (uniqueNew.length === 0) return prev;
        const next = [...uniqueNew, ...prev];
        persistLocalCache(next);
        return next;
      });

      if (newSyncedRecords[0]) {
        userClearedActiveRef.current = false;
        setActiveRecordId(newSyncedRecords[0].id);
        setResultSubPane("overview");
      }

      void Promise.allSettled(
        newSyncedRecords.map((rec) =>
          createFirestoreExtraction(currentUser.uid, rec)
        )
      ).then((results) => {
        const failed = results.find((r) => r.status === "rejected");
        if (failed && failed.status === "rejected") {
          setSyncWarning(parseFirestoreErrorMessage(failed.reason));
        }
      });

      notifyToast(
        `Synced ${newSyncedRecords.length} inbound ${
          newSyncedRecords.length === 1 ? "extraction" : "extractions"
        } to workspace`
      );
      return newSyncedRecords.length;
    } catch {
      return 0;
    }
  }, [
    currentUser,
    workspaceToken,
    selectedEvaluationBases,
    customEvaluationBasis,
    selectedCountry.name,
    selectedCountry.timezone,
    persistLocalCache,
    notifyToast,
  ]);

  // Background check for inbound webhook / browser extension clips
  useEffect(() => {
    if (!currentUser || !workspaceToken) return;

    const checkQueue = async () => {
      try {
        const resp = await fetch(
          `/api/webhooks/inbox?token=${encodeURIComponent(workspaceToken)}`
        );
        if (!resp.ok) return;
        const data = (await resp.json()) as { count?: number };
        const count = Number(data.count) || 0;
        if (count > 0) {
          if (isAutomationOpen) {
            setPendingInboxCount(count);
          } else {
            await handleSyncWebhookInbox();
          }
        } else {
          setPendingInboxCount(0);
        }
      } catch {
        // Ignore transient network errors
      }
    };

    void checkQueue();
    const intervalId = window.setInterval(() => {
      void checkQueue();
    }, 20_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentUser, workspaceToken, isAutomationOpen, handleSyncWebhookInbox]);

  const handleIngestDirectExtraction = useCallback(
    (
      rawExtraction: Record<string, unknown>,
      meta: {
        sourceLabel: string;
        sourceText: string;
        channel: "extension" | "webhook";
      }
    ) => {
      const activeBases = [
        ...selectedEvaluationBases,
        ...(customEvaluationBasis.trim() ? [customEvaluationBasis.trim()] : []),
      ];

      const newRecord = buildRecordFromExtractionData(rawExtraction, {
        ownerId: currentUser?.uid,
        countryName: selectedCountry.name,
        timezone: selectedCountry.timezone,
        sourceMode: InputSourceMode.PasteText,
        fallbackSourceText: meta.sourceText,
        fallbackSenderOrSource: meta.sourceLabel,
        activeBases,
      });

      userClearedActiveRef.current = false;
      setRecords((prev) => {
        const next = [newRecord, ...prev];
        persistLocalCache(next);
        return next;
      });
      setActiveRecordId(newRecord.id);
      setResultSubPane("overview");
      if (sourceMode === InputSourceMode.DraftEmail) {
        setSourceMode(InputSourceMode.PasteText);
      }
      setActiveTab(ViewTab.Workspace);
      setIsAutomationOpen(false);
      notifyToast(
        `Saved ${
          meta.channel === "extension" ? "extension clip" : "forwarded email"
        } to workspace`
      );

      if (currentUser) {
        void createFirestoreExtraction(currentUser.uid, newRecord).catch(
          (err) => setSyncWarning(parseFirestoreErrorMessage(err))
        );
      }
    },
    [
      selectedEvaluationBases,
      customEvaluationBasis,
      currentUser,
      selectedCountry.name,
      selectedCountry.timezone,
      persistLocalCache,
      sourceMode,
      notifyToast,
    ]
  );

  const activeRecord = useMemo(
    () => records.find((r) => r.id === activeRecordId) ?? null,
    [records, activeRecordId]
  );

  const recentBatchRecords = useMemo(() => {
    if (lastBatchIds.length < 2) return [];
    const idSet = new Set(lastBatchIds);
    return records.filter((r) => idSet.has(r.id));
  }, [records, lastBatchIds]);

  const aggregateStats = useMemo(() => {
    let openTasks = 0;
    let totalEvents = 0;
    let totalFiles = 0;
    let urgentDocs = 0;
    for (const r of records) {
      openTasks += r.actionItems.filter((t) => !t.completed).length;
      totalEvents += r.calendarEvents.length;
      totalFiles += (r.attachments ?? []).length;
      if (r.mailEvaluation?.urgencyLevel === "Urgent") {
        urgentDocs += 1;
      }
    }
    return { openTasks, totalEvents, totalFiles, urgentDocs };
  }, [records]);

  const handleAuthenticateWithGoogle = async () => {
    const user = await signInWithGooglePopup();
    const profile = await ensureUserProfile(
      user,
      selectedCountry,
      summaryPointCount
    );
    setUserProfile(profile);
    setSelectedCountry(getCountryByCode(profile.countryCode));
    setSummaryPointCount(profile.defaultSummaryPoints);
    notifyToast(`Signed in as ${profile.displayName}`);
  };

  const handleSignOut = async () => {
    await signOutCurrentUser();
    notifyToast("Signed out");
  };

  const handleCountryChange = (countryCode: string) => {
    const nextCountry = getCountryByCode(countryCode);
    setSelectedCountry(nextCountry);
    notifyToast(`Country set to ${nextCountry.name}`);
    if (currentUser) {
      void updateUserPreferences(currentUser.uid, {
        country: nextCountry,
      }).catch((err) => setSyncWarning(parseFirestoreErrorMessage(err)));
    }
  };

  const handleSummaryPointsChange = (points: number) => {
    const clamped = Math.min(10, Math.max(1, Math.round(points)));
    setSummaryPointCount(clamped);
    if (currentUser) {
      void updateUserPreferences(currentUser.uid, {
        defaultSummaryPoints: clamped,
      }).catch((err) => setSyncWarning(parseFirestoreErrorMessage(err)));
    }
  };

  const handleToggleEvaluationBasis = (basisId: string) => {
    setSelectedEvaluationBases((prev) => {
      if (prev.includes(basisId)) {
        if (prev.length === 1) return prev; // Keep at least 1 active basis
        return prev.filter((b) => b !== basisId);
      }
      return [...prev, basisId];
    });
  };

  const handleStartNewExtraction = () => {
    userClearedActiveRef.current = true;
    setActiveTab(ViewTab.Workspace);
    setResultSubPane("overview");
    setExtractError(null);
    setActiveRecordId(null);
    setLastBatchIds([]);
    setUploadedFiles([]);
    setTextValue("");
    setSourceMode(InputSourceMode.PasteText);
  };

  const handleExtract = async () => {
    setExtractError(null);

    const trimmedText = textValue.trim();
    const hasUploaded = uploadedFiles.length > 0;

    // Automated Data Validation before calling backend
    if (!hasUploaded && !trimmedText) {
      setExtractError(
        sourceMode === InputSourceMode.VoiceNote
          ? "Record a voice note or upload an audio file (.mp3, .wav, .m4a, .webm, .ogg) before running extraction."
          : "Please paste an email or notice, or upload a document (.pdf, .docx, image scan, audio note, .eml, or .txt) before running extraction."
      );
      return;
    }

    if (!hasUploaded && trimmedText.length < 10) {
      setExtractError(
        "The input text is too short to evaluate meaningfully. Please enter at least a complete sentence, transcript, or email body."
      );
      return;
    }

    setIsExtracting(true);
    userClearedActiveRef.current = false;

    const activeBases = [
      ...selectedEvaluationBases,
      ...(customEvaluationBasis.trim() ? [customEvaluationBasis.trim()] : []),
    ];

    try {
      // Multi-File Concurrent Batch Extraction (when 2+ files are uploaded in "Separate Docs" mode)
      const isSeparateBatch =
        sourceMode === InputSourceMode.UploadFile &&
        uploadedFiles.length > 1 &&
        batchMode === "separate";

      if (isSeparateBatch) {
        const total = uploadedFiles.length;
        setBatchProgress({ completed: 0, total });
        const orderedResults: Array<ExtractionRecord | null> = new Array(
          total
        ).fill(null);
        const fileErrors: string[] = [];

        let cursor = 0;
        let finishedCount = 0;
        const concurrency = Math.min(3, total);

        const runWorker = async () => {
          while (true) {
            const currentIndex = cursor;
            cursor += 1;
            if (currentIndex >= total) break;

            const singleFile = uploadedFiles[currentIndex];
            try {
              const {
                textSegments,
                inlineBinaryFiles,
                hasAudioInput,
              } = prepareExtractionInputs([singleFile], trimmedText);

              const payload = {
                text:
                  textSegments.length > 0
                    ? textSegments.join("\n\n")
                    : undefined,
                fileDataList:
                  inlineBinaryFiles.length > 0 ? inlineBinaryFiles : undefined,
                referenceDateIso: new Date().toISOString(),
                timezone: selectedCountry.timezone,
                countryName: selectedCountry.name,
                summaryPointCount,
                evaluationBases: activeBases,
                focusHint: focusHint.trim() || undefined,
                targetLanguage:
                  targetLanguage !== "Auto" ? targetLanguage : undefined,
              };

              const response = await fetch("/api/extract", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              });
              const data = (await response.json()) as Record<string, unknown>;
              if (!response.ok) {
                throw new Error(
                  String(
                    data?.error ||
                      `Failed to extract ${singleFile.fileName} (${response.status}).`
                  )
                );
              }

              const recId = `ext-${Date.now()}-${currentIndex}-${Math.random()
                .toString(36)
                .slice(2, 5)}`;

              orderedResults[currentIndex] = buildRecordFromExtractionData(
                data,
                {
                  recordId: recId,
                  ownerId: currentUser?.uid,
                  countryName: selectedCountry.name,
                  timezone: selectedCountry.timezone,
                  sourceMode: hasAudioInput
                    ? InputSourceMode.VoiceNote
                    : InputSourceMode.UploadFile,
                  uploadedFiles: [singleFile],
                  fallbackSourceText: textSegments.join("\n\n"),
                  activeBases,
                }
              );
            } catch (fileErr) {
              fileErrors.push(
                `${singleFile.fileName}: ${
                  fileErr instanceof Error ? fileErr.message : "Failed"
                }`
              );
            } finally {
              finishedCount += 1;
              setBatchProgress({ completed: finishedCount, total });
            }
          }
        };

        await Promise.all(
          Array.from({ length: concurrency }, () => runWorker())
        );

        const createdRecords = orderedResults.filter(
          (r): r is ExtractionRecord => r !== null
        );

        if (createdRecords.length === 0) {
          throw new Error(
            fileErrors[0] || "Batch extraction could not process the uploaded files."
          );
        }

        setRecords((prev) => {
          const next = [...createdRecords, ...prev];
          persistLocalCache(next);
          return next;
        });
        setLastBatchIds(createdRecords.map((r) => r.id));
        setActiveRecordId(createdRecords[0].id);
        setResultSubPane("overview");

        const totalBatchTasks = createdRecords.reduce(
          (sum, r) => sum + r.actionItems.length,
          0
        );
        const totalBatchEvents = createdRecords.reduce(
          (sum, r) => sum + r.calendarEvents.length,
          0
        );
        notifyToast(
          `Batch extracted ${createdRecords.length} docs · ${totalBatchTasks} tasks · ${totalBatchEvents} events`
        );

        if (fileErrors.length > 0) {
          setExtractError(
            `Processed ${createdRecords.length} of ${total} files. Skipped: ${fileErrors.join(
              " | "
            )}`
          );
        }

        if (currentUser) {
          void Promise.allSettled(
            createdRecords.map((rec) =>
              createFirestoreExtraction(currentUser.uid, rec)
            )
          ).then((results) => {
            const rejected = results.find((r) => r.status === "rejected");
            if (rejected && rejected.status === "rejected") {
              setSyncWarning(parseFirestoreErrorMessage(rejected.reason));
            }
          });
        }
        return;
      }

      // Single or Combined Brief Extraction
      setLastBatchIds([]);
      const { textSegments, inlineBinaryFiles, hasAudioInput } =
        prepareExtractionInputs(uploadedFiles, trimmedText);

      const payload = {
        text: textSegments.length > 0 ? textSegments.join("\n\n") : undefined,
        fileDataList:
          inlineBinaryFiles.length > 0 ? inlineBinaryFiles : undefined,
        referenceDateIso: new Date().toISOString(),
        timezone: selectedCountry.timezone,
        countryName: selectedCountry.name,
        summaryPointCount,
        evaluationBases: activeBases,
        focusHint: focusHint.trim() || undefined,
        targetLanguage: targetLanguage !== "Auto" ? targetLanguage : undefined,
      };

      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(
          String(
            data?.error || `Extraction failed with status ${response.status}.`
          )
        );
      }

      const resolvedSourceMode =
        sourceMode === InputSourceMode.VoiceNote || hasAudioInput
          ? InputSourceMode.VoiceNote
          : sourceMode === InputSourceMode.UploadFile
            ? InputSourceMode.UploadFile
            : InputSourceMode.PasteText;

      const newRecord = buildRecordFromExtractionData(data, {
        ownerId: currentUser?.uid,
        countryName: selectedCountry.name,
        timezone: selectedCountry.timezone,
        sourceMode: resolvedSourceMode,
        uploadedFiles,
        fallbackSourceText:
          textSegments.length > 0 ? textSegments.join("\n\n") : trimmedText,
        activeBases,
      });

      setRecords((prev) => {
        const next = [newRecord, ...prev];
        persistLocalCache(next);
        return next;
      });
      setActiveRecordId(newRecord.id);
      setResultSubPane("overview");
      notifyToast(
        `Extracted ${newRecord.summaryBullets.length}-point summary · ${newRecord.actionItems.length} tasks`
      );

      if (currentUser) {
        void createFirestoreExtraction(currentUser.uid, newRecord).catch(
          (err) => setSyncWarning(parseFirestoreErrorMessage(err))
        );
      }
    } catch (err) {
      setExtractError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during extraction."
      );
    } finally {
      setIsExtracting(false);
      setBatchProgress(null);
    }
  };

  // Multi-Language Auto-Translation Handler for Existing Extractions
  const handleTranslateRecord = async (
    recordId: string,
    nextLanguage: string
  ): Promise<void> => {
    const targetRec = records.find((r) => r.id === recordId);
    if (!targetRec || !nextLanguage || nextLanguage === "Auto") return;

    setExtractError(null);
    setIsTranslatingRecord(true);
    try {
      const response = await fetch("/api/translate-record", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetLanguage: nextLanguage,
          documentTitle: targetRec.documentTitle,
          recommendedDisposition:
            targetRec.mailEvaluation?.recommendedDisposition || "",
          evaluationRationale:
            targetRec.mailEvaluation?.evaluationRationale || "",
          summaryBullets: targetRec.summaryBullets,
          actionItems: targetRec.actionItems,
          calendarEvents: targetRec.calendarEvents,
          criteriaBreakdown:
            targetRec.mailEvaluation?.criteriaBreakdown ?? [],
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        outputLanguage?: string;
        documentTitle?: string;
        recommendedDisposition?: string;
        evaluationRationale?: string;
        summaryBullets?: SummaryBullet[];
        actionItems?: ActionItem[];
        calendarEvents?: CalendarEventItem[];
        criteriaBreakdown?: EvaluationCriterionResult[];
      };

      if (!response.ok) {
        throw new Error(data.error || "Could not translate this brief.");
      }

      const nextDocTitle = data.documentTitle || targetRec.documentTitle;
      const nextBullets =
        data.summaryBullets && data.summaryBullets.length > 0
          ? data.summaryBullets
          : targetRec.summaryBullets;
      const nextActions =
        data.actionItems && data.actionItems.length > 0
          ? data.actionItems
          : targetRec.actionItems;
      const nextEvents =
        data.calendarEvents && data.calendarEvents.length > 0
          ? data.calendarEvents
          : targetRec.calendarEvents;
      const nextOutLang = data.outputLanguage || nextLanguage;
      const nextDisposition =
        data.recommendedDisposition ||
        targetRec.mailEvaluation?.recommendedDisposition ||
        "Review summary";
      const nextRationale =
        data.evaluationRationale ||
        targetRec.mailEvaluation?.evaluationRationale ||
        "";
      const nextCriteria =
        data.criteriaBreakdown ??
        targetRec.mailEvaluation?.criteriaBreakdown ??
        [];

      setRecords((prev) => {
        const next = prev.map((rec) => {
          if (rec.id !== recordId) return rec;
          return {
            ...rec,
            documentTitle: nextDocTitle,
            outputLanguage: nextOutLang,
            summaryBullets: nextBullets,
            actionItems: nextActions,
            calendarEvents: nextEvents,
            mailEvaluation: rec.mailEvaluation
              ? {
                  ...rec.mailEvaluation,
                  recommendedDisposition: nextDisposition,
                  evaluationRationale: nextRationale,
                  criteriaBreakdown: nextCriteria,
                }
              : undefined,
          };
        });
        persistLocalCache(next);
        return next;
      });

      notifyToast(`Translated brief into ${nextOutLang}`);

      if (currentUser) {
        void updateFirestoreExtractionTranslation(recordId, {
          documentTitle: nextDocTitle,
          summaryBullets: nextBullets,
          actionItems: nextActions,
          calendarEvents: nextEvents,
          outputLanguage: nextOutLang,
          recommendedDisposition: nextDisposition,
          evaluationRationale: nextRationale,
          criteriaBreakdown: nextCriteria,
        }).catch((err) => setSyncWarning(parseFirestoreErrorMessage(err)));
      }
    } catch (err) {
      setExtractError(
        err instanceof Error
          ? err.message
          : "Translation failed. Please try again."
      );
    } finally {
      setIsTranslatingRecord(false);
    }
  };

  // Draft Email Handlers
  const handleNewDraft = () => {
    setActiveDraftId(null);
    setDraftTo("");
    setDraftSubject("");
    setDraftBody("");
    setDraftNotes("");
    setDraftReplyContext("");
  };

  const handleGenerateDraft = async () => {
    setExtractError(null);
    const notesOrBody = draftNotes.trim() || draftBody.trim();
    if (!notesOrBody && !draftReplyContext.trim()) {
      setExtractError(
        "Enter key points or instructions in the Draft Email composer before generating."
      );
      return;
    }

    setIsGeneratingDraft(true);
    try {
      const response = await fetch("/api/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: draftTo.trim(),
          subjectHint: draftSubject.trim(),
          intentOrNotes: notesOrBody,
          formatStyle: draftFormatStyle,
          replyContext: draftReplyContext.trim(),
          senderName:
            userProfile?.displayName || currentUser?.displayName || "",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || "Failed to generate email draft.");
      }

      if (data.subject) setDraftSubject(String(data.subject));
      if (data.body) setDraftBody(String(data.body));
      notifyToast(`Generated ${draftFormatStyle} email draft`);
    } catch (err) {
      setExtractError(
        err instanceof Error ? err.message : "Could not generate email draft."
      );
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!currentUser) return;
    if (!draftSubject.trim() && !draftBody.trim()) {
      setExtractError("Add a subject or message body before saving a draft.");
      return;
    }

    setIsSavingDraft(true);
    try {
      const isExisting = Boolean(
        activeDraftId && savedDrafts.some((d) => d.id === activeDraftId)
      );
      const savedId = await saveFirestoreDraft(
        currentUser.uid,
        {
          id: activeDraftId ?? undefined,
          to: draftTo,
          subject: draftSubject || "Untitled Draft",
          body: draftBody || " ",
          formatType: draftFormatStyle,
        },
        isExisting
      );
      setActiveDraftId(savedId);
      notifyToast("Email draft saved");
    } catch (err) {
      setSyncWarning(parseFirestoreErrorMessage(err));
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSelectDraft = (draft: EmailDraftRecord) => {
    setActiveDraftId(draft.id);
    setDraftTo(draft.to);
    setDraftSubject(draft.subject);
    setDraftBody(draft.body);
    setDraftFormatStyle(draft.formatType || "Formal");
    setSourceMode(InputSourceMode.DraftEmail);
    setActiveTab(ViewTab.Workspace);
  };

  const handleDeleteDraft = (draftId: string) => {
    if (activeDraftId === draftId) {
      handleNewDraft();
    }
    void deleteFirestoreDraft(draftId)
      .then(() => notifyToast("Draft deleted"))
      .catch((err) => setSyncWarning(parseFirestoreErrorMessage(err)));
  };

  const handleDraftReply = (record: ExtractionRecord) => {
    setActiveDraftId(null);
    setDraftTo(record.senderOrSource || "");
    const cleanTitle = record.documentTitle || "Message";
    setDraftSubject(
      cleanTitle.toLowerCase().startsWith("re:")
        ? cleanTitle
        : `Re: ${cleanTitle}`
    );
    const contextLines = [
      `Original Document: ${cleanTitle}`,
      record.senderOrSource ? `Sender: ${record.senderOrSource}` : "",
      "Extracted Summary:",
      ...record.summaryBullets.map((b) => `- ${b.lead}: ${b.detail}`),
    ]
      .filter(Boolean)
      .join("\n");
    setDraftReplyContext(contextLines);
    setDraftNotes(
      record.actionItems.length > 0
        ? `Confirm receipt and respond to: ${record.actionItems
            .slice(0, 3)
            .map((a) => a.title)
            .join("; ")}`
        : "Acknowledge the message and provide a clear, concise response."
    );
    setDraftBody("");
    setSourceMode(InputSourceMode.DraftEmail);
    setActiveTab(ViewTab.Workspace);
    notifyToast("Loaded reply context into Draft Email composer");
  };

  // Record Mutation Handlers (Optimistic Local + Firestore Persistence)
  const handleAttachFileToRecord = (
    recordId: string,
    attachment: EmailAttachmentItem
  ) => {
    void saveAttachmentPayload({
      id: attachment.id,
      base64: attachment.base64,
      textContent: attachment.textContent,
      mimeType: attachment.mimeType,
      fileName: attachment.fileName,
    });

    let updatedAttachments: EmailAttachmentItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        const existing = rec.attachments ?? [];
        const filteredExisting = existing.filter(
          (a) =>
            !(
              a.origin === "referenced" &&
              a.fileName.toLowerCase() === attachment.fileName.toLowerCase()
            )
        );
        updatedAttachments = [attachment, ...filteredExisting];
        return {
          ...rec,
          attachments: updatedAttachments,
        };
      });
      persistLocalCache(next);
      return next;
    });

    notifyToast(`Attached ${attachment.fileName}`);
    if (currentUser && updatedAttachments) {
      void updateFirestoreExtractionAttachments(
        recordId,
        updatedAttachments
      ).catch((err) => setSyncWarning(parseFirestoreErrorMessage(err)));
    }
  };

  const handleToggleTask = (recordId: string, taskId: string) => {
    let updatedTasks: ActionItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        updatedTasks = rec.actionItems.map((t) => {
          if (t.id !== taskId) return t;
          const nextCompleted = !t.completed;
          const nextStatus: KanbanStatus = nextCompleted
            ? "done"
            : t.status === "in_progress"
              ? "in_progress"
              : "todo";
          return {
            ...t,
            completed: nextCompleted,
            status: nextStatus,
          };
        });
        return {
          ...rec,
          actionItems: updatedTasks,
        };
      });
      persistLocalCache(next);
      return next;
    });

    if (currentUser && updatedTasks) {
      void updateFirestoreExtractionTasks(recordId, updatedTasks).catch((err) =>
        setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleUpdateTaskStatus = (
    recordId: string,
    taskId: string,
    status: KanbanStatus
  ) => {
    let updatedTasks: ActionItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        updatedTasks = rec.actionItems.map((t) =>
          t.id === taskId
            ? {
                ...t,
                status,
                completed: status === "done",
              }
            : t
        );
        return {
          ...rec,
          actionItems: updatedTasks,
        };
      });
      persistLocalCache(next);
      return next;
    });

    const stageLabel =
      status === "done"
        ? "Done"
        : status === "in_progress"
          ? "In Progress"
          : "To Do";
    notifyToast(`Moved task to ${stageLabel}`);

    if (currentUser && updatedTasks) {
      void updateFirestoreExtractionTasks(recordId, updatedTasks).catch((err) =>
        setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleUpdateTask = (recordId: string, updated: ActionItem) => {
    const resolvedStatus: KanbanStatus = updated.completed
      ? "done"
      : getTaskKanbanStatus(updated) === "done"
        ? "todo"
        : getTaskKanbanStatus(updated);
    const normalizedTask: ActionItem = {
      ...updated,
      status: resolvedStatus,
      completed: resolvedStatus === "done",
    };

    let updatedTasks: ActionItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        updatedTasks = rec.actionItems.map((t) =>
          t.id === normalizedTask.id ? normalizedTask : t
        );
        return {
          ...rec,
          actionItems: updatedTasks,
        };
      });
      persistLocalCache(next);
      return next;
    });

    notifyToast("Task updated");
    if (currentUser && updatedTasks) {
      void updateFirestoreExtractionTasks(recordId, updatedTasks).catch((err) =>
        setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleAddTask = (recordId: string, task: ActionItem) => {
    const normalizedTask: ActionItem = {
      ...task,
      status: task.status ?? (task.completed ? "done" : "todo"),
      completed: (task.status ?? (task.completed ? "done" : "todo")) === "done",
    };

    let updatedTasks: ActionItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        updatedTasks = [...rec.actionItems, normalizedTask];
        return {
          ...rec,
          actionItems: updatedTasks,
        };
      });
      persistLocalCache(next);
      return next;
    });

    notifyToast("Task added");
    if (currentUser && updatedTasks) {
      void updateFirestoreExtractionTasks(recordId, updatedTasks).catch((err) =>
        setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleDeleteTask = (recordId: string, taskId: string) => {
    let updatedTasks: ActionItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        updatedTasks = rec.actionItems.filter((t) => t.id !== taskId);
        return {
          ...rec,
          actionItems: updatedTasks,
        };
      });
      persistLocalCache(next);
      return next;
    });

    notifyToast("Task removed");
    if (currentUser && updatedTasks) {
      void updateFirestoreExtractionTasks(recordId, updatedTasks).catch((err) =>
        setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleUpdateEvent = (recordId: string, updated: CalendarEventItem) => {
    let updatedEvents: CalendarEventItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        updatedEvents = rec.calendarEvents.map((ev) =>
          ev.id === updated.id ? updated : ev
        );
        return {
          ...rec,
          calendarEvents: updatedEvents,
        };
      });
      persistLocalCache(next);
      return next;
    });

    notifyToast("Calendar invite updated");
    if (currentUser && updatedEvents) {
      void updateFirestoreExtractionEvents(recordId, updatedEvents).catch(
        (err) => setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleAddEvent = (recordId: string, event: CalendarEventItem) => {
    let updatedEvents: CalendarEventItem[] | null = null;
    setRecords((prev) => {
      const next = prev.map((rec) => {
        if (rec.id !== recordId) return rec;
        updatedEvents = [...rec.calendarEvents, event];
        return {
          ...rec,
          calendarEvents: updatedEvents,
        };
      });
      persistLocalCache(next);
      return next;
    });

    notifyToast("Calendar invite added");
    if (currentUser && updatedEvents) {
      void updateFirestoreExtractionEvents(recordId, updatedEvents).catch(
        (err) => setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleUpdateSummary = (
    recordId: string,
    documentTitle: string,
    summaryBullets: SummaryBullet[]
  ) => {
    setRecords((prev) => {
      const next = prev.map((rec) =>
        rec.id === recordId
          ? { ...rec, documentTitle, summaryBullets }
          : rec
      );
      persistLocalCache(next);
      return next;
    });

    notifyToast("Summary saved");
    if (currentUser) {
      void updateFirestoreExtractionSummary(
        recordId,
        documentTitle,
        summaryBullets
      ).catch((err) => setSyncWarning(parseFirestoreErrorMessage(err)));
    }
  };

  const handleUpdateNotes = (recordId: string, workspaceNotes: string) => {
    setRecords((prev) => {
      const next = prev.map((rec) =>
        rec.id === recordId ? { ...rec, workspaceNotes } : rec
      );
      persistLocalCache(next);
      return next;
    });

    if (currentUser) {
      void updateFirestoreExtractionNotes(recordId, workspaceNotes).catch(
        (err) => setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleDeleteRecord = (recordId: string) => {
    const target = records.find((r) => r.id === recordId);
    if (target?.attachments && target.attachments.length > 0) {
      void deleteAttachmentPayloads(target.attachments.map((a) => a.id));
    }
    setLastBatchIds((prev) => prev.filter((id) => id !== recordId));
    setRecords((prev) => {
      const remaining = prev.filter((r) => r.id !== recordId);
      if (activeRecordId === recordId) {
        setActiveRecordId(remaining[0]?.id ?? null);
      }
      persistLocalCache(remaining);
      return remaining;
    });

    notifyToast("Document deleted");
    if (currentUser) {
      void deleteFirestoreExtraction(recordId).catch((err) =>
        setSyncWarning(parseFirestoreErrorMessage(err))
      );
    }
  };

  const handleClearAllRecords = () => {
    const idsToDelete = records.map((r) => r.id);
    void clearAllAttachmentPayloads();
    setRecords([]);
    setActiveRecordId(null);
    setLastBatchIds([]);
    persistLocalCache([]);

    notifyToast("Cleared all saved documents");
    if (currentUser && idsToDelete.length > 0) {
      void Promise.allSettled(
        idsToDelete.map((id) => deleteFirestoreExtraction(id))
      );
    }
  };

  // Loading state while verifying initial Firebase Auth session
  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2.5 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
          <span>Loading workspace...</span>
        </div>
      </div>
    );
  }

  // Require User Login / Sign Up
  if (!currentUser) {
    return (
      <AuthScreen
        isDark={isDark}
        onToggleTheme={() => setIsDark((prev) => !prev)}
        selectedCountry={selectedCountry}
        onSelectCountry={setSelectedCountry}
        defaultSummaryPoints={summaryPointCount}
        onChangeDefaultSummaryPoints={setSummaryPointCount}
        onAuthenticateWithGoogle={handleAuthenticateWithGoogle}
      />
    );
  }

  const navItems: Array<{ tab: ViewTab; label: string }> = [
    { tab: ViewTab.Workspace, label: "Workspace" },
    { tab: ViewTab.ActionQueue, label: "Action Queue" },
    { tab: ViewTab.CalendarInvites, label: "Calendar Invites" },
    { tab: ViewTab.Attachments, label: "Attachments" },
    { tab: ViewTab.SavedDocs, label: "Saved Docs" },
  ];

  const displayAccountName =
    userProfile?.displayName ||
    currentUser.displayName ||
    currentUser.email?.split("@")[0] ||
    "Account";

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Strict 3-Zone Top Bar Contract (Brand — 5 Nav Links — 1 Primary Action) */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-8">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab(ViewTab.Workspace)}
            className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Distill
          </button>

          {/* Zone 2: 5 clean single-line text navigation links */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-6 text-sm font-medium"
          >
            {navItems.map(({ tab, label }) => {
              const isActive = activeTab === tab;
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer border-b-2 ${
                    isActive
                      ? "border-blue-600 text-slate-900 dark:text-slate-100"
                      : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleStartNewExtraction}
              className="px-4 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              New Extraction
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Workspace Context & Preferences Toolbar */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white/75 dark:bg-slate-900/75">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 overflow-x-auto">
            <div className="flex md:hidden items-center gap-4 text-xs font-medium">
              {navItems.map(({ tab, label }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`py-1 whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tab
                      ? "text-blue-600 dark:text-blue-400 font-semibold"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{records.length} saved docs</span>
              <span aria-hidden="true">·</span>
              <span>{aggregateStats.openTasks} open tasks</span>
              <span aria-hidden="true">·</span>
              <span>{aggregateStats.totalEvents} calendar invites</span>
              <span aria-hidden="true">·</span>
              <span>{aggregateStats.totalFiles} files</span>
              {aggregateStats.urgentDocs > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-red-700 dark:text-red-400 font-medium">
                    {aggregateStats.urgentDocs} urgent
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 ml-auto">
            <button
              type="button"
              onClick={() => setIsAutomationOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
            >
              <Puzzle className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>
                Automation
                {pendingInboxCount > 0 ? ` (${pendingInboxCount})` : ""}
              </span>
            </button>

            <span
              aria-hidden="true"
              className="text-slate-300 dark:text-slate-700 text-xs"
            >
              |
            </span>

            <button
              type="button"
              onClick={() => setIsEmailFormatsOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Email Formats</span>
            </button>

            <span
              aria-hidden="true"
              className="text-slate-300 dark:text-slate-700 text-xs"
            >
              |
            </span>

            {/* Country Selector — Every Country Name Only, Zero City Names */}
            <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <label htmlFor="workspace-country-select" className="sr-only">
                Country
              </label>
              <select
                id="workspace-country-select"
                value={selectedCountry.code}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="max-w-[165px] bg-transparent text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer truncate"
              >
                {ALL_COUNTRIES.map((country) => (
                  <option
                    key={country.code}
                    value={country.code}
                    className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    {country.name}
                  </option>
                ))}
              </select>
            </div>

            <span
              aria-hidden="true"
              className="text-slate-300 dark:text-slate-700 text-xs"
            >
              |
            </span>

            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={
                isDark ? "Switch to light theme" : "Switch to dark theme"
              }
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {isDark ? (
                <>
                  <Sun className="w-3.5 h-3.5" />
                  <span>Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5" />
                  <span>Dark</span>
                </>
              )}
            </button>

            <span
              aria-hidden="true"
              className="text-slate-300 dark:text-slate-700 text-xs"
            >
              |
            </span>

            <div className="inline-flex items-center gap-2 text-xs">
              <span className="text-slate-600 dark:text-slate-400 max-w-[140px] truncate hidden sm:inline">
                {displayAccountName}
              </span>
              <button
                type="button"
                onClick={() => void handleSignOut()}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1360px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {syncWarning && (
          <div
            role="status"
            className="mb-5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-center justify-between gap-4"
          >
            <p className="text-xs text-amber-800 dark:text-amber-300">
              {syncWarning}
            </p>
            <button
              type="button"
              onClick={() => setSyncWarning(null)}
              className="text-xs font-medium text-amber-800 dark:text-amber-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {extractError && (
          <div
            role="alert"
            className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex items-start justify-between gap-4"
          >
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-800 dark:text-red-300">
                  Request could not be completed
                </p>
                <p className="text-xs text-red-700 dark:text-red-400 mt-0.5 leading-relaxed">
                  {extractError}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExtractError(null)}
              className="text-xs font-medium text-red-700 dark:text-red-300 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {activeTab === ViewTab.Workspace && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5">
              <SourceInputPanel
                sourceMode={sourceMode}
                onSourceModeChange={setSourceMode}
                textValue={textValue}
                onTextChange={setTextValue}
                uploadedFiles={uploadedFiles}
                onUploadedFilesChange={setUploadedFiles}
                summaryPointCount={summaryPointCount}
                onSummaryPointCountChange={handleSummaryPointsChange}
                targetLanguage={targetLanguage}
                onTargetLanguageChange={setTargetLanguage}
                batchMode={batchMode}
                onBatchModeChange={setBatchMode}
                batchProgress={batchProgress}
                selectedEvaluationBases={selectedEvaluationBases}
                onToggleEvaluationBasis={handleToggleEvaluationBasis}
                customEvaluationBasis={customEvaluationBasis}
                onCustomEvaluationBasisChange={setCustomEvaluationBasis}
                focusHint={focusHint}
                onFocusHintChange={setFocusHint}
                isExtracting={isExtracting}
                onExtract={() => void handleExtract()}
                onOpenEmailFormats={() => setIsEmailFormatsOpen(true)}
                onNotifyToast={notifyToast}
                draftTo={draftTo}
                onDraftToChange={setDraftTo}
                draftSubject={draftSubject}
                onDraftSubjectChange={setDraftSubject}
                draftBody={draftBody}
                onDraftBodyChange={setDraftBody}
                draftFormatStyle={draftFormatStyle}
                onDraftFormatStyleChange={setDraftFormatStyle}
                draftNotes={draftNotes}
                onDraftNotesChange={setDraftNotes}
                isGeneratingDraft={isGeneratingDraft}
                onGenerateDraft={() => void handleGenerateDraft()}
                isSavingDraft={isSavingDraft}
                onSaveDraft={() => void handleSaveDraft()}
                onNewDraft={handleNewDraft}
              />

              {records.length > 0 && (
                <div className="mt-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <div>
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Recent History
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Cached locally &amp; synced to your account
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab(ViewTab.SavedDocs)}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                    >
                      View all ({records.length})
                    </button>
                  </div>
                  <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {records.slice(0, 5).map((rec) => {
                      const isSelected =
                        rec.id === activeRecordId &&
                        sourceMode !== InputSourceMode.DraftEmail;
                      const fileCount = (rec.attachments ?? []).length;
                      return (
                        <button
                          key={rec.id}
                          type="button"
                          onClick={() => {
                            openRecordInWorkspace(rec.id, "overview");
                          }}
                          className={`w-full py-2.5 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                            isSelected
                              ? "text-blue-600 dark:text-blue-400"
                              : "text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">
                              {rec.documentTitle}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                              <UrgencyIndicator
                                urgency={rec.mailEvaluation?.urgencyLevel}
                              />
                              {rec.mailEvaluation?.detectedTone && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{rec.mailEvaluation.detectedTone}</span>
                                </>
                              )}
                              <span aria-hidden="true">·</span>
                              <span className="tabular-nums">
                                {rec.summaryBullets.length} pts
                              </span>
                            </div>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap shrink-0">
                            {rec.actionItems.length}t · {fileCount}f
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-7 space-y-5">
              {sourceMode !== InputSourceMode.DraftEmail &&
                recentBatchRecords.length > 1 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                        <Layers className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          Batch Extraction Complete
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{recentBatchRecords.length} documents</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {recentBatchRecords.reduce(
                            (s, r) => s + r.actionItems.length,
                            0
                          )}{" "}
                          tasks
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            downloadBatchConsolidatedMarkdown(
                              recentBatchRecords
                            );
                            notifyToast(
                              `Downloaded consolidated report (${recentBatchRecords.length} docs)`
                            );
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <FileCode2 className="w-3.5 h-3.5" />
                          <span>Consolidated Report .md</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const count = downloadBatchBundledIcs(
                              recentBatchRecords,
                              selectedCountry.timezone
                            );
                            if (count > 0) {
                              notifyToast(
                                `Downloaded bundled .ics (${count} calendar items)`
                              );
                            } else {
                              notifyToast(
                                "No dated events or deadlines found across this batch"
                              );
                            }
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" />
                          <span>Bundled .ics</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            downloadBatchConsolidatedJson(recentBatchRecords);
                            notifyToast("Downloaded batch JSON bundle");
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <FileJson className="w-3.5 h-3.5" />
                          <span>JSON</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setLastBatchIds([])}
                          aria-label="Dismiss batch banner"
                          className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto">
                      {recentBatchRecords.map((rec, idx) => {
                        const isActiveBatchItem = rec.id === activeRecordId;
                        return (
                          <button
                            key={rec.id}
                            type="button"
                            onClick={() => setActiveRecordId(rec.id)}
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 max-w-[200px] truncate cursor-pointer tabular-nums ${
                              isActiveBatchItem
                                ? "bg-slate-900 dark:bg-blue-600 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                            }`}
                          >
                            {idx + 1}. {rec.documentTitle}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

              {sourceMode === InputSourceMode.DraftEmail ? (
                <DraftsPanel
                  activeDraftId={activeDraftId}
                  draftTo={draftTo}
                  draftSubject={draftSubject}
                  draftBody={draftBody}
                  draftFormatStyle={draftFormatStyle}
                  savedDrafts={savedDrafts}
                  onSelectDraft={handleSelectDraft}
                  onNewDraft={handleNewDraft}
                  onDeleteDraft={handleDeleteDraft}
                />
              ) : (
                <ExtractionResultView
                  record={activeRecord}
                  allRecords={records}
                  isExtracting={isExtracting}
                  timezone={selectedCountry.timezone}
                  countryName={selectedCountry.name}
                  subPane={resultSubPane}
                  onSubPaneChange={setResultSubPane}
                  onToggleTask={handleToggleTask}
                  onUpdateTaskStatus={handleUpdateTaskStatus}
                  onUpdateTask={handleUpdateTask}
                  onAddTask={handleAddTask}
                  onDeleteTask={handleDeleteTask}
                  onUpdateEvent={handleUpdateEvent}
                  onAddEvent={handleAddEvent}
                  onUpdateSummary={handleUpdateSummary}
                  onUpdateNotes={handleUpdateNotes}
                  onTranslateRecord={handleTranslateRecord}
                  isTranslatingRecord={isTranslatingRecord}
                  onOpenRecord={(id) => openRecordInWorkspace(id, "overview")}
                  onAttachFileToRecord={handleAttachFileToRecord}
                  onDraftReply={handleDraftReply}
                  onDismissRecord={handleDeleteRecord}
                  onNotifyToast={notifyToast}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === ViewTab.ActionQueue && (
          <ActionQueueView
            records={records}
            timezone={selectedCountry.timezone}
            onToggleTask={handleToggleTask}
            onUpdateTaskStatus={handleUpdateTaskStatus}
            onOpenRecord={(id) => openRecordInWorkspace(id, "overview")}
            onStartNewExtraction={handleStartNewExtraction}
          />
        )}

        {activeTab === ViewTab.CalendarInvites && (
          <CalendarQueueView
            records={records}
            timezone={selectedCountry.timezone}
            countryName={selectedCountry.name}
            onOpenRecord={(id) => openRecordInWorkspace(id, "overview")}
            onStartNewExtraction={handleStartNewExtraction}
            onNotifyToast={notifyToast}
          />
        )}

        {activeTab === ViewTab.Attachments && (
          <AttachmentsView
            records={records}
            onOpenRecordAttachments={(id) =>
              openRecordInWorkspace(id, "attachments")
            }
            onAttachFileToRecord={handleAttachFileToRecord}
            onStartNewExtraction={handleStartNewExtraction}
          />
        )}

        {activeTab === ViewTab.SavedDocs && (
          <SavedDocsView
            records={records}
            activeRecordId={activeRecordId}
            timezone={selectedCountry.timezone}
            onOpenRecord={(id) => openRecordInWorkspace(id, "overview")}
            onOpenRecordAttachments={(id) =>
              openRecordInWorkspace(id, "attachments")
            }
            onDeleteRecord={handleDeleteRecord}
            onClearAllRecords={handleClearAllRecords}
            onStartNewExtraction={handleStartNewExtraction}
            onNotifyToast={notifyToast}
          />
        )}
      </main>

      <footer className="border-t border-slate-200 dark:border-slate-800 py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <span>Distill · Smart Mail &amp; Document Action Extractor</span>
          <span>
            Kanban, Voice STT, Multi-Language, Conflict Check, Batch &amp;
            Extension Export
          </span>
        </div>
      </footer>

      <EmailFormatsModal
        isOpen={isEmailFormatsOpen}
        onClose={() => setIsEmailFormatsOpen(false)}
        onInsertFormat={(fmt) => {
          if (sourceMode === InputSourceMode.DraftEmail) {
            setDraftSubject(fmt.subject);
            setDraftBody(fmt.body);
            setDraftFormatStyle(fmt.shortLabel);
          } else {
            setTextValue(`Subject: ${fmt.subject}\n\n${fmt.body}`);
            setSourceMode(InputSourceMode.PasteText);
          }
          setActiveTab(ViewTab.Workspace);
          notifyToast(`Inserted ${fmt.shortLabel} template`);
        }}
      />

      <AutomationHubModal
        isOpen={isAutomationOpen}
        onClose={() => setIsAutomationOpen(false)}
        workspaceToken={workspaceToken}
        timezone={selectedCountry.timezone}
        targetLanguage={targetLanguage}
        summaryPointCount={summaryPointCount}
        pendingInboxCount={pendingInboxCount}
        onSyncInbox={handleSyncWebhookInbox}
        onIngestDirectExtraction={handleIngestDirectExtraction}
        onNotifyToast={notifyToast}
      />

      {/* Toast Notification Stack (Launch Urgent <24h Alert + Action Feedback) */}
      {(urgentDueMatches.length > 0 || toastMessage) && (
        <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5 max-w-sm w-[calc(100vw-2.5rem)] sm:w-96 pointer-events-none">
          {urgentDueMatches.length > 0 && (
            <div
              role="alert"
              aria-live="assertive"
              className="pointer-events-auto w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border border-red-200 dark:border-red-900/70 rounded-xl p-4 shadow-lg"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-300 tabular-nums">
                      {urgentDueMatches.length === 1
                        ? "High-priority task due within 24 hours"
                        : `${urgentDueMatches.length} High-priority tasks due within 24 hours`}
                    </p>
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 mt-1 truncate">
                      {urgentDueMatches[0].task.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate tabular-nums">
                      <span className="font-mono text-red-700 dark:text-red-400">
                        {urgentDueMatches[0].dueLabel}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>{urgentDueMatches[0].documentTitle}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={dismissUrgentToast}
                  aria-label="Dismiss urgent task alert"
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={dismissUrgentToast}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Dismiss
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const firstMatch = urgentDueMatches[0];
                    if (urgentDueMatches.length > 1) {
                      setActiveTab(ViewTab.ActionQueue);
                    } else if (firstMatch) {
                      openRecordInWorkspace(firstMatch.recordId, "overview");
                    }
                    dismissUrgentToast();
                  }}
                  className="px-3 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {urgentDueMatches.length > 1
                    ? "View Action Queue"
                    : "Open Task"}
                </button>
              </div>
            </div>
          )}

          {toastMessage && (
            <div
              role="status"
              aria-live="polite"
              className="pointer-events-auto max-w-sm bg-slate-900 dark:bg-slate-800 text-white border border-slate-800 dark:border-slate-700 rounded-lg px-3.5 py-2.5 shadow-lg flex items-center gap-2.5 text-xs"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="leading-snug">{toastMessage}</span>
              <button
                type="button"
                onClick={() => setToastMessage(null)}
                aria-label="Close notification"
                className="text-slate-400 hover:text-white ml-1 shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
