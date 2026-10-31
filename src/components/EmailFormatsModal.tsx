import React, { useEffect, useMemo, useState } from "react";
import { Check, Copy, FileInput, X } from "lucide-react";
import { EMAIL_WRITING_FORMATS, EmailFormatDefinition } from "../data/emailFormats";

interface EmailFormatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertFormat: (format: EmailFormatDefinition) => void;
}

async function copyTextSafe(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}

export const EmailFormatsModal: React.FC<EmailFormatsModalProps> = ({
  isOpen,
  onClose,
  onInsertFormat,
}) => {
  const [selectedId, setSelectedId] = useState<string>(
    EMAIL_WRITING_FORMATS[0]?.id ?? "formal"
  );
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    setCopied(false);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const activeFormat = useMemo(
    () =>
      EMAIL_WRITING_FORMATS.find((f) => f.id === selectedId) ??
      EMAIL_WRITING_FORMATS[0],
    [selectedId]
  );

  if (!isOpen || !activeFormat) return null;

  const fullTemplate = `Subject: ${activeFormat.subject}\n\n${activeFormat.body}`;

  const handleCopy = async () => {
    await copyTextSafe(fullTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mini-email-formats-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-[1px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg flex flex-col overflow-hidden">
        {/* Compact Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <h2
            id="mini-email-formats-title"
            className="text-sm font-semibold text-slate-900 dark:text-slate-100"
          >
            Email Formats
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close email formats"
            className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Compact Format Selector */}
        <div className="px-4 py-2 bg-slate-50/80 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          <div
            role="tablist"
            aria-label="Email format types"
            className="inline-flex items-center gap-1 min-w-max"
          >
            {EMAIL_WRITING_FORMATS.map((fmt) => {
              const isSelected = fmt.id === activeFormat.id;
              return (
                <button
                  key={fmt.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => {
                    setSelectedId(fmt.id);
                    setCopied(false);
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 dark:bg-blue-600 text-white"
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                  }`}
                >
                  {fmt.shortLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Clean Template View */}
        <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              {activeFormat.title}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {activeFormat.useCase}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="px-3.5 py-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Subject:{" "}
              </span>
              <span className="font-medium text-slate-900 dark:text-slate-100">
                {activeFormat.subject}
              </span>
            </div>
            <pre className="p-3.5 text-xs leading-relaxed font-sans whitespace-pre-wrap text-slate-800 dark:text-slate-200">
              {activeFormat.body}
            </pre>
          </div>
        </div>

        {/* Compact Footer */}
        <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-950/50 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              onInsertFormat(activeFormat);
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <FileInput className="w-3.5 h-3.5" />
            <span>Insert</span>
          </button>
        </div>
      </div>
    </div>
  );
};
