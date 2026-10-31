import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Code2,
  Copy,
  Download,
  FileCode2,
  Globe,
  Inbox,
  Loader2,
  Mail,
  MousePointerClick,
  Puzzle,
  RefreshCw,
  Send,
  Terminal,
  X,
} from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../types";
import { copyTextToClipboard } from "../utils/exporters";
import { slugifyFilename, triggerIcsDownload } from "../utils/icsGenerator";

interface ExtensionSourceFile {
  name: string;
  content: string;
}

interface AutomationHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceToken: string;
  timezone: string;
  targetLanguage: string;
  summaryPointCount: number;
  pendingInboxCount: number;
  onSyncInbox: () => Promise<number>;
  onIngestDirectExtraction: (
    rawExtraction: Record<string, unknown>,
    meta: {
      sourceLabel: string;
      sourceText: string;
      channel: "extension" | "webhook";
    }
  ) => void;
  onNotifyToast?: (message: string) => void;
}

const SAMPLE_WEBPAGES: Array<{
  id: string;
  tabLabel: string;
  pageTitle: string;
  pageUrl: string;
  content: string;
}> = [
  {
    id: "gmail",
    tabLabel: "Gmail Thread",
    pageTitle: "Gmail — Q4 Product Architecture Freeze & Security Sign-Off",
    pageUrl: "https://mail.google.com/mail/u/0/#inbox/FMfcgzQVzX",
    content: `From: Elena Rostova <elena.rostova@acme-cloud.io>
Subject: Action Required: Q4 Architecture Freeze & API Security Sign-Off

Hi team,
Please highlight and note these mandatory milestones before the Q4 release cut:
1. Submit the updated OAuth threat model PDF to the security portal by tomorrow at 4:00 PM.
2. Join the Architecture Freeze Go/No-Go Review on Thursday, Nov 5, 2026 from 2:00 PM to 2:45 PM in Conference Room 4B (or Google Meet).
3. Rotate staging webhook secrets before Friday noon.`,
  },
  {
    id: "syllabus",
    tabLabel: "Portal Syllabus Notice",
    pageTitle: "CS-402 Distributed Systems — Midterm & Lab Schedule Update",
    pageUrl: "https://portal.university.edu/courses/cs402/announcements/18",
    content: `Course Announcement — Prof. M. Srinivasan (CS-402)
Please update your calendars with two revised dates:
• Lab 3 Raft Consensus implementation is now due Monday, Nov 9, 2026 at 11:59 PM via Gradescope.
• Mandatory Midterm Exam Walkthrough Session will take place Wednesday, Nov 4, 2026 from 10:30 AM to 11:45 AM in Gates Hall Auditorium 104. Bring your student ID.`,
  },
  {
    id: "spanish",
    tabLabel: "Multilingual Client Notice",
    pageTitle: "Aviso Urgente: Revisión de Contrato y Reunión de Lanzamiento",
    pageUrl: "https://outlook.office.com/mail/inbox/id/AAQkADg",
    content: `De: Carlos Mendoza <cmendoza@soluciones-latam.es>
Asunto: Urgente: Firma de anexo técnico antes del jueves

Hola equipo,
Necesitamos completar dos pasos críticos esta semana:
1. Enviar el anexo técnico firmado antes del jueves 5 de noviembre a las 17:00.
2. Asistir a la reunión de lanzamiento técnico el viernes 6 de noviembre de 11:00 a 12:00 por Zoom con el equipo de infraestructura.`,
  },
];

const DEFAULT_WEBHOOK_SAMPLE = {
  from: "registrar-updates@university-portal.edu",
  subject: "Fwd: Updated Capstone Defense Schedule & Slide Submission Deadline",
  body: `---------- Forwarded message ---------
From: Office of Undergraduate Engineering <engineering@university-portal.edu>
Subject: Updated Capstone Defense Schedule & Slide Submission Deadline

Hello Capstone Teams,

Please note the finalized schedule for final project evaluations:
1. Upload your final presentation deck (.pdf) and architecture brief to the Capstone Portal by Wednesday, Nov 11, 2026 at 5:00 PM.
2. Live Capstone Jury Defense is scheduled for Friday, Nov 13, 2026 from 1:30 PM to 3:00 PM in Engineering Center Room 210.
3. Confirm your team's AV adapter requirements with the lab coordinator before Tuesday.`,
};

export const AutomationHubModal: React.FC<AutomationHubModalProps> = ({
  isOpen,
  onClose,
  workspaceToken,
  timezone,
  targetLanguage,
  summaryPointCount,
  pendingInboxCount,
  onSyncInbox,
  onIngestDirectExtraction,
  onNotifyToast,
}) => {
  const [activeSection, setActiveSection] = useState<"extension" | "webhook">(
    "extension"
  );

  // Extension tab state
  const [selectedSampleId, setSelectedSampleId] = useState<string>("gmail");
  const [highlightedText, setHighlightedText] = useState<string>(
    SAMPLE_WEBPAGES[0].content
  );
  const [simTargetLang, setSimTargetLang] = useState<string>(
    targetLanguage || "Auto"
  );
  const [contextMenuPos, setContextMenuPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isSimulatingExt, setIsSimulatingExt] = useState<boolean>(false);
  const [extError, setExtError] = useState<string | null>(null);
  const [extResult, setExtResult] = useState<{
    extraction: Record<string, unknown>;
    icsContent: string;
  } | null>(null);
  const [savedClipFeedback, setSavedClipFeedback] = useState<boolean>(false);

  // Extension source code viewer state
  const [showExtSource, setShowExtSource] = useState<boolean>(false);
  const [extFiles, setExtFiles] = useState<ExtensionSourceFile[]>([]);
  const [activeSourceFile, setActiveSourceFile] =
    useState<string>("manifest.json");
  const [isLoadingSource, setIsLoadingSource] = useState<boolean>(false);
  const [copiedToken, setCopiedToken] = useState<boolean>(false);
  const [copiedSource, setCopiedSource] = useState<boolean>(false);

  // Webhook tab state
  const [webhookFrom, setWebhookFrom] = useState<string>(
    DEFAULT_WEBHOOK_SAMPLE.from
  );
  const [webhookSubject, setWebhookSubject] = useState<string>(
    DEFAULT_WEBHOOK_SAMPLE.subject
  );
  const [webhookBody, setWebhookBody] = useState<string>(
    DEFAULT_WEBHOOK_SAMPLE.body
  );
  const [webhookLang, setWebhookLang] = useState<string>(
    targetLanguage || "Auto"
  );
  const [isSendingWebhook, setIsSendingWebhook] = useState<boolean>(false);
  const [isSyncingQueue, setIsSyncingQueue] = useState<boolean>(false);
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [webhookResponse, setWebhookResponse] = useState<{
    inboundId: string;
    queuedForToken: string | null;
    extraction: Record<string, unknown>;
    autoReply: {
      to: string;
      subject: string;
      textBody: string;
      icsAttachment: {
        filename: string;
        contentType: string;
        contentBase64: string;
        rawIcs: string;
      } | null;
    };
  } | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [copiedEndpoint, setCopiedEndpoint] = useState<boolean>(false);
  const [copiedCurl, setCopiedCurl] = useState<boolean>(false);
  const [showWebhookDocs, setShowWebhookDocs] = useState<boolean>(false);

  const sampleCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSimTargetLang(targetLanguage || "Auto");
    setWebhookLang(targetLanguage || "Auto");
  }, [targetLanguage]);

  useEffect(() => {
    if (!isOpen) {
      setContextMenuPos(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!showExtSource || extFiles.length > 0 || !isOpen) return;
    const origin = window.location.origin;
    setIsLoadingSource(true);
    fetch(
      `/api/extension/source?origin=${encodeURIComponent(
        origin
      )}&token=${encodeURIComponent(workspaceToken)}`
    )
      .then((r) => r.json())
      .then((data: { files?: ExtensionSourceFile[] }) => {
        if (Array.isArray(data.files)) {
          setExtFiles(data.files);
          if (data.files[0]) setActiveSourceFile(data.files[0].name);
        }
      })
      .catch(() => {
        // Ignore preview fetch error
      })
      .finally(() => setIsLoadingSource(false));
  }, [showExtSource, extFiles.length, isOpen, workspaceToken]);

  if (!isOpen) return null;

  const appOrigin =
    typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:3000";

  const extensionZipUrl = `/api/extension/download.zip?origin=${encodeURIComponent(
    appOrigin
  )}&token=${encodeURIComponent(workspaceToken)}`;

  const inboundEmailAddress = `extract+${workspaceToken}@inbound.distill-mail.app`;
  const inboundWebhookUrl = `${appOrigin}/api/webhooks/inbound-email?token=${encodeURIComponent(
    workspaceToken
  )}`;

  const activeSample =
    SAMPLE_WEBPAGES.find((s) => s.id === selectedSampleId) ||
    SAMPLE_WEBPAGES[0];

  const handleCaptureBrowserSelection = () => {
    const sel = window.getSelection()?.toString().trim() || "";
    if (sel.length >= 8) {
      setHighlightedText(sel);
    }
  };

  const handleSampleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection()?.toString().trim() || "";
    if (sel.length >= 8) {
      setHighlightedText(sel);
    }
    if (!sampleCardRef.current) return;
    e.preventDefault();
    const rect = sampleCardRef.current.getBoundingClientRect();
    setContextMenuPos({
      x: Math.min(Math.max(12, e.clientX - rect.left), rect.width - 230),
      y: Math.min(Math.max(12, e.clientY - rect.top), rect.height - 48),
    });
  };

  const handleRunExtensionSimulator = async () => {
    setContextMenuPos(null);
    const trimmed = highlightedText.trim();
    if (!trimmed) {
      setExtError("Highlight or enter webpage text to extract.");
      return;
    }

    setExtError(null);
    setIsSimulatingExt(true);
    setSavedClipFeedback(false);

    try {
      const resp = await fetch("/api/extension/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          pageTitle: activeSample.pageTitle,
          pageUrl: activeSample.pageUrl,
          targetLanguage: simTargetLang,
          summaryPointCount,
          timezone,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "Extension extraction failed.");
      }
      setExtResult({
        extraction: data.extraction as Record<string, unknown>,
        icsContent: String(data.icsContent || ""),
      });
      onNotifyToast?.("Extracted webpage selection via Extension API");
    } catch (err) {
      setExtError(
        err instanceof Error
          ? err.message
          : "Could not run browser extension extraction."
      );
    } finally {
      setIsSimulatingExt(false);
    }
  };

  const handleSaveExtensionClipToWorkspace = () => {
    if (!extResult) return;
    onIngestDirectExtraction(extResult.extraction, {
      sourceLabel: activeSample.pageTitle,
      sourceText: highlightedText,
      channel: "extension",
    });
    setSavedClipFeedback(true);
    onNotifyToast?.("Saved browser clip into your Distill workspace");
  };

  const handleSimulateInboundWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!webhookBody.trim()) {
      setWebhookError("Enter an email body to forward to the webhook.");
      return;
    }

    setWebhookError(null);
    setIsSendingWebhook(true);
    try {
      const resp = await fetch(
        `/api/webhooks/inbound-email?token=${encodeURIComponent(
          workspaceToken
        )}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: webhookFrom.trim() || "sender@example.com",
            to: inboundEmailAddress,
            subject: webhookSubject.trim() || "Forwarded Notice",
            text: webhookBody.trim(),
            targetLanguage: webhookLang,
            timezone,
            summaryPointCount,
          }),
        }
      );

      const data = await resp.json();
      if (!resp.ok) {
        throw new Error(data?.error || "Inbound email webhook failed.");
      }

      setWebhookResponse(data);
      const synced = await onSyncInbox();
      onNotifyToast?.(
        synced > 0
          ? "Processed inbound email & synced to workspace"
          : "Processed inbound email & generated .ics auto-reply"
      );
    } catch (err) {
      setWebhookError(
        err instanceof Error
          ? err.message
          : "Failed to trigger inbound email webhook."
      );
    } finally {
      setIsSendingWebhook(false);
    }
  };

  const handleManualQueueSync = async () => {
    setIsSyncingQueue(true);
    try {
      const count = await onSyncInbox();
      onNotifyToast?.(
        count > 0
          ? `Synced ${count} queued ${count === 1 ? "item" : "items"} into workspace`
          : "Inbox queue is already up to date"
      );
    } finally {
      setIsSyncingQueue(false);
    }
  };

  const curlSnippet = `curl -X POST "${inboundWebhookUrl}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "from": "colleague@company.com",
    "to": "${inboundEmailAddress}",
    "subject": "Fwd: Q4 Sprint Review & Release Deadlines",
    "text": "Please submit QA sign-off by Friday at 3:00 PM and join the Sprint Review on Monday at 10:00 AM."
  }'`;

  const selectedSourceObj =
    extFiles.find((f) => f.name === activeSourceFile) ?? extFiles[0];

  const extEval =
    (extResult?.extraction?.mailEvaluation as
      | Record<string, unknown>
      | undefined) ?? {};
  const extBullets = Array.isArray(extResult?.extraction?.summaryBullets)
    ? (extResult?.extraction?.summaryBullets as Array<{
        lead?: string;
        detail?: string;
      }>)
    : [];
  const extTasks = Array.isArray(extResult?.extraction?.actionItems)
    ? (extResult?.extraction?.actionItems as Array<{
        title?: string;
        priority?: string;
        dueDateText?: string;
      }>)
    : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="automation-hub-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/60 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2
              id="automation-hub-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Smart Automation &amp; Ecosystem Integrations
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Companion Chrome/Firefox Manifest v3 extension &amp; Direct Forward-to-Extract email webhook
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div
              role="tablist"
              aria-label="Automation integration type"
              className="inline-flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === "extension"}
                onClick={() => setActiveSection("extension")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeSection === "extension"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Puzzle className="w-3.5 h-3.5" />
                <span>Browser Extension</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeSection === "webhook"}
                onClick={() => setActiveSection("webhook")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
                  activeSection === "webhook"
                    ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>
                  Forward-to-Extract Webhook
                  {pendingInboxCount > 0 ? ` (${pendingInboxCount})` : ""}
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close Automation Hub"
              className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-slate-800">
          {activeSection === "extension" ? (
            <>
              {/* Top Download & Install Strip */}
              <div className="p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 max-w-xl">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Companion Chrome &amp; Firefox Extension (Manifest v3)
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Highlight text on Gmail, Outlook Web, news articles, or university portals and right-click{" "}
                      <strong className="font-medium text-slate-900 dark:text-slate-200">
                        Extract Summary &amp; .ics with Distill
                      </strong>{" "}
                      to generate takeaways, tasks, and calendar invites—automatically pre-wired to your workspace sync token.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowExtSource((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Code2 className="w-3.5 h-3.5" />
                      <span>
                        {showExtSource ? "Hide MV3 Source" : "Inspect MV3 Source"}
                      </span>
                    </button>

                    <a
                      href={extensionZipUrl}
                      download="distill-browser-extension-mv3.zip"
                      onClick={() =>
                        onNotifyToast?.(
                          "Downloading pre-configured Manifest v3 extension (.zip)"
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Extension (.zip)</span>
                    </a>
                  </div>
                </div>

                {/* Installation Steps + Workspace Sync Token */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 text-xs">
                  <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      01. Chrome / Edge / Brave
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      Unzip the bundle, open{" "}
                      <code className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                        chrome://extensions
                      </code>
                      , enable Developer mode, and click Load unpacked.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1">
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      02. Mozilla Firefox
                    </p>
                    <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                      Open{" "}
                      <code className="font-mono text-[11px] text-slate-800 dark:text-slate-200">
                        about:debugging#/runtime/this-firefox
                      </code>
                      , click Load Temporary Add-on, and select{" "}
                      <code className="font-mono text-[11px]">manifest.json</code>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-slate-900 dark:text-slate-100">
                        03. Workspace Sync Token
                      </p>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyTextToClipboard(workspaceToken);
                          setCopiedToken(true);
                          setTimeout(() => setCopiedToken(false), 1600);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedToken ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate">
                      {workspaceToken}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Pre-injected into your downloaded extension package.
                    </p>
                  </div>
                </div>

                {/* Expandable Manifest v3 Source Inspector */}
                {showExtSource && (
                  <div className="pt-2 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {isLoadingSource ? (
                          <span className="text-xs text-slate-500 inline-flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Loading extension files...</span>
                          </span>
                        ) : (
                          extFiles.map((file) => (
                            <button
                              key={file.name}
                              type="button"
                              onClick={() => setActiveSourceFile(file.name)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-mono rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                                activeSourceFile === file.name
                                  ? "bg-slate-900 dark:bg-blue-600 text-white"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                              }`}
                            >
                              <FileCode2 className="w-3 h-3" />
                              <span>{file.name}</span>
                            </button>
                          ))
                        )}
                      </div>

                      {selectedSourceObj && (
                        <button
                          type="button"
                          onClick={async () => {
                            await copyTextToClipboard(selectedSourceObj.content);
                            setCopiedSource(true);
                            setTimeout(() => setCopiedSource(false), 1600);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {copiedSource ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                              <span>Copied {selectedSourceObj.name}</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy File</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {selectedSourceObj && (
                      <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 border border-slate-800 text-[11px] font-mono overflow-x-auto max-h-60 leading-relaxed">
                        {selectedSourceObj.content}
                      </pre>
                    )}
                  </div>
                )}
              </div>

              {/* Interactive Highlight & Right-Click Simulator */}
              <div className="p-6 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Interactive Webpage Highlight &amp; One-Click Extract Simulator
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Select any text inside the sample webpage below (and right-click or click Extract Selection) to test the live extension API
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {SAMPLE_WEBPAGES.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          setSelectedSampleId(sample.id);
                          setHighlightedText(sample.content);
                          setExtResult(null);
                          setContextMenuPos(null);
                        }}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedSampleId === sample.id
                            ? "bg-slate-900 dark:bg-blue-600 text-white"
                            : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        {sample.tabLabel}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                  {/* Simulated Browser Tab */}
                  <div
                    ref={sampleCardRef}
                    onMouseUp={handleCaptureBrowserSelection}
                    onContextMenu={handleSampleContextMenu}
                    onClick={() => {
                      if (contextMenuPos) setContextMenuPos(null);
                    }}
                    className="lg:col-span-6 relative rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                  >
                    <div className="px-3.5 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-between gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1.5 truncate font-mono">
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">{activeSample.pageUrl}</span>
                      </span>
                      <span className="whitespace-nowrap shrink-0 text-blue-600 dark:text-blue-400">
                        Highlight &amp; right-click
                      </span>
                    </div>

                    <div className="p-4 space-y-2.5">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {activeSample.pageTitle}
                      </p>
                      <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300 whitespace-pre-wrap select-text">
                        {activeSample.content}
                      </p>
                    </div>

                    {contextMenuPos && (
                      <div
                        style={{
                          left: `${contextMenuPos.x}px`,
                          top: `${contextMenuPos.y}px`,
                        }}
                        className="absolute z-20 bg-slate-900 text-white border border-slate-700 rounded-lg shadow-lg p-1"
                      >
                        <button
                          type="button"
                          onClick={() => void handleRunExtensionSimulator()}
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium hover:bg-blue-600 rounded-md transition-colors whitespace-nowrap cursor-pointer"
                        >
                          <MousePointerClick className="w-3.5 h-3.5" />
                          <span>Extract Summary &amp; .ics with Distill</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Captured Selection + Extension Popup Output */}
                  <div className="lg:col-span-6 space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <label
                          htmlFor="ext-sim-selection"
                          className="font-medium text-slate-700 dark:text-slate-300"
                        >
                          Selected text sent to extension
                        </label>
                        <select
                          aria-label="Extension output language"
                          value={simTargetLang}
                          onChange={(e) => setSimTargetLang(e.target.value)}
                          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                        >
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.code === "Auto"
                                ? "Lang: Auto"
                                : `Translate: ${lang.code}`}
                            </option>
                          ))}
                        </select>
                      </div>

                      <textarea
                        id="ext-sim-selection"
                        rows={4}
                        value={highlightedText}
                        onChange={(e) => setHighlightedText(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs leading-relaxed text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                      />

                      <div className="flex justify-end">
                        <button
                          type="button"
                          disabled={isSimulatingExt || !highlightedText.trim()}
                          onClick={() => void handleRunExtensionSimulator()}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isSimulatingExt ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Extracting Selection...</span>
                            </>
                          ) : (
                            <>
                              <MousePointerClick className="w-3.5 h-3.5" />
                              <span>Extract Highlighted Selection</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {extError && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {extError}
                      </p>
                    )}

                    {extResult && (
                      <div className="p-4 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {String(extEval.urgencyLevel || "Action Required")}
                          </span>
                          {Boolean(extEval.detectedTone) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>Tone: {String(extEval.detectedTone)}</span>
                            </>
                          )}
                          {Boolean(extResult.extraction.detectedLanguage) && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                Lang:{" "}
                                {String(extResult.extraction.detectedLanguage)}
                              </span>
                            </>
                          )}
                        </div>

                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {String(
                            extResult.extraction.documentTitle ||
                              "Extracted Selection"
                          )}
                        </p>

                        <ol className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300 list-decimal pl-4">
                          {extBullets.map((b, i) => (
                            <li key={i}>
                              <strong className="font-semibold text-slate-900 dark:text-slate-100">
                                {String(b.lead || "Point").replace(/:$/, "")}:
                              </strong>{" "}
                              {String(b.detail || "")}
                            </li>
                          ))}
                        </ol>

                        {extTasks.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-xs text-slate-700 dark:text-slate-300">
                            {extTasks.slice(0, 4).map((t, idx) => (
                              <p key={idx} className="tabular-nums">
                                •{" "}
                                <span className="font-medium">
                                  {String(t.title || "")}
                                </span>{" "}
                                <span className="text-slate-500">
                                  ({String(t.dueDateText || "No deadline")})
                                </span>
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 flex flex-wrap items-center justify-end gap-2">
                          {extResult.icsContent && (
                            <button
                              type="button"
                              onClick={() => {
                                triggerIcsDownload(
                                  extResult.icsContent,
                                  slugifyFilename(
                                    String(
                                      extResult.extraction.documentTitle ||
                                        "distill-clip"
                                    )
                                  )
                                );
                                onNotifyToast?.("Downloaded clip .ics invite");
                              }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>Download .ics</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={savedClipFeedback}
                            onClick={handleSaveExtensionClipToWorkspace}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-60 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            {savedClipFeedback ? (
                              <>
                                <Check className="w-3.5 h-3.5" />
                                <span>Saved to Workspace</span>
                              </>
                            ) : (
                              <>
                                <span>Open in Workspace</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ================= FORWARD-TO-EXTRACT EMAIL WEBHOOK ================= */
            <>
              <div className="p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-1 max-w-xl">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Direct Email Webhook (“Forward to Extract”)
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Forward lengthy newsletters, syllabus updates, or operational notices to your inbound address or route SendGrid / Mailgun / Postmark webhooks directly to Distill. The server extracts key points, generates an outbound reply with{" "}
                      <code className="font-mono text-[11px]">.ics</code>{" "}
                      attachments, and queues the brief into your workspace.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowWebhookDocs((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Terminal className="w-3.5 h-3.5" />
                      <span>{showWebhookDocs ? "Hide cURL" : "cURL & Webhook Setup"}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSyncingQueue}
                      onClick={() => void handleManualQueueSync()}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          isSyncingQueue ? "animate-spin" : ""
                        }`}
                      />
                      <span>
                        Sync Queue
                        {pendingInboxCount > 0 ? ` (${pendingInboxCount})` : ""}
                      </span>
                    </button>
                  </div>
                </div>

                {/* Unique Forwarding Address & Live Webhook Endpoint */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 inline-flex items-center gap-1.5">
                        <Inbox className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span>Unique Inbound Forwarding Address</span>
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyTextToClipboard(inboundEmailAddress);
                          setCopiedAddress(true);
                          setTimeout(() => setCopiedAddress(false), 1600);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedAddress ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                      {inboundEmailAddress}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-lg bg-slate-50/80 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        Live SendGrid / Mailgun Webhook URL (POST)
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyTextToClipboard(inboundWebhookUrl);
                          setCopiedEndpoint(true);
                          setTimeout(() => setCopiedEndpoint(false), 1600);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedEndpoint ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-xs text-slate-800 dark:text-slate-200 break-all">
                      {inboundWebhookUrl}
                    </p>
                  </div>
                </div>

                {showWebhookDocs && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        Test from terminal or configure in SendGrid Inbound Parse / Mailgun Routes:
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyTextToClipboard(curlSnippet);
                          setCopiedCurl(true);
                          setTimeout(() => setCopiedCurl(false), 1600);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {copiedCurl ? (
                          <>
                            <Check className="w-3 h-3" />
                            <span>Copied cURL</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy cURL</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="p-3.5 rounded-lg bg-slate-950 text-slate-100 border border-slate-800 text-[11px] font-mono overflow-x-auto leading-relaxed">
                      {curlSnippet}
                    </pre>
                  </div>
                )}
              </div>

              {/* Live Inbound Email Webhook Simulator */}
              <div className="p-6 space-y-4 bg-slate-50/50 dark:bg-slate-950/30">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Simulate Forwarding an Email to Your Webhook
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Posts a live inbound payload to{" "}
                    <code className="font-mono text-[11px]">
                      /api/webhooks/inbound-email
                    </code>
                    , previews the formatted auto-reply +{" "}
                    <code className="font-mono text-[11px]">.ics</code>{" "}
                    attachment, and syncs the extracted record directly into your workspace
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                  <form
                    onSubmit={(e) => void handleSimulateInboundWebhook(e)}
                    className="lg:col-span-6 space-y-3"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Sender (From)
                        </label>
                        <input
                          type="email"
                          required
                          value={webhookFrom}
                          onChange={(e) => setWebhookFrom(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                          Auto-Reply Language
                        </label>
                        <select
                          value={webhookLang}
                          onChange={(e) => setWebhookLang(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100"
                        >
                          {SUPPORTED_LANGUAGES.map((lang) => (
                            <option key={lang.code} value={lang.code}>
                              {lang.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        required
                        value={webhookSubject}
                        onChange={(e) => setWebhookSubject(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                        Forwarded Email Body
                      </label>
                      <textarea
                        rows={6}
                        required
                        value={webhookBody}
                        onChange={(e) => setWebhookBody(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-xs leading-relaxed text-slate-900 dark:text-slate-100"
                      />
                    </div>

                    {webhookError && (
                      <p className="text-xs text-red-600 dark:text-red-400">
                        {webhookError}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSendingWebhook || !webhookBody.trim()}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        {isSendingWebhook ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Processing Inbound Email...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Forward to Webhook &amp; Sync</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {/* Auto-Reply Output Card */}
                  <div className="lg:col-span-6">
                    {!webhookResponse ? (
                      <div className="p-6 rounded-lg border border-dashed border-slate-300 dark:border-slate-800 bg-white/60 dark:bg-slate-900/50 text-center min-h-[250px] flex flex-col items-center justify-center">
                        <Mail className="w-5 h-5 text-slate-400 mb-2" />
                        <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                          Outbound Auto-Reply Preview
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs leading-relaxed">
                          Click Forward to Webhook &amp; Sync to run the inbound parser, inspect the generated reply email + .ics invite, and add the record to your workspace.
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {webhookResponse.autoReply.subject}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              To: {webhookResponse.autoReply.to} · Synced to Workspace
                            </p>
                          </div>

                          {webhookResponse.autoReply.icsAttachment && (
                            <button
                              type="button"
                              onClick={() => {
                                const att =
                                  webhookResponse.autoReply.icsAttachment;
                                if (!att) return;
                                triggerIcsDownload(
                                  att.rawIcs,
                                  "distill-webhook-invite"
                                );
                                onNotifyToast?.(
                                  `Downloaded ${att.filename}`
                                );
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-md whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span>
                                {webhookResponse.autoReply.icsAttachment.filename}
                              </span>
                            </button>
                          )}
                        </div>

                        <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-700 dark:text-slate-300 max-h-60 overflow-y-auto">
                          {webhookResponse.autoReply.textBody}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
