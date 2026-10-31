import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Download,
  CalendarPlus,
  ExternalLink,
  ArrowUpRight,
  X,
  Columns3,
  LayoutList,
  GripVertical,
  AlertTriangle,
} from "lucide-react";
import {
  ActionItem,
  ExtractionRecord,
  KanbanStatus,
  MailClassification,
  PriorityLevel,
  getTaskKanbanStatus,
} from "../types";
import {
  PriorityIndicator,
  getPrioritySurfaceClasses,
  isPromotionalOrNoiseMail,
} from "./ExtractionResultView";
import {
  actionItemToCalendarEvent,
  buildGoogleCalendarUrl,
  generateIcsContent,
  slugifyFilename,
  triggerIcsDownload,
} from "../utils/icsGenerator";
import { buildWorkspaceConflictLookup } from "../utils/conflictDetector";

interface ActionQueueViewProps {
  records: ExtractionRecord[];
  timezone: string;
  onToggleTask: (recordId: string, taskId: string) => void;
  onUpdateTaskStatus: (
    recordId: string,
    taskId: string,
    status: KanbanStatus
  ) => void;
  onOpenRecord: (recordId: string) => void;
  onStartNewExtraction: () => void;
}

interface FlattenedTask {
  recordId: string;
  documentTitle: string;
  classification?: MailClassification;
  task: ActionItem;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HighlightMatch: React.FC<{ text: string; query: string }> = ({
  text,
  query,
}) => {
  const tokens = query
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (!text || tokens.length === 0) {
    return <>{text}</>;
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join("|")})`, "gi");
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, idx) => {
        const isMatch = tokens.some(
          (token) => token.toLowerCase() === part.toLowerCase()
        );
        return isMatch ? (
          <mark
            key={idx}
            className="bg-amber-200/80 dark:bg-amber-500/35 text-slate-900 dark:text-slate-100 rounded-xs px-0.5"
          >
            {part}
          </mark>
        ) : (
          <React.Fragment key={idx}>{part}</React.Fragment>
        );
      })}
    </>
  );
};

export const ActionQueueView: React.FC<ActionQueueViewProps> = ({
  records,
  timezone,
  onToggleTask,
  onUpdateTaskStatus,
  onOpenRecord,
  onStartNewExtraction,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [viewLayout, setViewLayout] = useState<"list" | "board">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | KanbanStatus>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | PriorityLevel>(
    "all"
  );
  const [hidePromotional, setHidePromotional] = useState<boolean>(true);
  const [draggedItem, setDraggedItem] = useState<{
    recordId: string;
    taskId: string;
  } | null>(null);
  const [dragOverCol, setDragOverCol] = useState<KanbanStatus | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const conflictLookup = useMemo(
    () => buildWorkspaceConflictLookup(records, timezone),
    [records, timezone]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "/") return;
      const active = document.activeElement;
      const tag = active?.tagName.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        (active as HTMLElement | null)?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const allTasks = useMemo<FlattenedTask[]>(() => {
    const list: FlattenedTask[] = [];
    for (const rec of records) {
      for (const task of rec.actionItems) {
        list.push({
          recordId: rec.id,
          documentTitle: rec.documentTitle,
          classification: rec.mailEvaluation?.classification,
          task,
        });
      }
    }
    const priorityRank: Record<PriorityLevel, number> = {
      High: 0,
      Medium: 1,
      Low: 2,
    };
    return list.sort((a, b) => {
      if (a.task.completed !== b.task.completed) {
        return a.task.completed ? 1 : -1;
      }
      const pDiff = priorityRank[a.task.priority] - priorityRank[b.task.priority];
      if (pDiff !== 0) return pDiff;
      return (a.task.dueDateIso || "9999").localeCompare(
        b.task.dueDateIso || "9999"
      );
    });
  }, [records]);

  const filteredTasks = useMemo(() => {
    const tokens = searchQuery
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);

    return allTasks.filter(({ documentTitle, classification, task }) => {
      if (hidePromotional && isPromotionalOrNoiseMail(classification)) {
        return false;
      }
      const stage = getTaskKanbanStatus(task);
      if (statusFilter !== "all" && stage !== statusFilter) return false;
      if (priorityFilter !== "all" && task.priority !== priorityFilter) {
        return false;
      }
      if (tokens.length === 0) return true;

      const searchableBlob = [
        task.title,
        task.owner,
        task.dueDateText,
        task.priority,
        task.sourceSnippet,
        documentTitle,
        classification || "",
      ]
        .join(" ")
        .toLowerCase();

      return tokens.every((token) => searchableBlob.includes(token));
    });
  }, [allTasks, searchQuery, statusFilter, priorityFilter, hidePromotional]);

  const promoTaskCount = useMemo(
    () =>
      allTasks.filter((t) => isPromotionalOrNoiseMail(t.classification)).length,
    [allTasks]
  );

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    statusFilter !== "all" ||
    priorityFilter !== "all" ||
    (hidePromotional && promoTaskCount > 0);

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPriorityFilter("all");
    setHidePromotional(false);
    searchInputRef.current?.focus();
  };

  const handleExportCsv = () => {
    const headers = [
      "Stage",
      "Priority",
      "Task",
      "Owner",
      "Due Date",
      "Source Document",
      "Mail Classification",
    ];
    const escapeCsv = (val: string) => `"${(val || "").replace(/"/g, '""')}"`;
    const rows = filteredTasks.map(({ documentTitle, classification, task }) => {
      const stage = getTaskKanbanStatus(task);
      const stageLabel =
        stage === "done"
          ? "Done"
          : stage === "in_progress"
            ? "In Progress"
            : "To Do";
      return [
        escapeCsv(stageLabel),
        escapeCsv(task.priority),
        escapeCsv(task.title),
        escapeCsv(task.owner),
        escapeCsv(task.dueDateText),
        escapeCsv(documentTitle),
        escapeCsv(classification || "Action Required"),
      ];
    });
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "distill-action-items.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const todoCount = allTasks.filter(
    (t) => getTaskKanbanStatus(t.task) === "todo"
  ).length;
  const inProgressCount = allTasks.filter(
    (t) => getTaskKanbanStatus(t.task) === "in_progress"
  ).length;
  const doneCount = allTasks.filter(
    (t) => getTaskKanbanStatus(t.task) === "done"
  ).length;

  return (
    <section
      aria-label="Unified Action Queue and Kanban Board"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800"
    >
      {/* Header Toolbar */}
      <div className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Unified Action Queue &amp; Kanban Board
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {todoCount} to do · {inProgressCount} in progress · {doneCount} done
            across {records.length}{" "}
            {records.length === 1 ? "document" : "documents"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {allTasks.length > 0 && (
            <>
              <div
                role="group"
                aria-label="Action Queue layout mode"
                className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                <button
                  type="button"
                  onClick={() => setViewLayout("list")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewLayout === "list"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <LayoutList className="w-3.5 h-3.5" />
                  <span>List View</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewLayout("board")}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    viewLayout === "board"
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  <Columns3 className="w-3.5 h-3.5" />
                  <span>Kanban Board</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                disabled={filteredTasks.length === 0}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Local Keyword Search Bar & Filter Controls */}
      <div className="px-5 py-4 sm:px-6 flex flex-col gap-3 bg-slate-50/60 dark:bg-slate-950/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <label htmlFor="action-queue-keyword-search" className="sr-only">
              Filter tasks by keyword
            </label>
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              id="action-queue-keyword-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && searchQuery) {
                  e.preventDefault();
                  setSearchQuery("");
                }
              }}
              placeholder="Filter tasks by keyword, owner, deadline, or source..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-16 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors"
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear keyword search"
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded transition-colors cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : (
                <span
                  aria-hidden="true"
                  className="text-[11px] font-mono text-slate-400 dark:text-slate-500 px-1.5 select-none"
                >
                  /
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setHidePromotional((prev) => !prev)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                hidePromotional
                  ? "bg-white dark:bg-slate-900 border-blue-600/50 text-blue-700 dark:text-blue-400"
                  : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {hidePromotional ? "Promotional Hidden" : "Include Promotional"}
            </button>

            <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "todo", label: "To Do" },
                  { id: "in_progress", label: "In Progress" },
                  { id: "done", label: "Done" },
                ] as const
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStatusFilter(st.id)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    statusFilter === st.id
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by priority"
              value={priorityFilter}
              onChange={(e) =>
                setPriorityFilter(e.target.value as "all" | PriorityLevel)
              }
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
            >
              <option value="all">All Priorities</option>
              <option value="High">High Priority</option>
              <option value="Medium">Medium Priority</option>
              <option value="Low">Low Priority</option>
            </select>
          </div>
        </div>

        {/* Active Filter / Search Status Line */}
        {hasActiveFilters && allTasks.length > 0 && (
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            <span>
              Showing {filteredTasks.length} of {allTasks.length}{" "}
              {allTasks.length === 1 ? "task" : "tasks"}
              {searchQuery.trim() ? ` matching “${searchQuery.trim()}”` : ""}
              {hidePromotional && promoTaskCount > 0
                ? ` (${promoTaskCount} promotional ${
                    promoTaskCount === 1 ? "item" : "items"
                  } hidden)`
                : ""}
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="text-blue-600 dark:text-blue-400 hover:underline underline-offset-2 font-medium whitespace-nowrap shrink-0 cursor-pointer"
            >
              Show all tasks
            </button>
          </div>
        )}
      </div>

      {allTasks.length === 0 ? (
        <div className="p-10 text-center">
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No extracted action items yet
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
              Tasks, deadlines, and owners extracted from your emails, voice notes, and PDFs appear here so you can manage them in List or Kanban Board view.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onStartNewExtraction}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Extract First Document
              </button>
            </div>
          </div>
        </div>
      ) : filteredTasks.length === 0 && viewLayout === "list" ? (
        <div className="p-10 text-center">
          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
            No tasks match your current filters
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Try searching a different keyword, including promotional items, or resetting active filters.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Clear Search &amp; Filters
            </button>
          </div>
        </div>
      ) : viewLayout === "board" ? (
        /* ================= CROSS-DOCUMENT DRAGGABLE KANBAN BOARD ================= */
        <div className="p-5 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
            {(
              [
                { status: "todo" as KanbanStatus, label: "To Do" },
                { status: "in_progress" as KanbanStatus, label: "In Progress" },
                { status: "done" as KanbanStatus, label: "Done" },
              ] as const
            ).map((col) => {
              const colItems = filteredTasks.filter(
                (entry) => getTaskKanbanStatus(entry.task) === col.status
              );
              const isDropTarget = dragOverCol === col.status;

              return (
                <div
                  key={col.status}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (dragOverCol !== col.status) setDragOverCol(col.status);
                  }}
                  onDragLeave={() => {
                    if (dragOverCol === col.status) setDragOverCol(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverCol(null);
                    const payload = e.dataTransfer.getData("application/json");
                    if (payload) {
                      try {
                        const parsed = JSON.parse(payload) as {
                          recordId: string;
                          taskId: string;
                        };
                        if (parsed.recordId && parsed.taskId) {
                          onUpdateTaskStatus(
                            parsed.recordId,
                            parsed.taskId,
                            col.status
                          );
                        }
                      } catch {
                        // Fallback to state
                      }
                    } else if (draggedItem) {
                      onUpdateTaskStatus(
                        draggedItem.recordId,
                        draggedItem.taskId,
                        col.status
                      );
                    }
                    setDraggedItem(null);
                  }}
                  className={`rounded-xl border p-4 flex flex-col gap-3 min-h-[340px] transition-colors ${
                    isDropTarget
                      ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/20"
                      : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      {col.label}
                    </h3>
                    <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {colItems.length}
                    </span>
                  </div>

                  {colItems.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-center p-4">
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Drop tasks here to move to {col.label}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {colItems.map(({ recordId, documentTitle, task }) => {
                        const taskConflicts =
                          conflictLookup.byTaskUid.get(
                            `${recordId}::${task.id}`
                          ) ?? [];
                        const deadlineEvent = task.dueDateIso
                          ? actionItemToCalendarEvent(task, documentTitle)
                          : null;
                        const isDragging =
                          draggedItem?.recordId === recordId &&
                          draggedItem?.taskId === task.id;

                        return (
                          <div
                            key={`${recordId}-${task.id}`}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData(
                                "application/json",
                                JSON.stringify({
                                  recordId,
                                  taskId: task.id,
                                })
                              );
                              e.dataTransfer.effectAllowed = "move";
                              setDraggedItem({ recordId, taskId: task.id });
                            }}
                            onDragEnd={() => {
                              setDraggedItem(null);
                              setDragOverCol(null);
                            }}
                            className={`rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2.5 cursor-grab active:cursor-grabbing transition-opacity ${
                              isDragging ? "opacity-50" : ""
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <GripVertical className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <p
                                className={`text-xs font-medium leading-snug ${
                                  col.status === "done"
                                    ? "line-through text-slate-400 dark:text-slate-500"
                                    : "text-slate-900 dark:text-slate-100"
                                }`}
                              >
                                <HighlightMatch
                                  text={task.title}
                                  query={searchQuery}
                                />
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              <PriorityIndicator priority={task.priority} />
                              <span aria-hidden="true">·</span>
                              <span>
                                <HighlightMatch
                                  text={task.owner || "You"}
                                  query={searchQuery}
                                />
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono">
                                <HighlightMatch
                                  text={task.dueDateText || "No deadline"}
                                  query={searchQuery}
                                />
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
                              </div>
                            )}

                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenRecord(recordId)}
                                className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 min-w-0 cursor-pointer"
                              >
                                <span className="truncate max-w-[130px]">
                                  {documentTitle}
                                </span>
                                <ArrowUpRight className="w-3 h-3 shrink-0" />
                              </button>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {deadlineEvent && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const ics = generateIcsContent(
                                        [deadlineEvent],
                                        timezone,
                                        deadlineEvent.title
                                      );
                                      triggerIcsDownload(
                                        ics,
                                        slugifyFilename(deadlineEvent.title)
                                      );
                                    }}
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 rounded cursor-pointer"
                                  >
                                    <CalendarPlus className="w-3 h-3" />
                                    <span>.ics</span>
                                  </button>
                                )}

                                <select
                                  aria-label={`Move ${task.title} to stage`}
                                  value={col.status}
                                  onChange={(e) =>
                                    onUpdateTaskStatus(
                                      recordId,
                                      task.id,
                                      e.target.value as KanbanStatus
                                    )
                                  }
                                  className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
                                >
                                  <option value="todo">To Do</option>
                                  <option value="in_progress">
                                    In Progress
                                  </option>
                                  <option value="done">Done</option>
                                </select>
                              </div>
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
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-6 pr-3 w-10">Done</th>
                <th className="py-3 px-3">Action Item &amp; Source</th>
                <th className="py-3 px-3 whitespace-nowrap">Stage</th>
                <th className="py-3 px-3 whitespace-nowrap">Owner</th>
                <th className="py-3 px-3 whitespace-nowrap">Priority</th>
                <th className="py-3 px-3 whitespace-nowrap">Deadline</th>
                <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                  Calendar
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredTasks.map(
                ({ recordId, documentTitle, classification, task }) => {
                  const deadlineEvent = task.dueDateIso
                    ? actionItemToCalendarEvent(task, documentTitle)
                    : null;
                  const stage = getTaskKanbanStatus(task);
                  const taskConflicts =
                    conflictLookup.byTaskUid.get(`${recordId}::${task.id}`) ??
                    [];

                  return (
                    <tr
                      key={`${recordId}-${task.id}`}
                      className={`transition-colors ${getPrioritySurfaceClasses(
                        task.priority,
                        task.completed
                      )}`}
                    >
                      <td className="py-3 pl-6 pr-3 align-top">
                        <input
                          type="checkbox"
                          checked={task.completed}
                          onChange={() => onToggleTask(recordId, task.id)}
                          aria-label={`Complete ${task.title}`}
                          className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 align-top max-w-md">
                        <p
                          className={`text-sm font-medium ${
                            task.completed
                              ? "line-through text-slate-500 dark:text-slate-400"
                              : "text-slate-900 dark:text-slate-100"
                          }`}
                        >
                          <HighlightMatch
                            text={task.title}
                            query={searchQuery}
                          />
                        </p>
                        {task.sourceSnippet &&
                          searchQuery.trim().length > 0 && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic line-clamp-1">
                              “
                              <HighlightMatch
                                text={task.sourceSnippet}
                                query={searchQuery}
                              />
                              ”
                            </p>
                          )}
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                          <button
                            type="button"
                            onClick={() => onOpenRecord(recordId)}
                            className="inline-flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-300 cursor-pointer"
                          >
                            <span className="truncate max-w-[220px]">
                              <HighlightMatch
                                text={documentTitle}
                                query={searchQuery}
                              />
                            </span>
                            <ArrowUpRight className="w-3 h-3 shrink-0" />
                          </button>
                          {classification && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>{classification}</span>
                            </>
                          )}
                        </div>

                        {taskConflicts.length > 0 && (
                          <div className="mt-1.5 rounded-md border border-amber-200 dark:border-amber-900/60 bg-white/85 dark:bg-slate-900/80 px-2.5 py-1 text-xs text-amber-900 dark:text-amber-300 inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>{taskConflicts[0].message}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <select
                          aria-label={`Stage for ${task.title}`}
                          value={stage}
                          onChange={(e) =>
                            onUpdateTaskStatus(
                              recordId,
                              task.id,
                              e.target.value as KanbanStatus
                            )
                          }
                          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none"
                        >
                          <option value="todo">To Do</option>
                          <option value="in_progress">In Progress</option>
                          <option value="done">Done</option>
                        </select>
                      </td>
                      <td className="py-3 px-3 align-top text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        <HighlightMatch
                          text={task.owner || "You"}
                          query={searchQuery}
                        />
                      </td>
                      <td className="py-3 px-3 align-top whitespace-nowrap">
                        <PriorityIndicator priority={task.priority} />
                      </td>
                      <td className="py-3 px-3 align-top text-xs font-mono text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        <HighlightMatch
                          text={task.dueDateText}
                          query={searchQuery}
                        />
                      </td>
                      <td className="py-3 pl-3 pr-6 align-top text-right whitespace-nowrap">
                        {deadlineEvent ? (
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <a
                              href={buildGoogleCalendarUrl(
                                deadlineEvent,
                                timezone
                              )}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-blue-700 dark:hover:text-blue-300 rounded hover:bg-white/70 dark:hover:bg-slate-900/60 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              <span>GCal</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                const ics = generateIcsContent(
                                  [deadlineEvent],
                                  timezone,
                                  deadlineEvent.title
                                );
                                triggerIcsDownload(
                                  ics,
                                  slugifyFilename(deadlineEvent.title)
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white/80 dark:bg-slate-900/70 hover:bg-white dark:hover:bg-slate-900 rounded transition-colors cursor-pointer"
                            >
                              <CalendarPlus className="w-3.5 h-3.5" />
                              <span>.ics</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-600">
                            —
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
