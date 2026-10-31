import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus,
  Check,
  Copy,
  Download,
  Edit3,
  AlertTriangle,
  Clock,
  ArrowDown,
  Plus,
  Code2,
  MapPin,
  Users,
  Trash2,
  ExternalLink,
  Megaphone,
  CheckCircle2,
  Newspaper,
  Receipt,
  Info,
  ShieldAlert,
  Paperclip,
  FileText,
  Eye,
  Upload,
  Reply,
  FileCode2,
  FileJson,
  ListTodo,
  NotebookPen,
  Save,
  Columns3,
  GripVertical,
  Languages,
  LayoutList,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import {
  ActionItem,
  CalendarEventItem,
  EmailAttachmentItem,
  ExtractionRecord,
  InputSourceMode,
  KanbanStatus,
  MailClassification,
  PriorityLevel,
  ReadingMode,
  SUPPORTED_LANGUAGES,
  SummaryBullet,
  UrgencyLevel,
  getTaskKanbanStatus,
} from "../types";
import {
  actionItemToCalendarEvent,
  buildGoogleCalendarUrl,
  formatEventDateRange,
  generateIcsContent,
  slugifyFilename,
  triggerIcsDownload,
} from "../utils/icsGenerator";
import {
  buildRecordMarkdown,
  copyNotionBlocks,
  copyTextToClipboard,
  copyTodoistQuickAdd,
  downloadMarkdownFile,
  downloadRecordJsonFile,
  downloadTodoistCsv,
} from "../utils/exporters";
import { formatFileSize, readUploadedFile } from "../utils/emlParser";
import {
  AttachmentPreviewModal,
  triggerAttachmentDownload,
} from "./AttachmentPreviewModal";
import { loadAttachmentPayload } from "../utils/attachmentStore";
import { buildWorkspaceConflictLookup } from "../utils/conflictDetector";

export type ResultSubPane = "overview" | "notes" | "attachments";

interface ExtractionResultViewProps {
  record: ExtractionRecord | null;
  allRecords: ExtractionRecord[];
  isExtracting: boolean;
  timezone: string;
  countryName: string;
  subPane: ResultSubPane;
  onSubPaneChange: (pane: ResultSubPane) => void;
  onToggleTask: (recordId: string, taskId: string) => void;
  onUpdateTaskStatus: (
    recordId: string,
    taskId: string,
    status: KanbanStatus
  ) => void;
  onUpdateTask: (recordId: string, updated: ActionItem) => void;
  onAddTask: (recordId: string, task: ActionItem) => void;
  onDeleteTask: (recordId: string, taskId: string) => void;
  onUpdateEvent: (recordId: string, updated: CalendarEventItem) => void;
  onAddEvent: (recordId: string, event: CalendarEventItem) => void;
  onUpdateSummary: (
    recordId: string,
    documentTitle: string,
    summaryBullets: SummaryBullet[]
  ) => void;
  onUpdateNotes: (recordId: string, workspaceNotes: string) => void;
  onTranslateRecord: (
    recordId: string,
    targetLanguage: string
  ) => Promise<void>;
  isTranslatingRecord?: boolean;
  onOpenRecord?: (recordId: string) => void;
  onAttachFileToRecord: (recordId: string, attachment: EmailAttachmentItem) => void;
  onDraftReply: (record: ExtractionRecord) => void;
  onDismissRecord: (recordId: string) => void;
  onNotifyToast?: (message: string) => void;
}

export function getPrioritySurfaceClasses(
  priority: PriorityLevel,
  completed = false
): string {
  const dimClass = completed ? "opacity-70" : "";
  if (priority === "High") {
    return `bg-red-50/85 hover:bg-red-100/80 dark:bg-red-950/30 dark:hover:bg-red-950/45 ${dimClass}`.trim();
  }
  if (priority === "Medium") {
    return `bg-amber-50/85 hover:bg-amber-100/80 dark:bg-amber-950/30 dark:hover:bg-amber-950/45 ${dimClass}`.trim();
  }
  return `bg-emerald-50/85 hover:bg-emerald-100/80 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/45 ${dimClass}`.trim();
}

export function isPromotionalOrNoiseMail(
  classification?: MailClassification
): boolean {
  return (
    classification === "Promotional / Marketing" ||
    classification === "Newsletter / Digest" ||
    classification === "Suspicious / Unsolicited"
  );
}

export const MailClassificationLabel: React.FC<{
  classification: MailClassification;
}> = ({ classification }) => {
  switch (classification) {
    case "Promotional / Marketing":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap shrink-0">
          <Megaphone className="w-3.5 h-3.5 shrink-0" />
          <span>Promotional / Marketing</span>
        </span>
      );
    case "Newsletter / Digest":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0">
          <Newspaper className="w-3.5 h-3.5 shrink-0" />
          <span>Newsletter / Digest</span>
        </span>
      );
    case "Transactional / Receipt":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0">
          <Receipt className="w-3.5 h-3.5 shrink-0" />
          <span>Transactional / Receipt</span>
        </span>
      );
    case "Suspicious / Unsolicited":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap shrink-0">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>Suspicious / Unsolicited</span>
        </span>
      );
    case "Informational / FYI":
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0">
          <Info className="w-3.5 h-3.5 shrink-0" />
          <span>Informational / FYI</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-400 whitespace-nowrap shrink-0">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Action Required</span>
        </span>
      );
  }
};

export const UrgencyIndicator: React.FC<{ urgency?: UrgencyLevel }> = ({
  urgency,
}) => {
  if (urgency === "Urgent") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Urgent</span>
      </span>
    );
  }
  if (urgency === "Informational") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
        <Info className="w-3.5 h-3.5 shrink-0" />
        <span>Informational</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap shrink-0">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>Action Required</span>
    </span>
  );
};

export const PriorityIndicator: React.FC<{ priority: PriorityLevel }> = ({
  priority,
}) => {
  if (priority === "High") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 dark:text-red-300 whitespace-nowrap shrink-0">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>High</span>
      </span>
    );
  }
  if (priority === "Medium") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 dark:text-amber-300 whitespace-nowrap shrink-0">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>Medium</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap shrink-0">
      <ArrowDown className="w-3.5 h-3.5 shrink-0" />
      <span>Low</span>
    </span>
  );
};

function defaultTomorrowMorningIso(): { start: string; end: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return {
    start: `${yyyy}-${mm}-${dd}T09:00:00`,
    end: `${yyyy}-${mm}-${dd}T09:45:00`,
  };
}

const READING_MODE_STORAGE_KEY = "distill_reading_mode_v1";
const WORDS_PER_MINUTE = 200;

function countWords(text?: string | null): number {
  if (!text) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function formatReadingDuration(seconds: number): string {
  const safeSec = Math.max(10, Math.round(seconds));
  if (safeSec < 60) {
    const rounded5 = Math.max(10, Math.round(safeSec / 5) * 5);
    return `~${rounded5} sec`;
  }
  if (safeSec < 90) {
    return "~1 min";
  }
  if (safeSec < 120) {
    return "~1.5 min";
  }
  return `~${Math.round(safeSec / 60)} min`;
}

interface ReadingMetrics {
  skimSeconds: number;
  fastSeconds: number;
  deepSeconds: number;
  skimLabel: string;
  fastLabel: string;
  deepLabel: string;
  sourceWordCount: number;
  hasFullSourceText: boolean;
  resolvedSourceDisplay: string;
  extraAttachmentTexts: Array<{ fileName: string; text: string }>;
}

function computeReadingMetrics(record: ExtractionRecord): ReadingMetrics {
  const skimWords =
    countWords(record.documentTitle) +
    record.summaryBullets.reduce(
      (sum, b) => sum + countWords(b.lead) + countWords(b.detail),
      0
    );
  const skimSeconds = Math.max(
    10,
    Math.round((skimWords / WORDS_PER_MINUTE) * 60)
  );

  const actionWords = record.actionItems.reduce(
    (sum, t) =>
      sum +
      countWords(t.title) +
      countWords(t.owner) +
      countWords(t.dueDateText) +
      countWords(t.sourceSnippet),
    0
  );
  const compactEvalWords =
    countWords(record.mailEvaluation?.classification) +
    countWords(record.mailEvaluation?.recommendedDisposition);

  const fastWords = skimWords + compactEvalWords + actionWords;
  const fastSeconds = Math.max(
    skimSeconds + 10,
    Math.round((fastWords / WORDS_PER_MINUTE) * 60) +
      record.actionItems.length * 4
  );

  const rawFullSource = (record.sourceText || "").trim();
  const hasFullSourceText = Boolean(rawFullSource);
  const resolvedSourceDisplay =
    rawFullSource ||
    (record.sourcePreview || "").trim() ||
    "No raw text body captured for this document.";

  const extraAttachmentTexts: Array<{ fileName: string; text: string }> = [];
  for (const att of record.attachments ?? []) {
    const txt = (att.textContent || "").trim();
    if (!txt) continue;
    const probe = txt.slice(0, 80);
    if (!probe || !resolvedSourceDisplay.includes(probe)) {
      extraAttachmentTexts.push({
        fileName: att.fileName,
        text: txt,
      });
    }
  }

  const directSourceWords =
    countWords(resolvedSourceDisplay) +
    extraAttachmentTexts.reduce((sum, a) => sum + countWords(a.text), 0);

  const effectiveSourceWords = hasFullSourceText
    ? directSourceWords
    : Math.max(
        directSourceWords,
        Math.max(1, record.estimatedReadMinutesSaved || 2) * WORDS_PER_MINUTE
      );

  const deepExtraWords =
    countWords(record.mailEvaluation?.evaluationRationale) +
    (record.mailEvaluation?.detectedSignals ?? []).reduce(
      (sum, s) => sum + countWords(s),
      0
    ) +
    (record.mailEvaluation?.criteriaBreakdown ?? []).reduce(
      (sum, c) =>
        sum +
        countWords(c.criterion) +
        countWords(c.rating) +
        countWords(c.finding),
      0
    ) +
    record.calendarEvents.reduce(
      (sum, ev) =>
        sum +
        countWords(ev.title) +
        countWords(ev.location) +
        countWords(ev.description) +
        countWords(ev.statusNote),
      0
    );

  const totalDeepWords = fastWords + deepExtraWords + effectiveSourceWords;
  const deepSeconds = Math.max(
    fastSeconds + 20,
    Math.round((totalDeepWords / WORDS_PER_MINUTE) * 60) +
      record.calendarEvents.length * 4
  );

  return {
    skimSeconds,
    fastSeconds,
    deepSeconds,
    skimLabel: formatReadingDuration(skimSeconds),
    fastLabel: formatReadingDuration(fastSeconds),
    deepLabel: formatReadingDuration(deepSeconds),
    sourceWordCount: hasFullSourceText
      ? directSourceWords
      : effectiveSourceWords,
    hasFullSourceText,
    resolvedSourceDisplay,
    extraAttachmentTexts,
  };
}

/**
 * Lightweight safe Markdown preview renderer for the Built-in Note Workspace.
 */
const SimpleMarkdownPreview: React.FC<{ markdown: string }> = ({ markdown }) => {
  if (!markdown.trim()) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 italic">
        Write Markdown notes on the left or click Insert Brief to preview formatted output here.
      </p>
    );
  }

  const lines = markdown.split(/\r?\n/);
  return (
    <div className="space-y-2 text-xs leading-relaxed text-slate-800 dark:text-slate-200">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1.5" />;
        if (trimmed === "---") {
          return (
            <hr
              key={i}
              className="border-slate-200 dark:border-slate-800 my-2"
            />
          );
        }
        if (trimmed.startsWith("# ")) {
          return (
            <h4
              key={i}
              className="text-sm font-semibold text-slate-900 dark:text-slate-100 pt-1"
            >
              {trimmed.slice(2)}
            </h4>
          );
        }
        if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
          return (
            <h5
              key={i}
              className="text-xs font-semibold text-slate-900 dark:text-slate-100 pt-1"
            >
              {trimmed.replace(/^#{2,3}\s+/, "")}
            </h5>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <div
              key={i}
              className="px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300"
            >
              {trimmed.slice(2)}
            </div>
          );
        }
        if (/^- \[[ xX]\] /.test(trimmed)) {
          const checked = /^- \[[xX]\] /.test(trimmed);
          const content = trimmed.replace(/^- \[[ xX]\] /, "");
          return (
            <div key={i} className="flex items-start gap-2">
              <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 shrink-0">
                {checked ? "[x]" : "[ ]"}
              </span>
              <span className={checked ? "line-through text-slate-400" : ""}>
                {content.replace(/\*\*/g, "")}
              </span>
            </div>
          );
        }
        if (trimmed.startsWith("- ") || /^\d+\.\s+/.test(trimmed)) {
          return (
            <div key={i} className="pl-2 text-slate-700 dark:text-slate-300">
              {trimmed.replace(/\*\*/g, "")}
            </div>
          );
        }
        return <p key={i}>{trimmed.replace(/\*\*/g, "")}</p>;
      })}
    </div>
  );
};

export const ExtractionResultView: React.FC<ExtractionResultViewProps> = ({
  record,
  allRecords,
  isExtracting,
  timezone,
  countryName,
  subPane,
  onSubPaneChange,
  onToggleTask,
  onUpdateTaskStatus,
  onUpdateTask,
  onAddTask,
  onDeleteTask,
  onUpdateEvent,
  onAddEvent,
  onUpdateSummary,
  onUpdateNotes,
  onTranslateRecord,
  isTranslatingRecord = false,
  onOpenRecord,
  onAttachFileToRecord,
  onDraftReply,
  onDismissRecord,
  onNotifyToast,
}) => {
  const [copiedMarkdown, setCopiedMarkdown] = useState(false);
  const [copiedSummaryOnly, setCopiedSummaryOnly] = useState(false);
  const [copiedBulletIdx, setCopiedBulletIdx] = useState<number | null>(null);
  const [copiedNotion, setCopiedNotion] = useState(false);

  // Summary inline editor state
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [bulletsDraft, setBulletsDraft] = useState<SummaryBullet[]>([]);

  // Workspace Markdown Notes state
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSavedFeedback, setNotesSavedFeedback] = useState(false);
  const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Tasks state & Kanban layout
  const [taskOwnerFilter, setTaskOwnerFilter] = useState<"all" | "mine">("all");
  const [taskLayout, setTaskLayout] = useState<"list" | "board">("list");
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanStatus | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskDraft, setTaskDraft] = useState<ActionItem | null>(null);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState("You");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<PriorityLevel>("Medium");

  // Multi-Language Auto-Translation target selector
  const [selectedTranslateLang, setSelectedTranslateLang] =
    useState<string>("Spanish");

  // Calendar Events state + manual fallback creator
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<CalendarEventItem | null>(null);
  const [previewIcsEventId, setPreviewIcsEventId] = useState<string | null>(null);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventStart, setNewEventStart] = useState("");
  const [newEventEnd, setNewEventEnd] = useState("");
  const [newEventLocation, setNewEventLocation] = useState("");
  const [newEventAllDay, setNewEventAllDay] = useState(false);

  const [previewAttachment, setPreviewAttachment] =
    useState<EmailAttachmentItem | null>(null);
  const attachFileRef = useRef<HTMLInputElement | null>(null);

  // Estimated Reading Time Mode state ('skim' | 'fast' | 'deep')
  const [readingMode, setReadingMode] = useState<ReadingMode>(() => {
    try {
      const saved = localStorage.getItem(READING_MODE_STORAGE_KEY);
      if (saved === "skim" || saved === "fast" || saved === "deep") {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    return "fast";
  });
  const [copiedSourceText, setCopiedSourceText] = useState(false);

  const computedMetrics = useMemo(
    () => (record ? computeReadingMetrics(record) : null),
    [record]
  );

  const conflictLookup = useMemo(
    () => buildWorkspaceConflictLookup(allRecords, timezone),
    [allRecords, timezone]
  );

  useEffect(() => {
    if (!record) return;
    setIsEditingSummary(false);
    setTitleDraft(record.documentTitle);
    setBulletsDraft(record.summaryBullets.map((b) => ({ ...b })));
    setNotesDraft(record.workspaceNotes || "");
    setIsAddingEvent(false);
    setIsAddingTask(false);
    setCopiedSourceText(false);
    const currentLang = (record.outputLanguage || record.detectedLanguage || "").trim();
    if (currentLang && currentLang.toLowerCase() !== "english") {
      setSelectedTranslateLang("English");
    } else {
      setSelectedTranslateLang("Spanish");
    }
  }, [record?.id]);

  useEffect(() => {
    if (record) {
      setNotesDraft(record.workspaceNotes || "");
    }
  }, [record?.workspaceNotes]);

  if (isExtracting) {
    return (
      <section
        aria-busy="true"
        aria-label="Evaluating mail intent and extracting actions"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800"
      >
        <div className="p-6 space-y-3">
          <div className="h-3 w-44 bg-slate-100 dark:bg-slate-800/80 rounded animate-pulse" />
          <div className="h-6 w-3/4 bg-slate-200/80 dark:bg-slate-800 rounded animate-pulse" />
          <div className="flex gap-2 pt-2">
            <div className="h-7 w-28 bg-slate-100 dark:bg-slate-800/80 rounded-lg animate-pulse" />
            <div className="h-7 w-28 bg-slate-100 dark:bg-slate-800/80 rounded-lg animate-pulse" />
            <div className="h-7 w-28 bg-slate-100 dark:bg-slate-800/80 rounded-lg animate-pulse" />
          </div>
        </div>
        <div className="p-6 space-y-2.5 bg-slate-50/50 dark:bg-slate-950/30">
          <div className="h-4 w-52 bg-slate-200/80 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
          <div className="h-3.5 w-2/3 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
        </div>
        <div className="p-6 space-y-4">
          <div className="h-4 w-44 bg-slate-200/80 dark:bg-slate-800 rounded animate-pulse" />
          {[1, 2, 3].map((row) => (
            <div key={row} className="space-y-2">
              <div className="h-3.5 w-full bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
              <div className="h-3.5 w-4/5 bg-slate-100 dark:bg-slate-800/70 rounded animate-pulse" />
            </div>
          ))}
        </div>
        <div className="p-6 space-y-3">
          <div className="h-4 w-48 bg-slate-200/80 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
          <div className="h-12 w-full bg-slate-100 dark:bg-slate-800/60 rounded-lg animate-pulse" />
        </div>
      </section>
    );
  }

  if (!record) {
    return (
      <section
        aria-label="Empty Extraction Results"
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 sm:p-10 flex flex-col items-center justify-center text-center min-h-[420px]"
      >
        <div className="max-w-sm">
          <FileText className="w-6 h-6 text-slate-400 dark:text-slate-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No document selected
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            Paste text, record a voice note, or batch-upload PDFs, Word (.docx), .eml, or screenshots on the left to classify urgency &amp; tone, translate summaries, detect schedule conflicts, and manage Kanban tasks.
          </p>
        </div>
      </section>
    );
  }

  const attachmentsList = record.attachments ?? [];
  const evaluation = record.mailEvaluation;
  const pointCount = record.summaryBullets.length;
  const hasAnyDatedTask = record.actionItems.some((t) => Boolean(t.dueDateIso));
  const hasZeroDatesInSource =
    record.calendarEvents.length === 0 && !hasAnyDatedTask;

  const readingMetrics = computedMetrics ?? computeReadingMetrics(record);

  const handleSelectReadingMode = (mode: ReadingMode) => {
    setReadingMode(mode);
    try {
      localStorage.setItem(READING_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage access errors
    }
    if (subPane !== "overview") {
      onSubPaneChange("overview");
    }
  };

  const handleCopySourceContext = async () => {
    const sections = [readingMetrics.resolvedSourceDisplay];
    for (const extra of readingMetrics.extraAttachmentTexts) {
      sections.push(`--- ${extra.fileName} ---\n${extra.text}`);
    }
    await copyTextToClipboard(sections.join("\n\n"));
    setCopiedSourceText(true);
    setTimeout(() => setCopiedSourceText(false), 1800);
    onNotifyToast?.("Copied full source context to clipboard");
  };

  const activeReadingEstimate =
    readingMode === "skim"
      ? {
          durationLabel: readingMetrics.skimLabel,
          scopeDescription: `Summary only (${pointCount} ${
            pointCount === 1 ? "point" : "points"
          })`,
        }
      : readingMode === "fast"
        ? {
            durationLabel: readingMetrics.fastLabel,
            scopeDescription: `Summary + action items (${
              record.actionItems.length
            } ${record.actionItems.length === 1 ? "task" : "tasks"})`,
          }
        : {
            durationLabel: readingMetrics.deepLabel,
            scopeDescription: `Summary, tasks & full source context (${readingMetrics.sourceWordCount.toLocaleString()} ${
              readingMetrics.sourceWordCount === 1 ? "word" : "words"
            })`,
          };

  const handleCopyBrief = async () => {
    const md = buildRecordMarkdown({
      ...record,
      workspaceNotes: notesDraft || record.workspaceNotes,
    });
    await copyTextToClipboard(md);
    setCopiedMarkdown(true);
    setTimeout(() => setCopiedMarkdown(false), 1800);
    onNotifyToast?.("Copied full Markdown brief to clipboard");
  };

  const handleCopySummarySection = async () => {
    const text = record.summaryBullets
      .map(
        (b, idx) =>
          `${idx + 1}. ${b.lead.replace(/:$/, "")}: ${b.detail}`
      )
      .join("\n");
    await copyTextToClipboard(text);
    setCopiedSummaryOnly(true);
    setTimeout(() => setCopiedSummaryOnly(false), 1800);
    onNotifyToast?.(`Copied ${pointCount}-point summary to clipboard`);
  };

  const handleCopySingleBullet = async (b: SummaryBullet, idx: number) => {
    await copyTextToClipboard(`${b.lead.replace(/:$/, "")}: ${b.detail}`);
    setCopiedBulletIdx(idx);
    setTimeout(() => setCopiedBulletIdx(null), 1600);
    onNotifyToast?.(`Copied summary point #${idx + 1}`);
  };

  const handleDownloadSingleEvent = (ev: CalendarEventItem) => {
    const ics = generateIcsContent([ev], timezone, ev.title);
    triggerIcsDownload(ics, slugifyFilename(ev.title));
    onNotifyToast?.(`Downloaded "${slugifyFilename(ev.title)}.ics"`);
  };

  const handleDownloadAllEvents = () => {
    if (record.calendarEvents.length === 0) return;
    const ics = generateIcsContent(
      record.calendarEvents,
      timezone,
      record.documentTitle
    );
    const filename = `${slugifyFilename(record.documentTitle)}-events`;
    triggerIcsDownload(ics, filename);
    onNotifyToast?.(
      `Downloaded ${record.calendarEvents.length} calendar ${
        record.calendarEvents.length === 1 ? "invite" : "invites"
      } (.ics)`
    );
  };

  const handleDownloadTaskDeadlineIcs = (item: ActionItem) => {
    const calEvent = actionItemToCalendarEvent(item, record.documentTitle);
    const ics = generateIcsContent([calEvent], timezone, calEvent.title);
    triggerIcsDownload(ics, slugifyFilename(calEvent.title));
    onNotifyToast?.(`Downloaded deadline reminder (.ics) for "${item.title}"`);
  };

  const handleExportMarkdown = () => {
    downloadMarkdownFile({
      ...record,
      workspaceNotes: notesDraft || record.workspaceNotes,
    });
    onNotifyToast?.(`Downloaded "${slugifyFilename(record.documentTitle)}.md"`);
  };

  const handleExportJson = () => {
    downloadRecordJsonFile({
      ...record,
      workspaceNotes: notesDraft || record.workspaceNotes,
    });
    onNotifyToast?.(`Downloaded "${slugifyFilename(record.documentTitle)}.json"`);
  };

  const handleExportNotion = async () => {
    await copyNotionBlocks({
      ...record,
      workspaceNotes: notesDraft || record.workspaceNotes,
    });
    setCopiedNotion(true);
    setTimeout(() => setCopiedNotion(false), 1800);
    onNotifyToast?.("Copied Notion blocks — paste directly into any Notion page");
  };

  const handleExportTodoistCsv = () => {
    downloadTodoistCsv(record);
    onNotifyToast?.("Downloaded Todoist CSV import template (.csv)");
  };

  const handleCopyTodoistQuickAdd = async () => {
    await copyTodoistQuickAdd(record);
    onNotifyToast?.("Copied Todoist quick-add tasks to clipboard");
  };

  const handleDownloadAttachment = async (att: EmailAttachmentItem) => {
    if (att.base64 || att.textContent !== undefined) {
      triggerAttachmentDownload(att);
      onNotifyToast?.(`Downloaded "${att.fileName}"`);
      return;
    }
    const stored = await loadAttachmentPayload(att.id);
    if (stored) {
      triggerAttachmentDownload(att, stored.base64, stored.textContent);
      onNotifyToast?.(`Downloaded "${att.fileName}"`);
    }
  };

  const handleAddAttachmentFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const uploaded = await readUploadedFile(file);
      onAttachFileToRecord(record.id, {
        id: uploaded.id,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        origin: "uploaded",
        contextNote: "Attached to email record",
        base64: uploaded.base64,
        textContent: uploaded.extractedText,
      });
      onNotifyToast?.(`Attached "${uploaded.fileName}"`);
    } catch (err) {
      onNotifyToast?.(
        err instanceof Error ? err.message : "Unsupported file format."
      );
    }
  };

  const handleSaveSummaryEdits = () => {
    const cleaned = bulletsDraft
      .map((b, i) => ({
        lead: b.lead.trim() || `Point ${i + 1}`,
        detail: b.detail.trim() || "Summary takeaway.",
      }))
      .slice(0, 10);
    if (cleaned.length === 0) return;
    onUpdateSummary(
      record.id,
      titleDraft.trim() || record.documentTitle,
      cleaned
    );
    setIsEditingSummary(false);
    onNotifyToast?.("Saved edited summary takeaways");
  };

  const handleSaveWorkspaceNotes = () => {
    onUpdateNotes(record.id, notesDraft);
    setNotesSavedFeedback(true);
    setTimeout(() => setNotesSavedFeedback(false), 1800);
    onNotifyToast?.("Saved workspace notes");
  };

  const insertMarkdownSnippet = (snippet: string) => {
    const next = notesDraft ? `${notesDraft.replace(/\s+$/, "")}\n${snippet}` : snippet;
    setNotesDraft(next);
    notesTextareaRef.current?.focus();
  };

  const handleInsertExtractedBriefIntoNotes = () => {
    const generated = [
      `## Notes on ${record.documentTitle}`,
      "",
      "### Summary Tweaks",
      ...record.summaryBullets.map(
        (b) => `- **${b.lead.replace(/:$/, "")}:** ${b.detail}`
      ),
      "",
      "### Next Steps",
      ...(record.actionItems.length > 0
        ? record.actionItems.map(
            (t) => `- [${t.completed ? "x" : " "}] ${t.title} (${t.dueDateText})`
          )
        : ["- [ ] Follow up if needed"]),
      "",
    ].join("\n");
    const next = notesDraft.trim() ? `${notesDraft.trim()}\n\n${generated}` : generated;
    setNotesDraft(next);
    onUpdateNotes(record.id, next);
    onNotifyToast?.("Inserted summary & tasks into Markdown workspace");
  };

  const openManualEventCreator = () => {
    const defaults = defaultTomorrowMorningIso();
    setNewEventTitle(`Follow up: ${record.documentTitle}`);
    setNewEventStart(defaults.start);
    setNewEventEnd(defaults.end);
    setNewEventLocation("");
    setNewEventAllDay(false);
    setIsAddingEvent(true);
  };

  const handleCreateManualEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim()) return;
    const defaults = defaultTomorrowMorningIso();
    const startVal = newEventStart.trim() || defaults.start;
    const endVal =
      newEventEnd.trim() ||
      (newEventAllDay ? startVal.slice(0, 10) : defaults.end);

    onAddEvent(record.id, {
      id: `manual-ev-${Date.now()}`,
      title: newEventTitle.trim(),
      eventType: "Reminder",
      startIso: newEventAllDay ? startVal.slice(0, 10) : startVal,
      endIso: newEventAllDay ? endVal.slice(0, 10) : endVal,
      isAllDay: newEventAllDay,
      location: newEventLocation.trim(),
      organizer: "You",
      attendees: [],
      description: `Scheduled from ${record.documentTitle}`,
      statusNote: "Custom reminder",
    });
    setIsAddingEvent(false);
    onNotifyToast?.("Added calendar reminder — ready for 1-click .ics export");
  };

  const filteredTasks = record.actionItems.filter((item) => {
    if (taskOwnerFilter === "mine") {
      const lower = (item.owner || "").toLowerCase();
      return (
        lower.includes("you") ||
        lower.includes("recipient") ||
        lower.includes("all")
      );
    }
    return true;
  });

  const completedCount = record.actionItems.filter((t) => t.completed).length;

  const handleCreateManualTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    const trimmedDue = newTaskDue.trim();
    const isIsoLike =
      /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/.test(trimmedDue);
    onAddTask(record.id, {
      id: `manual-${Date.now()}`,
      title: newTaskTitle.trim(),
      owner: newTaskOwner.trim() || "You",
      dueDateText: trimmedDue || "No fixed deadline",
      dueDateIso: isIsoLike ? trimmedDue.replace(" ", "T") : "",
      priority: newTaskPriority,
      sourceSnippet: "Added manually in workspace",
      completed: false,
      status: "todo",
    });
    setNewTaskTitle("");
    setNewTaskDue("");
    setIsAddingTask(false);
    onNotifyToast?.("Added task to Action Queue");
  };

  const evalSurfaceClasses =
    evaluation?.classification === "Suspicious / Unsolicited"
      ? "bg-red-50/75 dark:bg-red-950/25"
      : evaluation?.classification === "Promotional / Marketing"
        ? "bg-amber-50/70 dark:bg-amber-950/20"
        : evaluation?.classification === "Newsletter / Digest" ||
            evaluation?.classification === "Informational / FYI"
          ? "bg-slate-50/80 dark:bg-slate-950/40"
          : "bg-blue-50/40 dark:bg-blue-950/15";

  const translateLanguageChoices = SUPPORTED_LANGUAGES.filter(
    (lang) => lang.code !== "Auto"
  );

  return (
    <section
      aria-label="Extracted Summary, Tasks, Calendar Invites, Notes Editor, and Exports"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800"
    >
      <input
        ref={attachFileRef}
        type="file"
        accept=".pdf,.docx,.eml,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.webm,.ogg"
        onChange={(e) => {
          void handleAddAttachmentFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
      />

      {/* Document Header + Sub-Pane Switcher + One-Click Ecosystem Exports */}
      <div className="p-5 sm:p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>{record.documentType || "Document"}</span>
              {evaluation?.urgencyLevel && (
                <>
                  <span aria-hidden="true">·</span>
                  <UrgencyIndicator urgency={evaluation.urgencyLevel} />
                </>
              )}
              {evaluation?.detectedTone && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Tone: {evaluation.detectedTone}</span>
                </>
              )}
              {record.detectedLanguage && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>
                    {record.outputLanguage &&
                    record.outputLanguage !== record.detectedLanguage
                      ? `${record.detectedLanguage} → ${record.outputLanguage}`
                      : `Language: ${record.detectedLanguage}`}
                  </span>
                </>
              )}
              {record.senderOrSource && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[220px]">
                    {record.senderOrSource}
                  </span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <span>~{record.estimatedReadMinutesSaved || 3} min saved</span>
            </div>

            <h2
              className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-slate-100 mt-1"
              style={{ textWrap: "balance" }}
            >
              {record.documentTitle}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onDraftReply(record)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Reply className="w-3.5 h-3.5" />
              <span>Draft Reply</span>
            </button>

            <button
              type="button"
              onClick={() => void handleCopyBrief()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedMarkdown ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>Copied Brief</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Brief</span>
                </>
              )}
            </button>

            {record.calendarEvents.length > 0 && (
              <button
                type="button"
                onClick={handleDownloadAllEvents}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="tabular-nums">
                  Download .ics ({record.calendarEvents.length})
                </span>
              </button>
            )}
          </div>
        </div>

        {/* One-Click Export Bar (Notion, Todoist, Markdown .md, JSON) */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Workspace result view mode"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            <button
              type="button"
              role="tab"
              aria-selected={subPane === "overview"}
              onClick={() => onSubPaneChange("overview")}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subPane === "overview"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Summary &amp; Actions
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subPane === "notes"}
              onClick={() => onSubPaneChange("notes")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                subPane === "notes"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <NotebookPen className="w-3.5 h-3.5" />
              <span>Notes &amp; Editor</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={subPane === "attachments"}
              onClick={() => onSubPaneChange("attachments")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                subPane === "attachments"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              <Paperclip className="w-3.5 h-3.5" />
              <span>Attached Files ({attachmentsList.length})</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400 dark:text-slate-500 mr-1 whitespace-nowrap">
              1-Click Export:
            </span>
            <button
              type="button"
              onClick={() => void handleExportNotion()}
              title="Copy formatted Notion blocks to paste directly into Notion"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedNotion ? (
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>Notion</span>
            </button>

            <button
              type="button"
              onClick={handleExportTodoistCsv}
              onContextMenu={(e) => {
                e.preventDefault();
                void handleCopyTodoistQuickAdd();
              }}
              title="Download Todoist CSV import template"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ListTodo className="w-3 h-3" />
              <span>Todoist .csv</span>
            </button>

            <button
              type="button"
              onClick={handleExportMarkdown}
              title="Download Markdown (.md) file"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileCode2 className="w-3 h-3" />
              <span>.md</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              title="Download structured JSON (.json) file"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <FileJson className="w-3 h-3" />
              <span>.json</span>
            </button>
          </div>
        </div>

        {/* Estimated Reading Time Mode Toggle: Skim | Fast | Deep */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
              <Clock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Estimated Reading Time:</span>
            </span>
            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
              {activeReadingEstimate.durationLabel}
            </span>
            <span
              aria-hidden="true"
              className="text-slate-300 dark:text-slate-700"
            >
              ·
            </span>
            <span>{activeReadingEstimate.scopeDescription}</span>
          </div>

          <div
            role="group"
            aria-label="Estimated Reading Time mode"
            className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
          >
            {(
              [
                {
                  id: "skim" as ReadingMode,
                  label: "Skim",
                  duration: readingMetrics.skimLabel,
                  hint: "Shows only summary",
                },
                {
                  id: "fast" as ReadingMode,
                  label: "Fast",
                  duration: readingMetrics.fastLabel,
                  hint: "Summary + action items",
                },
                {
                  id: "deep" as ReadingMode,
                  label: "Deep",
                  duration: readingMetrics.deepLabel,
                  hint: "Summary, tasks, and full source context",
                },
              ] as const
            ).map((opt) => {
              const isSelected =
                subPane === "overview" && readingMode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={isSelected}
                  title={`${opt.label} (${opt.duration}) — ${opt.hint}`}
                  onClick={() => handleSelectReadingMode(opt.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600/40 ${
                    isSelected
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <span>{opt.label}</span>
                  <span
                    aria-hidden="true"
                    className={
                      isSelected
                        ? "text-slate-300 dark:text-slate-600"
                        : "text-slate-300 dark:text-slate-700"
                    }
                  >
                    ·
                  </span>
                  <span
                    className={`font-mono text-[11px] ${
                      isSelected
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-slate-500 dark:text-slate-500"
                    }`}
                  >
                    {opt.duration}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Multi-Language Auto-Translation & Summarization Control */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
              <Languages className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
              <span>Language:</span>
            </span>
            <span>
              Detected {record.detectedLanguage || "English"}
              {record.outputLanguage &&
              record.outputLanguage !== record.detectedLanguage
                ? ` · Viewing in ${record.outputLanguage}`
                : ""}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="result-translate-select" className="sr-only">
              Target language
            </label>
            <select
              id="result-translate-select"
              value={selectedTranslateLang}
              onChange={(e) => setSelectedTranslateLang(e.target.value)}
              disabled={isTranslatingRecord}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            >
              {translateLanguageChoices.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={isTranslatingRecord}
              onClick={() =>
                void onTranslateRecord(record.id, selectedTranslateLang)
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {isTranslatingRecord ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
                  <span>Translating...</span>
                </>
              ) : (
                <>
                  <Languages className="w-3.5 h-3.5" />
                  <span>Translate Brief</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mail Intent, Tone & Urgency Evaluation Band (hidden in Skim mode, compact in Fast mode, full in Deep mode) */}
      {evaluation && !(subPane === "overview" && readingMode === "skim") && (
        <div className={`px-5 py-4 sm:px-6 space-y-3 ${evalSurfaceClasses}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5 flex-1 min-w-[240px]">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <MailClassificationLabel
                  classification={evaluation.classification}
                />
                {evaluation.urgencyLevel && (
                  <>
                    <span aria-hidden="true">·</span>
                    <UrgencyIndicator urgency={evaluation.urgencyLevel} />
                  </>
                )}
                {evaluation.detectedTone && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>Tone: {evaluation.detectedTone}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span className="font-medium text-slate-800 dark:text-slate-200">
                  {evaluation.recommendedDisposition}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  {evaluation.requiresUserAction
                    ? "Genuine action required"
                    : "No mandatory action needed"}
                </span>
              </div>

              {(subPane !== "overview" || readingMode === "deep") && (
                <>
                  <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                    {evaluation.evaluationRationale}
                  </p>

                  {evaluation.detectedSignals &&
                    evaluation.detectedSignals.length > 0 && (
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>Signals:</span>
                        {evaluation.detectedSignals.map((sig, idx) => (
                          <React.Fragment key={idx}>
                            {idx > 0 && <span aria-hidden="true">·</span>}
                            <span>{sig}</span>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                </>
              )}
            </div>

            {isPromotionalOrNoiseMail(evaluation.classification) && (
              <button
                type="button"
                onClick={() => onDismissRecord(record.id)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 border border-slate-200/80 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Dismiss Mail
              </button>
            )}
          </div>

          {(subPane !== "overview" || readingMode === "deep") &&
            evaluation.criteriaBreakdown &&
            evaluation.criteriaBreakdown.length > 0 && (
              <div className="pt-2.5 border-t border-slate-200/70 dark:border-slate-800/70 divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {evaluation.criteriaBreakdown.map((item, idx) => (
                  <div
                    key={idx}
                    className="py-1.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 text-xs"
                  >
                    <div className="flex items-baseline gap-2 shrink-0">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {item.criterion}
                      </span>
                      <span aria-hidden="true" className="text-slate-400">
                        ·
                      </span>
                      <span className="font-medium text-blue-700 dark:text-blue-400">
                        {item.rating}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-300 sm:text-right leading-snug">
                      {item.finding}
                    </p>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      {subPane === "notes" ? (
        /* ================= BUILT-IN MARKDOWN & NOTE WORKSPACE ================= */
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Built-In Markdown &amp; Note Workspace
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Tweak notes, structure meeting takeaways, or refine Markdown before exporting to .md, Notion, or JSON
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleInsertExtractedBriefIntoNotes}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Insert Extracted Brief</span>
              </button>

              <button
                type="button"
                onClick={handleSaveWorkspaceNotes}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {notesSavedFeedback ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Notes</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Formatting Quick-Insert Toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => insertMarkdownSnippet("## Section Heading")}
              className="px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              H2
            </button>
            <button
              type="button"
              onClick={() => insertMarkdownSnippet("**Key Decision:** ")}
              className="px-2 py-1 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              Bold
            </button>
            <button
              type="button"
              onClick={() => insertMarkdownSnippet("- Bullet takeaway")}
              className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              • List
            </button>
            <button
              type="button"
              onClick={() => insertMarkdownSnippet("- [ ] Follow-up action")}
              className="px-2 py-1 text-xs font-mono text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              [ ] Task
            </button>
            <button
              type="button"
              onClick={() => insertMarkdownSnippet("> Callout / key context")}
              className="px-2 py-1 text-xs text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded cursor-pointer whitespace-nowrap shrink-0"
            >
              Quote
            </button>
          </div>

          {/* Side-by-Side Markdown Editor + Rendered Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
            <div className="flex flex-col">
              <label
                htmlFor="workspace-notes-editor"
                className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Markdown Editor
              </label>
              <textarea
                id="workspace-notes-editor"
                ref={notesTextareaRef}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={() => {
                  if (notesDraft !== (record.workspaceNotes || "")) {
                    onUpdateNotes(record.id, notesDraft);
                  }
                }}
                placeholder="Add personal notes, meeting context, or Markdown edits before exporting..."
                rows={11}
                className="flex-1 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5 text-xs font-mono leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 resize-y min-h-[240px]"
              />
            </div>

            <div className="flex flex-col">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Live Formatted Preview
              </span>
              <div className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 p-3.5 min-h-[240px] overflow-y-auto">
                <SimpleMarkdownPreview markdown={notesDraft} />
              </div>
            </div>
          </div>
        </div>
      ) : subPane === "attachments" ? (
        /* ================= DEDICATED EMAIL ATTACHED FILES PANE ================= */
        <div className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Attached &amp; Referenced Files for This Email
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                {
                  attachmentsList.filter((a) => a.origin !== "referenced")
                    .length
                }{" "}
                attached ·{" "}
                {
                  attachmentsList.filter((a) => a.origin === "referenced")
                    .length
                }{" "}
                mentioned in email body
              </p>
            </div>

            <button
              type="button"
              onClick={() => attachFileRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Attach File</span>
            </button>
          </div>

          {attachmentsList.length === 0 ? (
            <div className="py-10 text-center border-t border-slate-200 dark:border-slate-800">
              <Paperclip className="w-6 h-6 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                No files attached or mentioned in this email
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                Click Attach File above to store a companion PDF, Word (.docx), spreadsheet, or screenshot alongside this record.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
              {attachmentsList.map((att) => {
                const isRealFile = att.origin !== "referenced";
                return (
                  <div
                    key={att.id}
                    className="py-3.5 flex flex-wrap items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                          {att.fileName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          <span>
                            {att.origin === "eml"
                              ? "Embedded in .eml"
                              : att.origin === "uploaded"
                                ? "Attached file"
                                : `Mentioned in text (${att.mimeType})`}
                          </span>
                          {att.sizeBytes !== undefined && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">
                                {formatFileSize(att.sizeBytes)}
                              </span>
                            </>
                          )}
                        </div>
                        {att.contextNote && (
                          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                            {att.contextNote}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPreviewAttachment(att)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{isRealFile ? "Preview" : "Details"}</span>
                      </button>

                      {isRealFile ? (
                        <button
                          type="button"
                          onClick={() => void handleDownloadAttachment(att)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => attachFileRef.current?.click()}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload File</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Section 01: Dynamic User-Chosen Summary Points + 1-Click Copy + Inline Editor */}
          <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                  01. Key Summary ({pointCount}{" "}
                  {pointCount === 1 ? "Point" : "Points"})
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopySummarySection()}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedSummaryOnly ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Summary</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!isEditingSummary) {
                      setTitleDraft(record.documentTitle);
                      setBulletsDraft(
                        record.summaryBullets.map((b) => ({ ...b }))
                      );
                    }
                    setIsEditingSummary((prev) => !prev);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditingSummary ? "Close Editor" : "Edit Summary"}</span>
                </button>
              </div>
            </div>

            {isEditingSummary ? (
              <div className="space-y-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Document title
                  </label>
                  <input
                    type="text"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div className="space-y-2.5">
                  {bulletsDraft.map((b, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start"
                    >
                      <input
                        type="text"
                        value={b.lead}
                        onChange={(e) => {
                          const next = [...bulletsDraft];
                          next[idx] = { ...next[idx], lead: e.target.value };
                          setBulletsDraft(next);
                        }}
                        placeholder="Lead label"
                        className="sm:col-span-4 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-slate-900 dark:text-slate-100"
                      />
                      <div className="sm:col-span-8 flex items-start gap-1.5">
                        <input
                          type="text"
                          value={b.detail}
                          onChange={(e) => {
                            const next = [...bulletsDraft];
                            next[idx] = { ...next[idx], detail: e.target.value };
                            setBulletsDraft(next);
                          }}
                          placeholder="Summary detail"
                          className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        />
                        {bulletsDraft.length > 1 && (
                          <button
                            type="button"
                            onClick={() =>
                              setBulletsDraft(
                                bulletsDraft.filter((_, i) => i !== idx)
                              )
                            }
                            aria-label="Remove summary point"
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  {bulletsDraft.length < 10 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setBulletsDraft([
                          ...bulletsDraft,
                          {
                            lead: `Point ${bulletsDraft.length + 1}`,
                            detail: "",
                          },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add point</span>
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">Max 10 points</span>
                  )}

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingSummary(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSummaryEdits}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                    >
                      Save Summary
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <ol className="space-y-3.5">
                {record.summaryBullets.map((bullet, idx) => (
                  <li
                    key={idx}
                    className="group flex items-baseline justify-between gap-3 text-sm leading-relaxed text-slate-700 dark:text-slate-300"
                  >
                    <div className="flex items-baseline gap-3.5 min-w-0">
                      <span className="font-mono text-xs text-slate-400 dark:text-slate-500 tabular-nums select-none shrink-0">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <p>
                        <strong className="font-semibold text-slate-900 dark:text-slate-100">
                          {bullet.lead.replace(/:$/, "")}:
                        </strong>{" "}
                        {bullet.detail}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleCopySingleBullet(bullet, idx)}
                      aria-label={`Copy point ${idx + 1}`}
                      title="Copy point"
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded transition-opacity shrink-0 cursor-pointer"
                    >
                      {copiedBulletIdx === idx ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {readingMode === "skim" && (
            <div className="px-5 py-3.5 sm:px-6 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>
                Skim mode shows summary only · {record.actionItems.length}{" "}
                {record.actionItems.length === 1
                  ? "action item"
                  : "action items"}
                {record.calendarEvents.length > 0
                  ? ` · ${record.calendarEvents.length} calendar ${
                      record.calendarEvents.length === 1 ? "invite" : "invites"
                    }`
                  : ""}{" "}
                · {readingMetrics.sourceWordCount.toLocaleString()} source{" "}
                {readingMetrics.sourceWordCount === 1 ? "word" : "words"} hidden
              </span>
              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={() => handleSelectReadingMode("fast")}
                  className="font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Fast: Summary + Tasks ({readingMetrics.fastLabel})
                </button>
                <span
                  aria-hidden="true"
                  className="text-slate-300 dark:text-slate-700"
                >
                  ·
                </span>
                <button
                  type="button"
                  onClick={() => handleSelectReadingMode("deep")}
                  className="font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Deep: Full Context ({readingMetrics.deepLabel})
                </button>
              </div>
            </div>
          )}

          {/* Section 02: Actionable Tasks, Kanban Board & Smart Conflict Detection (Fast & Deep Modes) */}
          {(readingMode === "fast" || readingMode === "deep") && (
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    02. Action Extractor (Tasks &amp; Kanban Board)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    {completedCount} of {record.actionItems.length} completed ·{" "}
                    {
                      record.actionItems.filter(
                        (t) => getTaskKanbanStatus(t) === "in_progress"
                      ).length
                    }{" "}
                    in progress
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* List | Kanban Board Layout Toggle */}
                  <div
                    role="group"
                    aria-label="Task display layout"
                    className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg"
                  >
                    <button
                      type="button"
                      onClick={() => setTaskLayout("list")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        taskLayout === "list"
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <LayoutList className="w-3.5 h-3.5" />
                      <span>List</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskLayout("board")}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        taskLayout === "board"
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      <Columns3 className="w-3.5 h-3.5" />
                      <span>Kanban</span>
                    </button>
                  </div>

                  <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setTaskOwnerFilter("all")}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        taskOwnerFilter === "all"
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      All Tasks
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskOwnerFilter("mine")}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        taskOwnerFilter === "mine"
                          ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                      }`}
                    >
                      For You
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddingTask((prev) => !prev)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Task</span>
                  </button>
                </div>
              </div>

              {isAddingTask && (
                <form
                  onSubmit={handleCreateManualTask}
                  className="mb-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-3">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Task description
                      </label>
                      <input
                        type="text"
                        required
                        value={newTaskTitle}
                        onChange={(e) => setNewTaskTitle(e.target.value)}
                        placeholder="Enter task title"
                        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Owner
                      </label>
                      <input
                        type="text"
                        value={newTaskOwner}
                        onChange={(e) => setNewTaskOwner(e.target.value)}
                        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Due date (YYYY-MM-DD or text)
                      </label>
                      <input
                        type="text"
                        value={newTaskDue}
                        onChange={(e) => setNewTaskDue(e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Priority
                      </label>
                      <select
                        value={newTaskPriority}
                        onChange={(e) =>
                          setNewTaskPriority(e.target.value as PriorityLevel)
                        }
                        className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      >
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingTask(false)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Save Task
                    </button>
                  </div>
                </form>
              )}

              {filteredTasks.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4">
                  {record.actionItems.length === 0
                    ? "No mandatory action items detected for this document."
                    : "No action items match the current owner filter."}
                </p>
              ) : taskLayout === "board" ? (
                /* ================= INTERACTIVE KANBAN BOARD (TO DO / IN PROGRESS / DONE) ================= */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {(
                    [
                      { status: "todo" as KanbanStatus, label: "To Do" },
                      {
                        status: "in_progress" as KanbanStatus,
                        label: "In Progress",
                      },
                      { status: "done" as KanbanStatus, label: "Done" },
                    ] as const
                  ).map((col) => {
                    const colTasks = filteredTasks.filter(
                      (item) => getTaskKanbanStatus(item) === col.status
                    );
                    const isOver = dragOverColumn === col.status;

                    return (
                      <div
                        key={col.status}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragOverColumn !== col.status) {
                            setDragOverColumn(col.status);
                          }
                        }}
                        onDragLeave={() => {
                          if (dragOverColumn === col.status) {
                            setDragOverColumn(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const droppedId =
                            e.dataTransfer.getData("text/plain") ||
                            draggedTaskId;
                          setDragOverColumn(null);
                          setDraggedTaskId(null);
                          if (droppedId) {
                            onUpdateTaskStatus(
                              record.id,
                              droppedId,
                              col.status
                            );
                          }
                        }}
                        className={`rounded-lg border p-3 flex flex-col gap-2.5 min-h-[220px] transition-colors ${
                          isOver
                            ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                            : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-slate-200/80 dark:border-slate-800/80">
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {col.label}
                          </span>
                          <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                            {colTasks.length}
                          </span>
                        </div>

                        {colTasks.length === 0 ? (
                          <div className="flex-1 flex items-center justify-center text-center px-2 py-6">
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              Drag tasks here or switch stage
                            </p>
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {colTasks.map((item) => {
                              const taskConflicts =
                                conflictLookup.byTaskUid.get(
                                  `${record.id}::${item.id}`
                                ) ?? [];
                              const deadlineCalEvent = item.dueDateIso
                                ? actionItemToCalendarEvent(
                                    item,
                                    record.documentTitle
                                  )
                                : null;

                              return (
                                <div
                                  key={item.id}
                                  draggable
                                  onDragStart={(e) => {
                                    e.dataTransfer.setData(
                                      "text/plain",
                                      item.id
                                    );
                                    e.dataTransfer.effectAllowed = "move";
                                    setDraggedTaskId(item.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedTaskId(null);
                                    setDragOverColumn(null);
                                  }}
                                  className={`rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2 cursor-grab active:cursor-grabbing transition-opacity ${
                                    draggedTaskId === item.id
                                      ? "opacity-50"
                                      : ""
                                  }`}
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-start gap-1.5 min-w-0">
                                      <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                                      <p
                                        className={`text-xs font-medium leading-snug ${
                                          col.status === "done"
                                            ? "line-through text-slate-400 dark:text-slate-500"
                                            : "text-slate-900 dark:text-slate-100"
                                        }`}
                                      >
                                        {item.title}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onDeleteTask(record.id, item.id)
                                      }
                                      aria-label="Delete task"
                                      className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded shrink-0 cursor-pointer"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>

                                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                                    <PriorityIndicator priority={item.priority} />
                                    <span aria-hidden="true">·</span>
                                    <span>{item.owner || "You"}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono">
                                      {item.dueDateText || "No deadline"}
                                    </span>
                                  </div>

                                  {taskConflicts.length > 0 && (
                                    <div className="rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/30 px-2.5 py-1.5 text-[11px] text-amber-900 dark:text-amber-300 space-y-1">
                                      <div className="flex items-start gap-1.5">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                        <span className="leading-snug">
                                          {taskConflicts[0].message}
                                        </span>
                                      </div>
                                      {onOpenRecord &&
                                        taskConflicts[0].targetRecordId !==
                                          record.id && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onOpenRecord(
                                                taskConflicts[0].targetRecordId
                                              )
                                            }
                                            className="inline-flex items-center gap-0.5 font-medium text-amber-800 dark:text-amber-200 hover:underline cursor-pointer"
                                          >
                                            <span>Open conflicting item</span>
                                            <ArrowUpRight className="w-3 h-3" />
                                          </button>
                                        )}
                                    </div>
                                  )}

                                  <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                    <select
                                      aria-label={`Stage for ${item.title}`}
                                      value={col.status}
                                      onChange={(e) =>
                                        onUpdateTaskStatus(
                                          record.id,
                                          item.id,
                                          e.target.value as KanbanStatus
                                        )
                                      }
                                      className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-2 py-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
                                    >
                                      <option value="todo">To Do</option>
                                      <option value="in_progress">
                                        In Progress
                                      </option>
                                      <option value="done">Done</option>
                                    </select>

                                    {deadlineCalEvent && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDownloadTaskDeadlineIcs(item)
                                        }
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer whitespace-nowrap shrink-0"
                                      >
                                        <CalendarPlus className="w-3 h-3" />
                                        <span>.ics</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-slate-200/80 dark:divide-slate-800/80 border-t border-b border-slate-200 dark:border-slate-800">
                  {filteredTasks.map((item) => {
                    const isEditing =
                      editingTaskId === item.id && taskDraft !== null;

                    if (isEditing && taskDraft) {
                      return (
                        <div
                          key={item.id}
                          className={`px-4 py-3.5 space-y-3 ${getPrioritySurfaceClasses(
                            taskDraft.priority,
                            false
                          )}`}
                        >
                          <input
                            type="text"
                            value={taskDraft.title}
                            onChange={(e) =>
                              setTaskDraft({
                                ...taskDraft,
                                title: e.target.value,
                              })
                            }
                            className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              value={taskDraft.owner}
                              onChange={(e) =>
                                setTaskDraft({
                                  ...taskDraft,
                                  owner: e.target.value,
                                })
                              }
                              placeholder="Owner"
                              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            />
                            <input
                              type="text"
                              value={taskDraft.dueDateText}
                              onChange={(e) => {
                                const val = e.target.value;
                                const trimmedVal = val.trim();
                                const isoMatch =
                                  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?$/.test(
                                    trimmedVal
                                  )
                                    ? trimmedVal.replace(" ", "T")
                                    : taskDraft.dueDateIso;
                                setTaskDraft({
                                  ...taskDraft,
                                  dueDateText: val,
                                  dueDateIso: isoMatch,
                                });
                              }}
                              placeholder="Due date (YYYY-MM-DD or text)"
                              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            />
                            <select
                              value={taskDraft.priority}
                              onChange={(e) =>
                                setTaskDraft({
                                  ...taskDraft,
                                  priority: e.target.value as PriorityLevel,
                                })
                              }
                              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            >
                              <option value="High">High</option>
                              <option value="Medium">Medium</option>
                              <option value="Low">Low</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTaskId(null);
                                setTaskDraft(null);
                              }}
                              className="px-2.5 py-1 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateTask(record.id, taskDraft);
                                setEditingTaskId(null);
                                setTaskDraft(null);
                                onNotifyToast?.("Updated task details");
                              }}
                              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                            >
                              Apply
                            </button>
                          </div>
                        </div>
                      );
                    }

                    const deadlineCalEvent = item.dueDateIso
                      ? actionItemToCalendarEvent(item, record.documentTitle)
                      : null;
                    const taskStatus = getTaskKanbanStatus(item);
                    const taskConflicts =
                      conflictLookup.byTaskUid.get(
                        `${record.id}::${item.id}`
                      ) ?? [];

                    return (
                      <div
                        key={item.id}
                        className={`px-4 py-3.5 flex items-start justify-between gap-4 group transition-colors ${getPrioritySurfaceClasses(
                          item.priority,
                          item.completed
                        )}`}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={item.completed}
                            onChange={() => onToggleTask(record.id, item.id)}
                            aria-label={`Mark "${item.title}" as completed`}
                            className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-sm font-medium leading-snug ${
                                item.completed
                                  ? "line-through text-slate-500 dark:text-slate-400"
                                  : "text-slate-900 dark:text-slate-100"
                              }`}
                            >
                              {item.title}
                            </p>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                              <PriorityIndicator priority={item.priority} />
                              <span aria-hidden="true">·</span>
                              <span>Owner: {item.owner || "You"}</span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-[11px]">
                                {item.dueDateText || "No fixed deadline"}
                              </span>
                            </div>

                            {item.sourceSnippet && (
                              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 italic line-clamp-2">
                                “{item.sourceSnippet}”
                              </p>
                            )}

                            {taskConflicts.length > 0 && (
                              <div className="mt-2 rounded-lg border border-amber-200/90 dark:border-amber-900/60 bg-white/85 dark:bg-slate-900/80 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span>{taskConflicts[0].message}</span>
                                </span>
                                {onOpenRecord &&
                                  taskConflicts[0].targetRecordId !==
                                    record.id && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenRecord(
                                          taskConflicts[0].targetRecordId
                                        )
                                      }
                                      className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      <span>Open conflict</span>
                                      <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                  )}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            aria-label={`Stage for ${item.title}`}
                            value={taskStatus}
                            onChange={(e) =>
                              onUpdateTaskStatus(
                                record.id,
                                item.id,
                                e.target.value as KanbanStatus
                              )
                            }
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
                          >
                            <option value="todo">To Do</option>
                            <option value="in_progress">In Progress</option>
                            <option value="done">Done</option>
                          </select>

                          {deadlineCalEvent && (
                            <>
                              <a
                                href={buildGoogleCalendarUrl(
                                  deadlineCalEvent,
                                  timezone
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Add deadline to Google Calendar"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-white/70 dark:hover:bg-slate-900/60 rounded transition-colors whitespace-nowrap shrink-0"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span className="hidden xl:inline">
                                  Google Cal
                                </span>
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadTaskDeadlineIcs(item)
                                }
                                title="Download deadline reminder (.ics)"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 hover:bg-white/70 dark:hover:bg-slate-900/60 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                <CalendarPlus className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">.ics</span>
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTaskId(item.id);
                              setTaskDraft({ ...item });
                            }}
                            aria-label="Edit task"
                            className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded hover:bg-white/70 dark:hover:bg-slate-900/60 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteTask(record.id, item.id)}
                            aria-label="Delete task"
                            className="p-1.5 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 rounded hover:bg-white/70 dark:hover:bg-slate-900/60 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {readingMode === "fast" && (
            <div className="px-5 py-3.5 sm:px-6 bg-slate-50/70 dark:bg-slate-950/40 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>
                Fast mode shows summary + action items
                {record.calendarEvents.length > 0
                  ? ` · ${record.calendarEvents.length} calendar ${
                      record.calendarEvents.length === 1 ? "invite" : "invites"
                    }`
                  : ""}{" "}
                · Full source context (
                {readingMetrics.sourceWordCount.toLocaleString()}{" "}
                {readingMetrics.sourceWordCount === 1 ? "word" : "words"})
                available in Deep mode
              </span>
              <button
                type="button"
                onClick={() => handleSelectReadingMode("deep")}
                className="font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                Switch to Deep ({readingMetrics.deepLabel})
              </button>
            </div>
          )}

          {/* Section 03 & 04: Calendar Invites + Full Source Context (Deep Reading Mode) */}
          {readingMode === "deep" && (
            <>
              <div className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  03. 1-Click Calendar Integration (.ics &amp; Google Calendar)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {record.calendarEvents.length} scheduled{" "}
                  {record.calendarEvents.length === 1 ? "event" : "events"} ·
                  Country: {record.countryName || countryName}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (isAddingEvent) setIsAddingEvent(false);
                    else openManualEventCreator();
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Event</span>
                </button>

                {record.calendarEvents.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDownloadAllEvents}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Combined .ics</span>
                  </button>
                )}
              </div>
            </div>

            {isAddingEvent && (
              <form
                onSubmit={handleCreateManualEvent}
                className="mb-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Reminder or meeting title
                    </label>
                    <input
                      type="text"
                      required
                      value={newEventTitle}
                      onChange={(e) => setNewEventTitle(e.target.value)}
                      className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Start ({newEventAllDay ? "YYYY-MM-DD" : "YYYY-MM-DDTHH:mm:ss"})
                    </label>
                    <input
                      type="text"
                      value={newEventStart}
                      onChange={(e) => setNewEventStart(e.target.value)}
                      className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      End ({newEventAllDay ? "YYYY-MM-DD" : "YYYY-MM-DDTHH:mm:ss"})
                    </label>
                    <input
                      type="text"
                      value={newEventEnd}
                      onChange={(e) => setNewEventEnd(e.target.value)}
                      className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      Location or meeting link (optional)
                    </label>
                    <input
                      type="text"
                      value={newEventLocation}
                      onChange={(e) => setNewEventLocation(e.target.value)}
                      placeholder="Room, address, or video call link"
                      className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newEventAllDay}
                      onChange={(e) => setNewEventAllDay(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600"
                    />
                    <span>All-day reminder</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingEvent(false)}
                      className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                    >
                      Save Reminder
                    </button>
                  </div>
                </div>
              </form>
            )}

            {record.calendarEvents.length === 0 ? (
              hasZeroDatesInSource ? (
                /* Automated Data Validation & Edge-Case Fallback when no dates/deadlines exist */
                <div className="p-4 rounded-lg bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      No explicit dates or deadlines found in this text
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Because the source contains no calendar dates, Distill avoided guessing times. You can schedule a custom follow-up reminder or set a task due date manually.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={openManualEventCreator}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" />
                      <span>Schedule Follow-Up</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingTask(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Set Task Date</span>
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                  No standalone meetings found. Task deadlines above can be exported as .ics reminders directly from each task row.
                </p>
              )
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
                {record.calendarEvents.map((ev) => {
                  const isEditingEv =
                    editingEventId === ev.id && eventDraft !== null;
                  const isPreviewOpen = previewIcsEventId === ev.id;

                  if (isEditingEv && eventDraft) {
                    return (
                      <div key={ev.id} className="py-4 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Event title
                            </label>
                            <input
                              type="text"
                              value={eventDraft.title}
                              onChange={(e) =>
                                setEventDraft({
                                  ...eventDraft,
                                  title: e.target.value,
                                })
                              }
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Start (
                              {eventDraft.isAllDay
                                ? "YYYY-MM-DD"
                                : "YYYY-MM-DDTHH:mm:ss"}
                              )
                            </label>
                            <input
                              type="text"
                              value={eventDraft.startIso}
                              onChange={(e) =>
                                setEventDraft({
                                  ...eventDraft,
                                  startIso: e.target.value,
                                })
                              }
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              End (
                              {eventDraft.isAllDay
                                ? "YYYY-MM-DD"
                                : "YYYY-MM-DDTHH:mm:ss"}
                              )
                            </label>
                            <input
                              type="text"
                              value={eventDraft.endIso}
                              onChange={(e) =>
                                setEventDraft({
                                  ...eventDraft,
                                  endIso: e.target.value,
                                })
                              }
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                              Location or meeting URL
                            </label>
                            <input
                              type="text"
                              value={eventDraft.location}
                              onChange={(e) =>
                                setEventDraft({
                                  ...eventDraft,
                                  location: e.target.value,
                                })
                              }
                              className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={eventDraft.isAllDay}
                              onChange={(e) =>
                                setEventDraft({
                                  ...eventDraft,
                                  isAllDay: e.target.checked,
                                })
                              }
                              className="rounded border-slate-300 text-blue-600"
                            />
                            <span>All-day event</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingEventId(null);
                                setEventDraft(null);
                              }}
                              className="px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onUpdateEvent(record.id, eventDraft);
                                setEditingEventId(null);
                                setEventDraft(null);
                                onNotifyToast?.("Updated calendar event");
                              }}
                              className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md cursor-pointer"
                            >
                              Save Event
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={ev.id} className="py-4 space-y-2.5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {ev.title}
                          </p>

                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                            <span className="font-mono text-slate-700 dark:text-slate-300">
                              {formatEventDateRange(ev)}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{ev.eventType}</span>
                            {ev.statusNote && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{ev.statusNote}</span>
                              </>
                            )}
                          </div>

                          {ev.location && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 mt-1.5">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">{ev.location}</span>
                            </div>
                          )}

                          {ev.attendees && ev.attendees.length > 0 && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate">
                                {ev.attendees.join(", ")}
                              </span>
                            </div>
                          )}

                          {ev.description && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                              {ev.description}
                            </p>
                          )}

                          {(() => {
                            const evConflicts =
                              conflictLookup.byEventUid.get(
                                `${record.id}::${ev.id}`
                              ) ?? [];
                            if (evConflicts.length === 0) return null;
                            return (
                              <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                                  <span>{evConflicts[0].message}</span>
                                </span>
                                {onOpenRecord &&
                                  evConflicts[0].targetRecordId !==
                                    record.id && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onOpenRecord(
                                          evConflicts[0].targetRecordId
                                        )
                                      }
                                      className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                                    >
                                      <span>Open conflict</span>
                                      <ArrowUpRight className="w-3 h-3" />
                                    </button>
                                  )}
                              </div>
                            );
                          })()}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewIcsEventId(isPreviewOpen ? null : ev.id)
                            }
                            title="Inspect RFC 5545 .ics payload"
                            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Code2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEventId(ev.id);
                              setEventDraft({ ...ev });
                            }}
                            title="Edit event time or location"
                            className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <a
                            href={buildGoogleCalendarUrl(ev, timezone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Google Calendar</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleDownloadSingleEvent(ev)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>.ics File</span>
                          </button>
                        </div>
                      </div>

                      {isPreviewOpen && (
                        <div className="pt-2">
                          <pre className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto leading-relaxed">
                            {generateIcsContent([ev], timezone, ev.title)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

              {/* Section 04: Full Source Context */}
              <div className="p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      04. Full Source Context
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      <span>
                        {record.sourceMode === InputSourceMode.VoiceNote
                          ? record.sourceFileName
                            ? `Voice note transcript (${record.sourceFileName})`
                            : "Voice note transcript"
                          : record.sourceMode === InputSourceMode.UploadFile
                            ? record.sourceFileName
                              ? `Uploaded file: ${record.sourceFileName}`
                              : "Uploaded document"
                            : "Pasted source text"}
                      </span>
                      {record.senderOrSource && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Sender: {record.senderOrSource}</span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>
                        {readingMetrics.sourceWordCount.toLocaleString()}{" "}
                        {readingMetrics.sourceWordCount === 1
                          ? "word"
                          : "words"}
                      </span>
                      {!readingMetrics.hasFullSourceText && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>Stored preview excerpt</span>
                        </>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleCopySourceContext()}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedSourceText ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Copied Source</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Source</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 p-4 max-h-96 overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs sm:text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                    {readingMetrics.resolvedSourceDisplay}
                  </pre>
                </div>

                {readingMetrics.extraAttachmentTexts.length > 0 && (
                  <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
                    <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Companion Attachment Transcripts
                    </h4>
                    {readingMetrics.extraAttachmentTexts.map((att, idx) => (
                      <div key={idx} className="space-y-1.5">
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {att.fileName}
                        </p>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 p-3.5 max-h-60 overflow-y-auto">
                          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                            {att.text}
                          </pre>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!readingMetrics.hasFullSourceText &&
                  record.actionItems.some((item) =>
                    Boolean(item.sourceSnippet)
                  ) && (
                    <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2">
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Extracted Verbatim Citations
                      </h4>
                      <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                        {record.actionItems
                          .filter((item) => Boolean(item.sourceSnippet))
                          .map((item) => (
                            <li key={item.id} className="leading-relaxed">
                              <span className="font-medium text-slate-800 dark:text-slate-200">
                                {item.title}:
                              </span>{" "}
                              <span className="italic">
                                “{item.sourceSnippet}”
                              </span>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
              </div>
            </>
          )}
        </>
      )}

      <AttachmentPreviewModal
        attachment={previewAttachment}
        documentTitle={record.documentTitle}
        onClose={() => setPreviewAttachment(null)}
      />
    </section>
  );
};
