import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, FileText, ListOrdered, Sparkles, X } from "lucide-react";

interface SummaryPointsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPoints: number;
  onSave: (points: number) => void;
  isInitialPrompt?: boolean;
  userName?: string;
}

interface SummaryPreset {
  count: number;
  label: string;
  badge?: string;
  description: string;
  sampleBullets: Array<{ lead: string; detail: string }>;
}

const PRESETS: SummaryPreset[] = [
  {
    count: 1,
    label: "Single Bottom-Line",
    badge: "Ultra-Crisp",
    description: "One high-impact statement capturing the document's core purpose and primary deadline.",
    sampleBullets: [
      {
        lead: "Contract Renewal Required",
        detail: "Sign the revised enterprise agreement before November 15 to preserve discounted multi-seat pricing.",
      },
    ],
  },
  {
    count: 2,
    label: "Executive Brief",
    badge: "Concise",
    description: "Two distinct takeaways: primary objective and immediate timeline/action.",
    sampleBullets: [
      {
        lead: "Scope Finalization",
        detail: "Quarterly architectural deliverables have been reviewed and approved by the steering committee.",
      },
      {
        lead: "Pending Deliverable",
        detail: "Submit signed contractor timesheets and expense reconciliations by Friday 5:00 PM.",
      },
    ],
  },
  {
    count: 3,
    label: "Standard 3-Bullet",
    badge: "Recommended",
    description: "The classic executive format: Context & intent, critical deadline, and key next step.",
    sampleBullets: [
      {
        lead: "Policy Update Notice",
        detail: "Security team is mandating hardware security key enforcement across all staff workstations.",
      },
      {
        lead: "Compliance Window",
        detail: "Complete device registration in the IT portal before Thursday, November 20 at 6:00 PM.",
      },
      {
        lead: "Support & Escalations",
        detail: "Assistance desks will be staffed daily from 9:00 AM to 5:00 PM in Conference Room B.",
      },
    ],
  },
  {
    count: 5,
    label: "Comprehensive Overview",
    badge: "Detailed",
    description: "Five points providing deeper context, financial/legal impact, stakeholders, and schedule.",
    sampleBullets: [
      { lead: "Program Kickoff", detail: "Phase II cloud infrastructure modernization starts next Monday." },
      { lead: "Budget Allocation", detail: "Total expenditure capped at $45,000 for server migration tooling." },
      { lead: "Downtime Schedule", detail: "Maintenance window scheduled for Saturday 2:00 AM - 4:00 AM UTC." },
      { lead: "Required Approvals", detail: "Department heads must review service dependencies by Wednesday." },
      { lead: "Post-Migration Audit", detail: "Verification reports will be generated and distributed by next Friday." },
    ],
  },
  {
    count: 7,
    label: "Deep Technical Review",
    badge: "In-Depth",
    description: "Seven thorough points ideal for lengthy contracts, legal filings, and technical specifications.",
    sampleBullets: [
      { lead: "Regulatory Mandate", detail: "New data privacy standard requires explicit consent logging." },
      { lead: "System Audit", detail: "All database instances must enable TLS 1.3 encryption by default." },
      { lead: "Access Control Review", detail: "Stale developer tokens will be revoked automatically after 30 days." },
      { lead: "Incident Protocol", detail: "Severity 1 escalations must be reported to legal within 4 hours." },
      { lead: "Training Requirement", detail: "All engineers must complete the updated training module." },
      { lead: "Documentation Sync", detail: "Architecture diagrams must be updated in the repository wiki." },
      { lead: "Executive Briefing", detail: "Final compliance status presentation scheduled for December 1." },
    ],
  },
];

export const SummaryPointsModal: React.FC<SummaryPointsModalProps> = ({
  isOpen,
  onClose,
  currentPoints,
  onSave,
  isInitialPrompt = false,
  userName,
}) => {
  const [selectedPoints, setSelectedPoints] = useState<number>(currentPoints || 3);

  useEffect(() => {
    if (isOpen) {
      setSelectedPoints(currentPoints || 3);
    }
  }, [isOpen, currentPoints]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentPreset =
    PRESETS.find((p) => p.count === selectedPoints) ?? {
      count: selectedPoints,
      label: `${selectedPoints}-Point Breakdown`,
      badge: "Custom",
      description: `Generates exactly ${selectedPoints} points per extracted email or document.`,
      sampleBullets: [
        { lead: "Key Objective", detail: "Primary purpose and executive context of the document." },
        { lead: "Critical Deadlines", detail: "All dates, schedules, and deliverables extracted with timestamps." },
        { lead: "Action Required", detail: "Actionable tasks identified with owners and priorities." },
      ],
    };

  const handleSave = () => {
    onSave(selectedPoints);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="summary-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto"
    >
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xl overflow-hidden my-8">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4 bg-slate-50/70 dark:bg-slate-950/40">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="summary-modal-title"
                  className="font-display text-lg font-bold text-slate-900 dark:text-slate-100"
                >
                  {isInitialPrompt
                    ? `Welcome${userName ? `, ${userName}` : ""}! Choose Default Summary Points`
                    : "Default Summary Points"}
                </h2>
                {isInitialPrompt && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    <Sparkles className="w-3 h-3" />
                    New Setup
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                Choose how many bullet points Distill generates by default for every email, document, or audio note. You can change this anytime from the top bar.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Quick Select Buttons (1-10) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Select default number of points
              </label>
              <span className="text-xs font-mono font-medium text-blue-600 dark:text-blue-400">
                {selectedPoints} {selectedPoints === 1 ? "point" : "points"}
              </span>
            </div>

            <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => {
                const isSelected = selectedPoints === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSelectedPoints(num)}
                    className={`py-2 px-1 rounded-lg text-xs font-mono font-medium tabular-nums transition-all cursor-pointer flex flex-col items-center justify-center gap-0.5 ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-xs ring-2 ring-blue-600/30 scale-102"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span>{num}</span>
                    {num === 3 && (
                      <span className={`text-[8px] leading-none ${isSelected ? "text-blue-100" : "text-blue-600 dark:text-blue-400 font-bold"}`}>
                        ★
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Popular Presets Cards */}
          <div className="space-y-2">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
              Format Presets
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {PRESETS.slice(0, 3).map((preset) => {
                const isSelected = selectedPoints === preset.count;
                return (
                  <button
                    key={preset.count}
                    type="button"
                    onClick={() => setSelectedPoints(preset.count)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? "border-blue-600 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-1 ring-blue-600 dark:ring-blue-500"
                        : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1.5 mb-1">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {preset.count} {preset.count === 1 ? "Point" : "Points"}
                        </span>
                        {preset.badge && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {preset.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {preset.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Live Preview Box */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Live Preview: {currentPreset.label}</span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                Target: {selectedPoints} {selectedPoints === 1 ? "point" : "points"}
              </span>
            </div>

            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {currentPreset.sampleBullets.slice(0, selectedPoints).map((b, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold shrink-0">
                    {idx + 1}.
                  </span>
                  <p className="leading-relaxed">
                    <strong className="text-slate-900 dark:text-slate-100 font-semibold">
                      {b.lead}:
                    </strong>{" "}
                    {b.detail}
                  </p>
                </div>
              ))}
              {selectedPoints > currentPreset.sampleBullets.length && (
                <div className="text-[11px] text-slate-400 dark:text-slate-500 italic pl-5">
                  + {selectedPoints - currentPreset.sampleBullets.length} more detailed extraction points...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 flex items-center justify-between gap-3">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
            You can also adjust this per-document on the input panel.
          </p>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Save {selectedPoints} Points as Default</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
