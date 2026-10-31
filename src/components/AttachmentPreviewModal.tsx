import React, { useEffect, useState } from "react";
import { Download, FileText, X } from "lucide-react";
import { EmailAttachmentItem } from "../types";
import {
  base64ToBlob,
  loadAttachmentPayload,
} from "../utils/attachmentStore";
import { formatFileSize } from "../utils/emlParser";

interface AttachmentPreviewModalProps {
  attachment: EmailAttachmentItem | null;
  documentTitle?: string;
  onClose: () => void;
}

export function triggerAttachmentDownload(
  item: EmailAttachmentItem,
  resolvedBase64?: string,
  resolvedText?: string
): void {
  const b64 = resolvedBase64 ?? item.base64;
  const txt = resolvedText ?? item.textContent;

  let blob: Blob;
  if (b64) {
    blob = base64ToBlob(b64, item.mimeType || "application/octet-stream");
  } else if (txt !== undefined) {
    blob = new Blob([txt], { type: item.mimeType || "text/plain;charset=utf-8" });
  } else {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = item.fileName || "attachment";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const AttachmentPreviewModal: React.FC<AttachmentPreviewModalProps> = ({
  attachment,
  documentTitle,
  onClose,
}) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [resolvedText, setResolvedText] = useState<string | undefined>(undefined);
  const [resolvedBase64, setResolvedBase64] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);

  useEffect(() => {
    if (!attachment) {
      setBlobUrl(null);
      setResolvedText(undefined);
      setResolvedBase64(undefined);
      setImageLoadFailed(false);
      return;
    }

    let createdUrl: string | null = null;
    let cancelled = false;

    const loadData = async () => {
      setIsLoading(true);
      setImageLoadFailed(false);

      let b64 = attachment.base64;
      let txt = attachment.textContent;

      if (!b64 && txt === undefined && attachment.origin !== "referenced") {
        const stored = await loadAttachmentPayload(attachment.id);
        if (stored) {
          b64 = stored.base64;
          txt = stored.textContent;
        }
      }

      if (cancelled) return;

      setResolvedBase64(b64);
      setResolvedText(txt);

      if (b64) {
        try {
          const blob = base64ToBlob(b64, attachment.mimeType);
          createdUrl = URL.createObjectURL(blob);
          setBlobUrl(createdUrl);
        } catch {
          setBlobUrl(null);
        }
      } else {
        setBlobUrl(null);
      }

      setIsLoading(false);
    };

    void loadData();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [attachment]);

  useEffect(() => {
    if (!attachment) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [attachment, onClose]);

  if (!attachment) return null;

  const isPdf = attachment.mimeType === "application/pdf";
  const isImage = attachment.mimeType.startsWith("image/");
  const canDownload = Boolean(resolvedBase64 || resolvedText !== undefined);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${attachment.fileName}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {attachment.fileName}
            </h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              <span>{attachment.mimeType}</span>
              {attachment.sizeBytes !== undefined && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{formatFileSize(attachment.sizeBytes)}</span>
                </>
              )}
              {documentTitle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate max-w-[260px]">{documentTitle}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canDownload && (
              <button
                type="button"
                onClick={() =>
                  triggerAttachmentDownload(
                    attachment,
                    resolvedBase64,
                    resolvedText
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download File</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close attachment preview"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Viewer Body */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 min-h-[360px] flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400">
              Loading attachment preview...
            </div>
          ) : isPdf && blobUrl ? (
            <iframe
              src={blobUrl}
              title={attachment.fileName}
              className="w-full flex-1 min-h-[520px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
            />
          ) : isImage && blobUrl && !imageLoadFailed ? (
            <div className="flex-1 flex items-center justify-center">
              <img
                src={blobUrl}
                alt={attachment.fileName}
                referrerPolicy="no-referrer"
                onError={() => setImageLoadFailed(true)}
                className="max-h-[65vh] max-w-full object-contain rounded-lg border border-slate-200 dark:border-slate-800"
              />
            </div>
          ) : resolvedText !== undefined ? (
            <pre className="w-full flex-1 p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed overflow-auto">
              {resolvedText}
            </pre>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
              <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500 mb-3" />
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {attachment.origin === "referenced"
                  ? "Referenced in email text (file not uploaded)"
                  : "Preview unavailable for this file format"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                {attachment.contextNote ||
                  "Attach the original file onto this email record to preview or download its contents."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
