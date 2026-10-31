import React from "react";
import { Mail, Plus, Trash2 } from "lucide-react";
import { EmailDraftRecord } from "../types";

interface DraftsPanelProps {
  activeDraftId: string | null;
  draftTo: string;
  draftSubject: string;
  draftBody: string;
  draftFormatStyle: string;
  savedDrafts: EmailDraftRecord[];
  onSelectDraft: (draft: EmailDraftRecord) => void;
  onNewDraft: () => void;
  onDeleteDraft: (draftId: string) => void;
}

export const DraftsPanel: React.FC<DraftsPanelProps> = ({
  activeDraftId,
  draftTo,
  draftSubject,
  draftBody,
  draftFormatStyle,
  savedDrafts,
  onSelectDraft,
  onNewDraft,
  onDeleteDraft,
}) => {
  const hasDraftContent = Boolean(
    draftTo.trim() || draftSubject.trim() || draftBody.trim()
  );

  return (
    <section
      aria-label="Draft Preview and Saved Drafts"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800"
    >
      {/* Live Email Preview */}
      <div className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Live Draft Preview
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Format: {draftFormatStyle || "Formal"}
            </p>
          </div>
          <button
            type="button"
            onClick={onNewDraft}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Draft</span>
          </button>
        </div>

        {!hasDraftContent ? (
          <div className="py-10 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            <Mail className="w-5 h-5 text-slate-400 dark:text-slate-500 mx-auto mb-2" />
            <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Start typing on the left or insert an email format
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Your formatted subject and message preview will appear here as you write.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 divide-y divide-slate-200 dark:divide-slate-800">
            <div className="px-4 py-2.5 space-y-1 text-xs">
              <div className="flex items-baseline gap-2">
                <span className="text-slate-500 dark:text-slate-400 w-14 shrink-0">
                  To:
                </span>
                <span className="text-slate-900 dark:text-slate-100 break-all">
                  {draftTo.trim() || "[Recipient]"}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-slate-500 dark:text-slate-400 w-14 shrink-0">
                  Subject:
                </span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {draftSubject.trim() || "[Subject]"}
                </span>
              </div>
            </div>
            <pre className="p-4 text-sm leading-relaxed font-sans whitespace-pre-wrap text-slate-800 dark:text-slate-200 min-h-[160px]">
              {draftBody || ""}
            </pre>
          </div>
        )}
      </div>

      {/* Saved Drafts List */}
      <div className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Saved Drafts
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            {savedDrafts.length} saved
          </span>
        </div>

        {savedDrafts.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
            No saved drafts yet. Click Save Draft in the composer to store drafts in your account.
          </p>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-b border-slate-200 dark:border-slate-800">
            {savedDrafts.map((d) => {
              const isSelected = d.id === activeDraftId;
              const formattedDate = new Date(d.updatedAtIso).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }
              );

              return (
                <div
                  key={d.id}
                  className="py-3 flex items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onSelectDraft(d)}
                    className="min-w-0 flex-1 text-left cursor-pointer group"
                  >
                    <p
                      className={`text-sm font-medium truncate ${
                        isSelected
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400"
                      }`}
                    >
                      {d.subject || "Untitled Draft"}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                      <span>{d.formatType}</span>
                      {d.to && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-[180px]">
                            To: {d.to}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">{formattedDate}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => onDeleteDraft(d.id)}
                    aria-label={`Delete draft ${d.subject}`}
                    className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
