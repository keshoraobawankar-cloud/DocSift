import React, { useState } from "react";
import {
  Search,
  Trash2,
  ArrowUpRight,
  Download,
  Check,
  Paperclip,
  FileCode2,
  CalendarPlus,
} from "lucide-react";
import { ExtractionRecord, MailClassification } from "../types";
import {
  MailClassificationLabel,
  UrgencyIndicator,
} from "./ExtractionResultView";
import {
  downloadBatchBundledIcs,
  downloadBatchConsolidatedMarkdown,
} from "../utils/exporters";

interface SavedDocsViewProps {
  records: ExtractionRecord[];
  activeRecordId: string | null;
  timezone: string;
  onOpenRecord: (recordId: string) => void;
  onOpenRecordAttachments: (recordId: string) => void;
  onDeleteRecord: (recordId: string) => void;
  onClearAllRecords: () => void;
  onStartNewExtraction: () => void;
  onNotifyToast?: (message: string) => void;
}

const CLASSIFICATION_FILTERS: Array<"all" | MailClassification> = [
  "all",
  "Action Required",
  "Promotional / Marketing",
  "Newsletter / Digest",
  "Transactional / Receipt",
  "Informational / FYI",
  "Suspicious / Unsolicited",
];

export const SavedDocsView: React.FC<SavedDocsViewProps> = ({
  records,
  activeRecordId,
  timezone,
  onOpenRecord,
  onOpenRecordAttachments,
  onDeleteRecord,
  onClearAllRecords,
  onStartNewExtraction,
  onNotifyToast,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [classificationFilter, setClassificationFilter] = useState<
    "all" | MailClassification
  >("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [exportedFeedback, setExportedFeedback] = useState(false);

  const filtered = records.filter((rec) => {
    const recClass = rec.mailEvaluation?.classification ?? "Action Required";
    if (classificationFilter !== "all" && recClass !== classificationFilter) {
      return false;
    }
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      rec.documentTitle.toLowerCase().includes(q) ||
      rec.documentType.toLowerCase().includes(q) ||
      rec.senderOrSource.toLowerCase().includes(q) ||
      recClass.toLowerCase().includes(q) ||
      (rec.mailEvaluation?.detectedTone || "").toLowerCase().includes(q) ||
      (rec.mailEvaluation?.urgencyLevel || "").toLowerCase().includes(q)
    );
  });

  const targetExportRecords =
    selectedIds.size > 0
      ? filtered.filter((r) => selectedIds.has(r.id))
      : filtered;

  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const allSelected =
      filtered.length > 0 && filtered.every((r) => selectedIds.has(r.id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((r) => r.id)));
    }
  };

  const handleExportAllJson = () => {
    if (targetExportRecords.length === 0) return;

    const backupPayload = {
      app: "Distill",
      schemaVersion: 2,
      exportedAtIso: new Date().toISOString(),
      recordCount: targetExportRecords.length,
      records: targetExportRecords,
    };

    const jsonString = JSON.stringify(backupPayload, null, 2);
    const blob = new Blob([jsonString], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const dateStamp = new Date().toISOString().slice(0, 10);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `distill-backup-${dateStamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setExportedFeedback(true);
    setTimeout(() => setExportedFeedback(false), 2000);
    onNotifyToast?.(
      `Exported ${targetExportRecords.length} ${
        targetExportRecords.length === 1 ? "record" : "records"
      } as JSON backup`
    );
  };

  const handleExportConsolidatedReport = () => {
    if (targetExportRecords.length === 0) return;
    downloadBatchConsolidatedMarkdown(targetExportRecords);
    onNotifyToast?.(
      `Downloaded consolidated Markdown report (${targetExportRecords.length} docs)`
    );
  };

  const handleExportBundledIcs = () => {
    if (targetExportRecords.length === 0) return;
    const count = downloadBatchBundledIcs(targetExportRecords, timezone);
    if (count === 0) {
      onNotifyToast?.(
        "No calendar events or dated task deadlines found in the selected documents."
      );
      return;
    }
    onNotifyToast?.(
      `Downloaded bundled .ics schedule (${count} ${
        count === 1 ? "item" : "items"
      } across ${targetExportRecords.length} docs)`
    );
  };

  return (
    <section
      aria-label="Extracted Document History"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800"
    >
      {/* Header Toolbar with Consolidated Batch Report, Bundled .ics, and JSON Export */}
      <div className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Extracted Document History
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {records.length} saved{" "}
            {records.length === 1 ? "document" : "documents"} stored locally
            {selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportConsolidatedReport}
            disabled={targetExportRecords.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span className="tabular-nums">
              Consolidated Report .md ({targetExportRecords.length})
            </span>
          </button>

          <button
            type="button"
            onClick={handleExportBundledIcs}
            disabled={targetExportRecords.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Bundled .ics</span>
          </button>

          <button
            type="button"
            onClick={handleExportAllJson}
            disabled={targetExportRecords.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
          >
            {exportedFeedback ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Exported JSON</span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </>
            )}
          </button>

          {records.length > 0 && (
            <>
              {!confirmClearAll ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(true)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Clear History
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    Remove all {records.length} items?
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onClearAllRecords();
                      setConfirmClearAll(false);
                      setSelectedIds(new Set());
                    }}
                    className="px-3 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Confirm Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    className="px-2.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {records.length === 0 ? (
        <div className="p-10 text-center">
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No saved documents in history
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
              Every email thread, voice note, or batch of PDFs you extract is automatically saved locally in your browser and can be exported as a consolidated report or bundled .ics package.
            </p>
            <div className="mt-6">
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
      ) : (
        <>
          <div className="px-5 py-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/30">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search saved documents, tone, or urgency..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {filtered.length > 0 &&
                filtered.every((r) => selectedIds.has(r.id))
                  ? "Clear selection"
                  : "Select all visible"}
              </button>

              <select
                aria-label="Filter by mail classification"
                value={classificationFilter}
                onChange={(e) =>
                  setClassificationFilter(
                    e.target.value as "all" | MailClassification
                  )
                }
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
              >
                {CLASSIFICATION_FILTERS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt === "all" ? "All Mail Classifications" : opt}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              No saved documents match your current search or classification filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 pl-6 pr-3 w-10">Pick</th>
                    <th className="py-3 px-3">Document</th>
                    <th className="py-3 px-3 whitespace-nowrap">
                      Evaluation, Urgency &amp; Tone
                    </th>
                    <th className="py-3 px-3 whitespace-nowrap">Tasks Done</th>
                    <th className="py-3 px-3 whitespace-nowrap">Files</th>
                    <th className="py-3 px-3 whitespace-nowrap">Extracted</th>
                    <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {filtered.map((rec) => {
                    const done = rec.actionItems.filter((a) => a.completed).length;
                    const fileCount = (rec.attachments ?? []).length;
                    const isCurrent = rec.id === activeRecordId;
                    const classification =
                      rec.mailEvaluation?.classification ?? "Action Required";
                    const formattedDate = new Date(
                      rec.createdAtIso
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    });

                    return (
                      <tr
                        key={rec.id}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3.5 pl-6 pr-3 align-top">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(rec.id)}
                            onChange={() => toggleSelectId(rec.id)}
                            aria-label={`Select ${rec.documentTitle}`}
                            className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer"
                          />
                        </td>
                        <td className="py-3.5 px-3 align-top">
                          <button
                            type="button"
                            onClick={() => onOpenRecord(rec.id)}
                            className="text-left group cursor-pointer"
                          >
                            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                              {rec.documentTitle}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              <span>{rec.documentType}</span>
                              {rec.outputLanguage && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{rec.outputLanguage}</span>
                                </>
                              )}
                              {rec.senderOrSource && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{rec.senderOrSource}</span>
                                </>
                              )}
                              {isCurrent && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-blue-600 dark:text-blue-400 font-medium">
                                    Active in workspace
                                  </span>
                                </>
                              )}
                            </div>
                          </button>
                        </td>
                        <td className="py-3.5 px-3 align-top whitespace-nowrap">
                          <div className="flex flex-col gap-1">
                            <MailClassificationLabel
                              classification={classification}
                            />
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                              <UrgencyIndicator
                                urgency={rec.mailEvaluation?.urgencyLevel}
                              />
                              {rec.mailEvaluation?.detectedTone && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    Tone: {rec.mailEvaluation.detectedTone}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 align-top text-xs font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                          {done} / {rec.actionItems.length}
                        </td>
                        <td className="py-3.5 px-3 align-top whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onOpenRecordAttachments(rec.id)}
                            className="inline-flex items-center gap-1 text-xs font-mono text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 tabular-nums cursor-pointer"
                          >
                            <Paperclip className="w-3.5 h-3.5" />
                            <span>{fileCount}</span>
                          </button>
                        </td>
                        <td className="py-3.5 px-3 align-top text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                          {formattedDate}
                        </td>
                        <td className="py-3.5 pl-3 pr-6 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => onOpenRecordAttachments(rec.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                              <span>Files</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onOpenRecord(rec.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                            >
                              <span>Open</span>
                              <ArrowUpRight className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDeleteRecord(rec.id)}
                              aria-label={`Delete ${rec.documentTitle}`}
                              className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
};
