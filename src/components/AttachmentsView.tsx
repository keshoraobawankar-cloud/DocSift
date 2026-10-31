import React, { useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Download,
  Eye,
  FileText,
  Paperclip,
  Search,
  Upload,
} from "lucide-react";
import { EmailAttachmentItem, ExtractionRecord } from "../types";
import { formatFileSize, readUploadedFile } from "../utils/emlParser";
import {
  AttachmentPreviewModal,
  triggerAttachmentDownload,
} from "./AttachmentPreviewModal";
import { loadAttachmentPayload } from "../utils/attachmentStore";
import { MailClassificationLabel } from "./ExtractionResultView";

interface AttachmentsViewProps {
  records: ExtractionRecord[];
  onOpenRecordAttachments: (recordId: string) => void;
  onAttachFileToRecord: (recordId: string, newAttachment: EmailAttachmentItem) => void;
  onStartNewExtraction: () => void;
}

interface FlattenedAttachment {
  recordId: string;
  documentTitle: string;
  senderOrSource: string;
  classification?: ExtractionRecord["mailEvaluation"];
  item: EmailAttachmentItem;
}

export const AttachmentsView: React.FC<AttachmentsViewProps> = ({
  records,
  onOpenRecordAttachments,
  onAttachFileToRecord,
  onStartNewExtraction,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [originFilter, setOriginFilter] = useState<"all" | "attached" | "referenced">("all");
  const [previewTarget, setPreviewTarget] = useState<{
    item: EmailAttachmentItem;
    documentTitle: string;
  } | null>(null);
  const [attachTargetRecordId, setAttachTargetRecordId] = useState<string | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);

  const allAttachments = useMemo<FlattenedAttachment[]>(() => {
    const list: FlattenedAttachment[] = [];
    for (const rec of records) {
      const items = rec.attachments ?? [];
      for (const att of items) {
        list.push({
          recordId: rec.id,
          documentTitle: rec.documentTitle,
          senderOrSource: rec.senderOrSource,
          classification: rec.mailEvaluation,
          item: att,
        });
      }
    }
    return list;
  }, [records]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allAttachments.filter(({ documentTitle, senderOrSource, item }) => {
      if (originFilter === "attached" && item.origin === "referenced") return false;
      if (originFilter === "referenced" && item.origin !== "referenced") return false;
      if (!q) return true;
      return (
        item.fileName.toLowerCase().includes(q) ||
        item.contextNote.toLowerCase().includes(q) ||
        documentTitle.toLowerCase().includes(q) ||
        senderOrSource.toLowerCase().includes(q)
      );
    });
  }, [allAttachments, searchQuery, originFilter]);

  const attachedCount = allAttachments.filter(
    (a) => a.item.origin !== "referenced"
  ).length;
  const referencedCount = allAttachments.length - attachedCount;

  const handleDownload = async (item: EmailAttachmentItem) => {
    if (item.base64 || item.textContent !== undefined) {
      triggerAttachmentDownload(item);
      return;
    }
    const stored = await loadAttachmentPayload(item.id);
    if (stored) {
      triggerAttachmentDownload(item, stored.base64, stored.textContent);
    }
  };

  const handleUploadMissingFile = async (file: File | undefined) => {
    if (!file || !attachTargetRecordId) return;
    try {
      const uploaded = await readUploadedFile(file);
      onAttachFileToRecord(attachTargetRecordId, {
        id: uploaded.id,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        origin: "uploaded",
        contextNote: "Attached manually to email record",
        base64: uploaded.base64,
        textContent: uploaded.extractedText,
      });
    } catch {
      // Ignore invalid file type
    } finally {
      setAttachTargetRecordId(null);
    }
  };

  return (
    <section
      aria-label="Email Attachments Hub"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800"
    >
      <input
        ref={filePickerRef}
        type="file"
        accept=".pdf,.docx,.eml,.txt,.md,.csv,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          void handleUploadMissingFile(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
      />

      {/* Header */}
      <div className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Email Attachments &amp; Referenced Files
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {attachedCount} attached {attachedCount === 1 ? "file" : "files"} ·{" "}
            {referencedCount} mentioned in email text across {records.length}{" "}
            {records.length === 1 ? "email" : "emails"}
          </p>
        </div>
      </div>

      {/* Search & Segmented Filter */}
      <div className="px-5 py-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-950/40">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search file names, notes, or emails..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
          />
        </div>

        <div className="inline-flex items-center p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
          {(
            [
              { key: "all", label: "All Files" },
              { key: "attached", label: "Attached Files" },
              { key: "referenced", label: "Mentioned in Mail" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setOriginFilter(key)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                originFilter === key
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {allAttachments.length === 0 ? (
        <div className="p-10 text-center">
          <div className="max-w-md mx-auto">
            <Paperclip className="w-6 h-6 text-slate-400 mx-auto mb-2.5" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              No attached or referenced files yet
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1.5">
              Upload PDFs, drop .eml emails with embedded attachments, or extract emails mentioning documents to inspect and preview all files here.
            </p>
            <div className="mt-5">
              <button
                type="button"
                onClick={onStartNewExtraction}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Extract Email or Attachment
              </button>
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No files match your current search or filter selection.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-6 pr-3">File &amp; Context</th>
                <th className="py-3 px-3">Source Email</th>
                <th className="py-3 px-3 whitespace-nowrap">Source Type</th>
                <th className="py-3 px-3 whitespace-nowrap">Size</th>
                <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filtered.map(({ recordId, documentTitle, classification, item }) => {
                const isRealFile = item.origin !== "referenced";
                return (
                  <tr
                    key={`${recordId}-${item.id}`}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 pl-6 pr-3 align-top max-w-sm">
                      <div className="flex items-start gap-2.5">
                        <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.fileName}
                          </p>
                          {item.contextNote && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                              {item.contextNote}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-3 align-top max-w-xs">
                      <button
                        type="button"
                        onClick={() => onOpenRecordAttachments(recordId)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                      >
                        <span className="truncate max-w-[220px]">{documentTitle}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                      </button>
                      {classification && (
                        <div className="mt-1">
                          <MailClassificationLabel
                            classification={classification.classification}
                          />
                        </div>
                      )}
                    </td>

                    <td className="py-3.5 px-3 align-top text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {item.origin === "eml"
                        ? "Embedded in .eml"
                        : item.origin === "uploaded"
                          ? "Attached file"
                          : `Mentioned (${item.mimeType})`}
                    </td>

                    <td className="py-3.5 px-3 align-top text-xs font-mono text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {item.sizeBytes !== undefined
                        ? formatFileSize(item.sizeBytes)
                        : "—"}
                    </td>

                    <td className="py-3.5 pl-3 pr-6 align-top text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewTarget({ item, documentTitle })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isRealFile ? "Preview" : "Details"}</span>
                        </button>

                        {isRealFile ? (
                          <button
                            type="button"
                            onClick={() => void handleDownload(item)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setAttachTargetRecordId(recordId);
                              filePickerRef.current?.click();
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-md transition-colors cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Attach File</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <AttachmentPreviewModal
        attachment={previewTarget?.item ?? null}
        documentTitle={previewTarget?.documentTitle}
        onClose={() => setPreviewTarget(null)}
      />
    </section>
  );
};
