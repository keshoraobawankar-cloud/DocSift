export enum ViewTab {
  Workspace = "workspace",
  ActionQueue = "actions",
  CalendarInvites = "calendar",
  Attachments = "attachments",
  SavedDocs = "saved",
}

export enum InputSourceMode {
  PasteText = "paste",
  UploadFile = "upload",
  VoiceNote = "voice",
  DraftEmail = "draft",
}

export type PriorityLevel = "High" | "Medium" | "Low";

export type UrgencyLevel = "Urgent" | "Action Required" | "Informational";

export type KanbanStatus = "todo" | "in_progress" | "done";

export type MailClassification =
  | "Action Required"
  | "Promotional / Marketing"
  | "Newsletter / Digest"
  | "Transactional / Receipt"
  | "Informational / FYI"
  | "Suspicious / Unsolicited";

export const SUPPORTED_LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "Auto", label: "Original Language (Auto-Detect)" },
  { code: "English", label: "English" },
  { code: "Spanish", label: "Spanish (Español)" },
  { code: "Hindi", label: "Hindi (हिन्दी)" },
  { code: "German", label: "German (Deutsch)" },
  { code: "French", label: "French (Français)" },
  { code: "Portuguese", label: "Portuguese (Português)" },
  { code: "Japanese", label: "Japanese (日本語)" },
  { code: "Arabic", label: "Arabic (العربية)" },
  { code: "Chinese (Simplified)", label: "Chinese (简体中文)" },
  { code: "Korean", label: "Korean (한국어)" },
];

export interface EvaluationCriterionResult {
  criterion: string;
  finding: string;
  rating: string;
}

export interface MailEvaluation {
  classification: MailClassification;
  urgencyLevel?: UrgencyLevel;
  detectedTone?: string;
  requiresUserAction: boolean;
  recommendedDisposition: string;
  evaluationRationale: string;
  detectedSignals: string[];
  evaluationBases?: string[];
  criteriaBreakdown?: EvaluationCriterionResult[];
}

export interface SummaryBullet {
  lead: string;
  detail: string;
}

export interface ActionItem {
  id: string;
  title: string;
  owner: string;
  dueDateText: string;
  dueDateIso: string;
  priority: PriorityLevel;
  sourceSnippet: string;
  completed: boolean;
  status?: KanbanStatus;
}

export function getTaskKanbanStatus(task: ActionItem): KanbanStatus {
  if (task.status === "todo" || task.status === "in_progress" || task.status === "done") {
    if (task.completed && task.status !== "done") return "done";
    if (!task.completed && task.status === "done") return "todo";
    return task.status;
  }
  return task.completed ? "done" : "todo";
}

export interface CalendarEventItem {
  id: string;
  title: string;
  eventType: string;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  location: string;
  organizer: string;
  attendees: string[];
  description: string;
  statusNote: string;
}

export type AttachmentOrigin = "uploaded" | "eml" | "referenced";

export interface EmailAttachmentItem {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
  origin: AttachmentOrigin;
  contextNote: string;
  base64?: string;
  textContent?: string;
}

export type ReadingMode = "skim" | "fast" | "deep";

export interface ExtractionRecord {
  id: string;
  ownerId?: string;
  createdAtIso: string;
  countryName?: string;
  timezone: string;
  sourceMode: InputSourceMode;
  sourceFileName?: string;
  sourcePreview: string;
  sourceText?: string;
  detectedLanguage?: string;
  outputLanguage?: string;
  documentTitle: string;
  documentType: string;
  senderOrSource: string;
  estimatedReadMinutesSaved: number;
  mailEvaluation?: MailEvaluation;
  summaryBullets: SummaryBullet[];
  actionItems: ActionItem[];
  calendarEvents: CalendarEventItem[];
  attachments?: EmailAttachmentItem[];
  workspaceNotes?: string;
}

export interface UploadedFilePayload {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  origin: "uploaded" | "eml";
  base64?: string;
  extractedText?: string;
  embeddedAttachments?: UploadedFilePayload[];
}

export interface UserProfileRecord {
  uid: string;
  displayName: string;
  email: string;
  countryCode: string;
  countryName: string;
  timezone: string;
  defaultSummaryPoints: number;
}

export interface EmailDraftRecord {
  id: string;
  ownerId: string;
  to: string;
  subject: string;
  body: string;
  formatType: string;
  updatedAtIso: string;
}
