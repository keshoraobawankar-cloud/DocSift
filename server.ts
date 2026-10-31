import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";
import mammoth from "mammoth";
import { GoogleGenAI, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveServerPort(): number {
  const portFlagIdx = process.argv.indexOf("--port");
  if (portFlagIdx !== -1 && process.argv[portFlagIdx + 1]) {
    const cliPort = Number(process.argv[portFlagIdx + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) {
      return cliPort;
    }
  }
  return Number(process.env.PORT) || 3000;
}

const PORT = resolveServerPort();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 18 * 1024 * 1024 },
});

function optionalMultipartUpload(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    upload.single("file")(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "File upload error.";
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
    return;
  }
  next();
}

function optionalAnyMultipartUpload(req: Request, res: Response, next: NextFunction) {
  const contentType = req.headers["content-type"] || "";
  if (contentType.includes("multipart/form-data")) {
    upload.any()(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Multipart webhook parse error.";
        res.status(400).json({ error: msg });
        return;
      }
      next();
    });
    return;
  }
  next();
}

function corsMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Distill-Token"
  );
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err = new Error(
      "Gemini API key is missing. Please check the Settings > Secrets panel to ensure GEMINI_API_KEY is configured."
    );
    (err as Error & { statusCode?: number }).statusCode = 403;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

interface InlineFileItem {
  mimeType: string;
  base64: string;
  fileName: string;
}

interface ExtractPayload {
  text?: string;
  fileData?: InlineFileItem;
  fileDataList?: InlineFileItem[];
  referenceDateIso?: string;
  timezone?: string;
  countryName?: string;
  summaryPointCount?: number;
  evaluationBases?: string[];
  focusHint?: string;
  targetLanguage?: string;
}

interface TranslateRecordPayload {
  targetLanguage?: string;
  documentTitle?: string;
  summaryBullets?: Array<{ lead?: string; detail?: string }>;
  actionItems?: Array<{
    id: string;
    title: string;
    owner: string;
    dueDateText: string;
    dueDateIso: string;
    priority: string;
    sourceSnippet: string;
    completed: boolean;
    status?: string;
  }>;
  calendarEvents?: Array<{
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
  }>;
  recommendedDisposition?: string;
  evaluationRationale?: string;
  criteriaBreakdown?: Array<{
    criterion: string;
    finding: string;
    rating: string;
  }>;
}

interface DraftEmailPayload {
  to?: string;
  subjectHint?: string;
  intentOrNotes?: string;
  formatStyle?: string;
  replyContext?: string;
  senderName?: string;
}

interface ServerCalendarEventInput {
  id?: string;
  title?: string;
  startIso?: string;
  endIso?: string;
  isAllDay?: boolean;
  location?: string;
  organizer?: string;
  attendees?: string[];
  description?: string;
  statusNote?: string;
}

interface InboundWebhookQueueItem {
  id: string;
  receivedAtIso: string;
  channel: "webhook" | "extension";
  sender: string;
  subject: string;
  extraction: Record<string, unknown>;
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ALLOWED_INLINE_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "text/html",
]);

function normalizeServerAudioMime(rawMime: string, fileName = ""): string | null {
  const baseMime = (rawMime || "").split(";")[0].trim().toLowerCase();
  const lower = (fileName || "").toLowerCase();
  if (
    baseMime === "audio/mpeg" ||
    baseMime === "audio/mp3" ||
    lower.endsWith(".mp3")
  ) {
    return "audio/mp3";
  }
  if (
    baseMime === "audio/wav" ||
    baseMime === "audio/x-wav" ||
    baseMime === "audio/wave" ||
    lower.endsWith(".wav")
  ) {
    return "audio/wav";
  }
  if (baseMime === "audio/ogg" || lower.endsWith(".ogg")) {
    return "audio/ogg";
  }
  if (
    baseMime === "audio/mp4" ||
    baseMime === "audio/m4a" ||
    baseMime === "audio/x-m4a" ||
    lower.endsWith(".m4a")
  ) {
    return "audio/mp4";
  }
  if (baseMime === "audio/webm" || lower.endsWith(".webm")) {
    return "audio/webm";
  }
  return null;
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: unknown) {
      attempt += 1;
      const status =
        typeof error === "object" && error !== null && "status" in error
          ? Number((error as { status?: unknown }).status)
          : undefined;
      const isTransient =
        status === 500 || status === 502 || status === 503 || status === 504;
      if (!isTransient || attempt > maxRetries) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, 600 * Math.pow(2, attempt - 1))
      );
    }
  }
}

async function transcribeAudioBase64(
  ai: GoogleGenAI,
  mimeType: string,
  base64Data: string
): Promise<string> {
  const cleanB64 = base64Data.replace(/^data:[^;]+;base64,/, "").trim();
  const audioPart = {
    inlineData: {
      mimeType,
      data: cleanB64,
    },
  };
  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: "gemini-3.5-transcribe",
      contents: {
        parts: [
          audioPart,
          {
            text: "Transcribe this audio accurately into clean, punctuated text. Preserve spoken dates, clock times, names, locations, and action items.",
          },
        ],
      },
    })
  );
  return (response.text ?? "").trim();
}

function stripHtmlTagsSimple(html: string): string {
  return (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeIcs(val: string): string {
  return (val || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatUtcIcs(date: Date): string {
  return (
    `${date.getUTCFullYear()}` +
    `${pad2(date.getUTCMonth() + 1)}` +
    `${pad2(date.getUTCDate())}T` +
    `${pad2(date.getUTCHours())}` +
    `${pad2(date.getUTCMinutes())}` +
    `${pad2(date.getUTCSeconds())}Z`
  );
}

function buildServerIcs(
  events: ServerCalendarEventInput[],
  calendarName: string
): string {
  const dtStamp = formatUtcIcs(new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Distill Mail & Document Extractor//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcs(calendarName)}`,
  ];

  events.forEach((ev, idx) => {
    const uid = `${ev.id || `ev-${idx}`}-${Date.now()}@distill.calendar`;
    lines.push("BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtStamp}`);

    const rawStart = (ev.startIso || "").trim();
    const rawEnd = (ev.endIso || "").trim();
    const ymdMatch = rawStart.match(/^(\d{4})-(\d{2})-(\d{2})/);

    if (ev.isAllDay && ymdMatch) {
      const y = Number(ymdMatch[1]);
      const m = Number(ymdMatch[2]);
      const d = Number(ymdMatch[3]);
      const startYmd = `${y}${pad2(m)}${pad2(d)}`;
      const nextDay = new Date(Date.UTC(y, m - 1, d + 1));
      const endYmd = `${nextDay.getUTCFullYear()}${pad2(
        nextDay.getUTCMonth() + 1
      )}${pad2(nextDay.getUTCDate())}`;
      lines.push(`DTSTART;VALUE=DATE:${startYmd}`);
      lines.push(`DTEND;VALUE=DATE:${endYmd}`);
    } else {
      const parsedStart = rawStart
        ? new Date(rawStart)
        : new Date(Date.now() + 3600_000);
      const safeStart = Number.isNaN(parsedStart.getTime())
        ? new Date(Date.now() + 3600_000)
        : parsedStart;
      const parsedEnd = rawEnd
        ? new Date(rawEnd)
        : new Date(safeStart.getTime() + 45 * 60_000);
      const safeEnd =
        Number.isNaN(parsedEnd.getTime()) ||
        parsedEnd.getTime() <= safeStart.getTime()
          ? new Date(safeStart.getTime() + 45 * 60_000)
          : parsedEnd;

      lines.push(`DTSTART:${formatUtcIcs(safeStart)}`);
      lines.push(`DTEND:${formatUtcIcs(safeEnd)}`);
    }

    lines.push(`SUMMARY:${escapeIcs(ev.title || "Scheduled Event")}`);
    if (ev.location) lines.push(`LOCATION:${escapeIcs(ev.location)}`);
    if (ev.description) lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`);
    lines.push("STATUS:CONFIRMED", "END:VEVENT");
  });

  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function collectIcsEventsFromExtraction(
  parsed: Record<string, unknown>
): ServerCalendarEventInput[] {
  const docTitle = String(parsed.documentTitle || "Extracted Schedule");
  const events: ServerCalendarEventInput[] = [];
  if (Array.isArray(parsed.calendarEvents)) {
    for (const ev of parsed.calendarEvents as Array<Record<string, unknown>>) {
      if (ev && typeof ev.startIso === "string" && ev.startIso.trim()) {
        events.push({
          title: String(ev.title || "Scheduled Event"),
          startIso: String(ev.startIso),
          endIso: String(ev.endIso || ""),
          isAllDay: Boolean(ev.isAllDay),
          location: String(ev.location || ""),
          description: String(ev.description || ""),
        });
      }
    }
  }
  if (Array.isArray(parsed.actionItems)) {
    for (const item of parsed.actionItems as Array<Record<string, unknown>>) {
      const dueIso = typeof item?.dueDateIso === "string" ? item.dueDateIso.trim() : "";
      if (dueIso && /^\d{4}-\d{2}-\d{2}/.test(dueIso)) {
        events.push({
          title: `Deadline: ${String(item.title || "Action Item")}`,
          startIso: dueIso.slice(0, 10),
          endIso: dueIso.slice(0, 10),
          isAllDay: true,
          description: `Task from ${docTitle} (Owner: ${String(
            item.owner || "You"
          )}, Priority: ${String(item.priority || "Medium")})`,
        });
      }
    }
  }
  return events;
}

/**
 * Pure PKZIP (Store / method 0) archive generator for downloading the Manifest v3 Browser Extension.
 */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function computeBufferCrc32(buf: Buffer): number {
  const nativeCrc = (zlib as unknown as { crc32?: (b: Buffer) => number }).crc32;
  if (typeof nativeCrc === "function") {
    return nativeCrc(buf) >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoreZipBuffer(
  files: Array<{ name: string; content: string | Buffer }>
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf-8");
    const dataBuf = Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content, "utf-8");
    const crc = computeBufferCrc32(dataBuf);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local file header signature
    localHeader.writeUInt16LE(20, 4); // Version needed to extract (2.0)
    localHeader.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    localHeader.writeUInt16LE(0, 8); // Compression method 0 (Store)
    localHeader.writeUInt16LE(0, 10); // Mod time
    localHeader.writeUInt16LE(0x5521, 12); // Mod date
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuf.length, 18);
    localHeader.writeUInt32LE(dataBuf.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, dataBuf);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central directory file header signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0x0800, 8); // UTF-8 flag
    centralHeader.writeUInt16LE(0, 10); // Store
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x5521, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuf.length, 20);
    centralHeader.writeUInt32LE(dataBuf.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + dataBuf.length;
  }

  const centralSize = centralParts.reduce((s, b) => s + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // End of central directory signature
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function buildBrowserExtensionFiles(
  apiOrigin: string,
  defaultToken: string
): Array<{ name: string; content: string }> {
  const safeOrigin = (apiOrigin || "http://localhost:3000").replace(/\/+$/, "");
  const safeToken = (defaultToken || "").replace(/[^a-zA-Z0-9_-]/g, "");

  const manifestJson = JSON.stringify(
    {
      manifest_version: 3,
      name: "Distill — One-Click Mail & Page Extractor",
      version: "1.2.0",
      description:
        "Highlight text on Gmail, Outlook Web, news articles, or portal notices and right-click to extract summaries, tasks, and .ics calendar invites.",
      permissions: ["contextMenus", "storage", "activeTab", "scripting"],
      host_permissions: ["<all_urls>"],
      background: {
        service_worker: "background.js",
      },
      action: {
        default_popup: "popup.html",
        default_title: "Distill — One-Click Extract",
      },
      browser_specific_settings: {
        gecko: {
          id: "distill-companion@distill.app",
          strict_min_version: "109.0",
        },
      },
    },
    null,
    2
  );

  const backgroundJs = `const DEFAULT_API_ORIGIN = ${JSON.stringify(safeOrigin)};
const DEFAULT_WORKSPACE_TOKEN = ${JSON.stringify(safeToken)};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "distill-extract-selection",
    title: "Extract Summary & .ics with Distill",
    contexts: ["selection"]
  });

  chrome.storage.local.get(["apiOrigin", "workspaceToken", "targetLanguage", "summaryPointCount"], (cfg) => {
    const updates = {};
    if (!cfg.apiOrigin) updates.apiOrigin = DEFAULT_API_ORIGIN;
    if (!cfg.workspaceToken && DEFAULT_WORKSPACE_TOKEN) updates.workspaceToken = DEFAULT_WORKSPACE_TOKEN;
    if (!cfg.targetLanguage) updates.targetLanguage = "Auto";
    if (!cfg.summaryPointCount) updates.summaryPointCount = 3;
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "distill-extract-selection" || !info.selectionText) {
    return;
  }

  const selectionText = info.selectionText.trim();
  if (!selectionText) return;

  const cfg = await chrome.storage.local.get([
    "apiOrigin",
    "workspaceToken",
    "targetLanguage",
    "summaryPointCount"
  ]);

  const apiOrigin = (cfg.apiOrigin || DEFAULT_API_ORIGIN).replace(/\\/+$/, "");
  await chrome.storage.local.set({
    status: "loading",
    lastError: null,
    lastSourceTitle: tab?.title || "Highlighted Selection"
  });
  chrome.action.setBadgeText({ text: "..." });
  chrome.action.setBadgeBackgroundColor({ color: "#2563EB" });

  try {
    const resp = await fetch(apiOrigin + "/api/extension/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: selectionText,
        pageTitle: tab?.title || "",
        pageUrl: tab?.url || "",
        workspaceToken: cfg.workspaceToken || DEFAULT_WORKSPACE_TOKEN,
        targetLanguage: cfg.targetLanguage || "Auto",
        summaryPointCount: Number(cfg.summaryPointCount) || 3,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      })
    });

    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || "Extraction failed");
    }

    await chrome.storage.local.set({
      status: "ready",
      lastExtraction: data.extraction,
      lastIcsContent: data.icsContent || "",
      queuedToWorkspace: Boolean(data.queuedToWorkspace),
      updatedAtIso: new Date().toISOString()
    });
    chrome.action.setBadgeText({ text: String((data.extraction?.actionItems || []).length || "OK") });
    chrome.action.setBadgeBackgroundColor({ color: "#16A34A" });
  } catch (err) {
    await chrome.storage.local.set({
      status: "error",
      lastError: err && err.message ? err.message : "Network error contacting Distill server."
    });
    chrome.action.setBadgeText({ text: "ERR" });
    chrome.action.setBadgeBackgroundColor({ color: "#DC2626" });
  }
});
`;

  const popupHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Distill Companion</title>
  <link rel="stylesheet" href="popup.css" />
</head>
<body>
  <header class="header">
    <div>
      <h1>Distill</h1>
      <p class="sub">One-Click Selection &amp; Calendar Extractor</p>
    </div>
    <button id="extractActiveBtn" class="btn-primary">Extract Selection</button>
  </header>

  <section id="statusBox" class="status-box">
    Highlight text on any webpage and right-click <strong>Extract Summary &amp; .ics with Distill</strong>, or click <strong>Extract Selection</strong> above.
  </section>

  <main id="resultContainer" class="result hidden">
    <div class="meta-line" id="metaLine"></div>
    <h2 id="docTitle" class="doc-title"></h2>
    <ol id="summaryList" class="summary-list"></ol>
    <div id="tasksSection" class="tasks-section"></div>
    <div class="actions-bar">
      <button id="copySummaryBtn" class="btn-secondary">Copy Summary</button>
      <button id="downloadIcsBtn" class="btn-primary hidden">Download .ics</button>
    </div>
  </main>

  <details class="settings">
    <summary>Workspace Sync &amp; Language Settings</summary>
    <label>Distill Server URL
      <input id="apiOriginInput" type="url" placeholder="https://..." />
    </label>
    <label>Workspace Sync Token
      <input id="workspaceTokenInput" type="text" placeholder="distill-..." />
    </label>
    <label>Target Language
      <select id="languageSelect">
        <option value="Auto">Original Language (Auto)</option>
        <option value="English">English</option>
        <option value="Spanish">Spanish</option>
        <option value="Hindi">Hindi</option>
        <option value="German">German</option>
        <option value="French">French</option>
      </select>
    </label>
    <button id="saveSettingsBtn" class="btn-secondary full">Save Settings</button>
  </details>

  <script src="popup.js"></script>
</body>
</html>
`;

  const popupCss = `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: 380px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #ffffff;
  color: #0f172a;
  padding: 14px;
  font-size: 12px;
  line-height: 1.5;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e2e8f0;
}
h1 { font-size: 15px; font-weight: 700; letter-spacing: -0.01em; }
.sub { font-size: 11px; color: #64748b; }
.btn-primary {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary:hover { background: #1d4ed8; }
.btn-secondary {
  background: #f1f5f9;
  color: #0f172a;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
}
.full { width: 100%; margin-top: 8px; }
.status-box {
  margin-top: 10px;
  padding: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
}
.hidden { display: none !important; }
.result { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.meta-line { font-size: 11px; color: #475569; font-weight: 600; }
.doc-title { font-size: 14px; font-weight: 700; color: #0f172a; }
.summary-list { padding-left: 16px; display: flex; flex-direction: column; gap: 5px; }
.tasks-section { border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.task-item { font-size: 11px; color: #334155; }
.actions-bar { display: flex; gap: 8px; padding-top: 6px; }
.settings { margin-top: 12px; padding-top: 10px; border-top: 1px solid #e2e8f0; }
.settings summary { cursor: pointer; font-weight: 600; color: #475569; margin-bottom: 8px; }
.settings label { display: block; margin-top: 6px; font-size: 11px; color: #475569; }
.settings input, .settings select {
  width: 100%;
  margin-top: 3px;
  padding: 5px 8px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  font-size: 11px;
}
`;

  const popupJs = `const DEFAULT_API_ORIGIN = ${JSON.stringify(safeOrigin)};
const DEFAULT_WORKSPACE_TOKEN = ${JSON.stringify(safeToken)};

const statusBox = document.getElementById("statusBox");
const resultContainer = document.getElementById("resultContainer");
const metaLine = document.getElementById("metaLine");
const docTitle = document.getElementById("docTitle");
const summaryList = document.getElementById("summaryList");
const tasksSection = document.getElementById("tasksSection");
const copySummaryBtn = document.getElementById("copySummaryBtn");
const downloadIcsBtn = document.getElementById("downloadIcsBtn");
const extractActiveBtn = document.getElementById("extractActiveBtn");
const apiOriginInput = document.getElementById("apiOriginInput");
const workspaceTokenInput = document.getElementById("workspaceTokenInput");
const languageSelect = document.getElementById("languageSelect");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");

let currentExtraction = null;
let currentIcs = "";

function renderState(data) {
  apiOriginInput.value = data.apiOrigin || DEFAULT_API_ORIGIN;
  workspaceTokenInput.value = data.workspaceToken || DEFAULT_WORKSPACE_TOKEN;
  languageSelect.value = data.targetLanguage || "Auto";

  if (data.status === "loading") {
    statusBox.classList.remove("hidden");
    statusBox.textContent = "Extracting summary, tasks, and calendar events...";
    resultContainer.classList.add("hidden");
    return;
  }

  if (data.status === "error") {
    statusBox.classList.remove("hidden");
    statusBox.textContent = "Error: " + (data.lastError || "Could not reach Distill.");
    resultContainer.classList.add("hidden");
    return;
  }

  if (data.lastExtraction) {
    currentExtraction = data.lastExtraction;
    currentIcs = data.lastIcsContent || "";
    statusBox.classList.add("hidden");
    resultContainer.classList.remove("hidden");

    const ev = currentExtraction.mailEvaluation || {};
    const parts = [
      ev.urgencyLevel || "Action Required",
      ev.detectedTone ? "Tone: " + ev.detectedTone : "",
      currentExtraction.detectedLanguage ? "Lang: " + currentExtraction.detectedLanguage : "",
      data.queuedToWorkspace ? "Synced to Workspace" : ""
    ].filter(Boolean);
    metaLine.textContent = parts.join(" · ");
    docTitle.textContent = currentExtraction.documentTitle || "Extracted Selection";

    summaryList.innerHTML = "";
    (currentExtraction.summaryBullets || []).forEach((b) => {
      const li = document.createElement("li");
      const strong = document.createElement("strong");
      strong.textContent = (b.lead || "Point").replace(/:$/, "") + ": ";
      li.appendChild(strong);
      li.appendChild(document.createTextNode(b.detail || ""));
      summaryList.appendChild(li);
    });

    tasksSection.innerHTML = "";
    const tasks = currentExtraction.actionItems || [];
    tasks.slice(0, 5).forEach((t) => {
      const div = document.createElement("div");
      div.className = "task-item";
      div.textContent = "• [" + (t.priority || "Medium") + "] " + t.title + " (" + (t.dueDateText || "No deadline") + ")";
      tasksSection.appendChild(div);
    });

    if (currentIcs) {
      downloadIcsBtn.classList.remove("hidden");
    } else {
      downloadIcsBtn.classList.add("hidden");
    }
  }
}

chrome.storage.local.get(null, renderState);
chrome.storage.onChanged.addListener(() => {
  chrome.storage.local.get(null, renderState);
});

copySummaryBtn.addEventListener("click", async () => {
  if (!currentExtraction) return;
  const lines = (currentExtraction.summaryBullets || []).map(
    (b, i) => (i + 1) + ". " + b.lead + ": " + b.detail
  );
  await navigator.clipboard.writeText(lines.join("\\n"));
  copySummaryBtn.textContent = "Copied!";
  setTimeout(() => { copySummaryBtn.textContent = "Copy Summary"; }, 1400);
});

downloadIcsBtn.addEventListener("click", () => {
  if (!currentIcs) return;
  const blob = new Blob([currentIcs], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "distill-invite.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

saveSettingsBtn.addEventListener("click", () => {
  chrome.storage.local.set({
    apiOrigin: apiOriginInput.value.trim() || DEFAULT_API_ORIGIN,
    workspaceToken: workspaceTokenInput.value.trim(),
    targetLanguage: languageSelect.value
  }, () => {
    saveSettingsBtn.textContent = "Saved!";
    setTimeout(() => { saveSettingsBtn.textContent = "Save Settings"; }, 1200);
  });
});

extractActiveBtn.addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;

  try {
    const [{ result: selectedText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() || ""
    });

    if (!selectedText || !selectedText.trim()) {
      statusBox.classList.remove("hidden");
      statusBox.textContent = "Select/highlight some text on the current webpage first, then click Extract Selection.";
      return;
    }

    const cfg = await chrome.storage.local.get(["apiOrigin", "workspaceToken", "targetLanguage", "summaryPointCount"]);
    const apiOrigin = (cfg.apiOrigin || DEFAULT_API_ORIGIN).replace(/\\/+$/, "");

    await chrome.storage.local.set({ status: "loading", lastError: null });
    const resp = await fetch(apiOrigin + "/api/extension/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: selectedText.trim(),
        pageTitle: tab.title || "",
        pageUrl: tab.url || "",
        workspaceToken: cfg.workspaceToken || DEFAULT_WORKSPACE_TOKEN,
        targetLanguage: cfg.targetLanguage || "Auto",
        summaryPointCount: Number(cfg.summaryPointCount) || 3,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
      })
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Extraction failed");

    await chrome.storage.local.set({
      status: "ready",
      lastExtraction: data.extraction,
      lastIcsContent: data.icsContent || "",
      queuedToWorkspace: Boolean(data.queuedToWorkspace)
    });
  } catch (err) {
    await chrome.storage.local.set({
      status: "error",
      lastError: err && err.message ? err.message : "Could not read selection on this tab."
    });
  }
});
`;

  const readmeMd = `# Distill Companion Browser Extension (Manifest v3)

One-click webpage highlight extractor for **Chrome, Edge, Brave, and Firefox**.

## Pre-Configured Workspace Connection
- **Distill API Endpoint**: \`${safeOrigin}\`
- **Workspace Sync Token**: \`${safeToken || "(configure in extension popup)"}\`

## Load in Chrome / Edge / Brave
1. Unzip \`distill-browser-extension-mv3.zip\` into a local folder.
2. Open \`chrome://extensions\` and enable **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the unzipped folder.
4. Highlight any email thread (Gmail, Outlook Web), portal announcement, or article, right-click, and choose **Extract Summary & .ics with Distill**.

## Load in Firefox
1. Unzip \`distill-browser-extension-mv3.zip\`.
2. Open \`about:debugging#/runtime/this-firefox\`.
3. Click **Load Temporary Add-on...** and select \`manifest.json\`.
`;

  return [
    { name: "manifest.json", content: manifestJson },
    { name: "background.js", content: backgroundJs },
    { name: "popup.html", content: popupHtml },
    { name: "popup.css", content: popupCss },
    { name: "popup.js", content: popupJs },
    { name: "README.md", content: readmeMd },
  ];
}

// Bounded In-Memory Queue for Direct Email Webhooks & Companion Extension Sync
const webhookInboxByToken = new Map<string, InboundWebhookQueueItem[]>();

function sanitizeWorkspaceToken(raw: unknown): string {
  const cleaned = String(raw || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
  return cleaned.length >= 4 ? cleaned : "";
}

function resolveWorkspaceToken(rawToken: unknown, recipientField: unknown): string {
  const direct = sanitizeWorkspaceToken(rawToken);
  if (direct) return direct;
  const recipientStr = String(recipientField || "");
  const plusMatch = recipientStr.match(/extract\+([a-zA-Z0-9_-]{4,64})@/i);
  if (plusMatch) {
    return sanitizeWorkspaceToken(plusMatch[1]);
  }
  return "";
}

function enqueueWorkspaceExtraction(
  token: string,
  item: InboundWebhookQueueItem
): boolean {
  const cleanToken = sanitizeWorkspaceToken(token);
  if (!cleanToken) return false;
  if (!webhookInboxByToken.has(cleanToken) && webhookInboxByToken.size >= 200) {
    const oldestKey = webhookInboxByToken.keys().next().value;
    if (oldestKey) webhookInboxByToken.delete(oldestKey);
  }
  const existing = webhookInboxByToken.get(cleanToken) ?? [];
  const next = [item, ...existing].slice(0, 25);
  webhookInboxByToken.set(cleanToken, next);
  return true;
}

async function runDocumentExtraction(params: {
  rawTextInput: string;
  candidateFiles: InlineFileItem[];
  timezone: string;
  countryName: string;
  referenceDateIso: string;
  summaryPointCount: number;
  evaluationBases: string[];
  focusHint: string;
  targetLanguage: string;
}): Promise<Record<string, unknown>> {
  const ai = getGenAIClient();
  let rawText = params.rawTextInput.trim();
  const inlineFiles: InlineFileItem[] = [];

  for (const item of params.candidateFiles) {
    const lowerFile = (item.fileName || "").toLowerCase();
    const audioMime = normalizeServerAudioMime(item.mimeType, item.fileName);

    if (item.mimeType === DOCX_MIME || lowerFile.endsWith(".docx")) {
      const docxRes = await mammoth.extractRawText({
        buffer: Buffer.from(item.base64, "base64"),
      });
      const docxText = (docxRes.value || "").trim();
      if (docxText) {
        rawText = [
          rawText,
          `--- Word Document (${item.fileName}) ---\n${docxText}`,
        ]
          .filter(Boolean)
          .join("\n\n");
      }
    } else if (audioMime) {
      const transcript = await transcribeAudioBase64(ai, audioMime, item.base64);
      if (transcript) {
        rawText = [
          rawText,
          `--- Audio Transcript (${item.fileName || "Voice Note"}) ---\n${transcript}`,
        ]
          .filter(Boolean)
          .join("\n\n");
      }
    } else {
      inlineFiles.push(item);
    }
  }

  if (!rawText && inlineFiles.length === 0) {
    const err = new Error(
      "Please paste readable text, record a voice note, or upload a supported document (.pdf, .docx, .eml, .txt, audio, or image screenshot) before running extraction."
    );
    (err as Error & { statusCode?: number }).statusCode = 400;
    throw err;
  }

  for (const f of inlineFiles) {
    if (!ALLOWED_INLINE_MIMES.has(f.mimeType)) {
      const err = new Error(
        `Unsupported file type (${f.mimeType}). Upload a PDF, Word (.docx), Audio (.mp3, .wav, .m4a, .webm, .ogg), Image screenshot (.png, .jpg, .webp), .eml, or .txt file.`
      );
      (err as Error & { statusCode?: number }).statusCode = 400;
      throw err;
    }
  }

  const activeBases =
    params.evaluationBases.length > 0
      ? params.evaluationBases
      : ["Promotional & Spam Check", "Urgency & Deadlines", "Action & Effort Required"];

  const targetLang = (params.targetLanguage || "Auto").trim();
  const hasExplicitTargetLanguage =
    Boolean(targetLang) && targetLang.toLowerCase() !== "auto";

  const languageRule = hasExplicitTargetLanguage
    ? `11. MULTI-LANGUAGE TRANSLATION: Detect the input's original language in \`detectedLanguage\` (e.g. 'English', 'Spanish', 'Hindi', 'German'). Write ALL user-facing prose fields (\`documentTitle\`, \`documentType\`, \`summaryBullets\`, \`actionItems[].title\`, \`actionItems[].dueDateText\`, \`calendarEvents[].title\`, \`calendarEvents[].description\`, \`calendarEvents[].statusNote\`, \`mailEvaluation.recommendedDisposition\`, \`mailEvaluation.evaluationRationale\`, \`mailEvaluation.detectedSignals\`, \`mailEvaluation.criteriaBreakdown[].finding\`) naturally in ${targetLang}. CRITICAL: Keep \`mailEvaluation.classification\`, \`mailEvaluation.urgencyLevel\`, \`actionItems[].priority\` ('High', 'Medium', 'Low'), and ISO date strings (\`YYYY-MM-DD...\`) in their exact canonical English / ISO values.`
    : "11. LANGUAGE DETECTION: Detect the primary language of the source input in `detectedLanguage` (e.g. 'English', 'Spanish', 'Hindi', 'German', 'French', 'Japanese'). Keep prose fields in the source's primary language (or English if technical/mixed), while keeping `mailEvaluation.classification`, `mailEvaluation.urgencyLevel`, and `actionItems[].priority` in their exact canonical English enum values.";

  const systemInstruction = [
    "You are an executive mail, voice-note, and document intelligence extractor with full multimodal OCR and document vision capabilities.",
    "Your job is to evaluate email/document/screenshot/transcript content strictly according to the user's selected evaluation criteria and extract the exact requested number of summary points, tasks, calendar invites, tone/urgency classification, and attachment references.",
    `Reference current date/time: ${params.referenceDateIso} (${
      params.countryName ? `Country: ${params.countryName}, ` : ""
    }Timezone: ${params.timezone}).`,
    "Rules:",
    "1. If image screenshots, scanned PDFs, or photographed notices are attached, perform careful visual OCR across headers, stamps, tables, and body text.",
    "2. Evaluate the mail/document intent in `mailEvaluation`: set `classification` to EXACTLY one of: 'Action Required', 'Promotional / Marketing', 'Newsletter / Digest', 'Transactional / Receipt', 'Informational / FYI', or 'Suspicious / Unsolicited'.",
    "3. TONE & URGENCY CLASSIFIER: Set `mailEvaluation.urgencyLevel` to EXACTLY one of: 'Urgent' (time-critical deadlines within 48 hours, escalations, outages, mandatory compliance), 'Action Required' (clear tasks, RSVPs, or deliverables required from the recipient), or 'Informational' (FYI updates, newsletters, receipts, or promotional outreach with no mandatory action). Set `mailEvaluation.detectedTone` to a concise 1-2 word tone descriptor such as 'Formal', 'Strict', 'Friendly', 'Collaborative', 'Urgent', 'Persuasive', or 'Informative'.",
    `4. Evaluate the content specifically on EACH of the user's chosen evaluation bases: [${activeBases.join(
      ", "
    )}]. Populate \`mailEvaluation.criteriaBreakdown\` with one entry per chosen basis (\`criterion\`, concise factual \`finding\`, and short \`rating\`).`,
    "5. Set `requiresUserAction: false` if the email is promotional marketing, cold sales outreach, a newsletter digest, a routine receipt with no issue, pure FYI, or spam/phishing. Do NOT let artificial marketing FOMO trick you into marking `requiresUserAction: true` or 'Urgent'.",
    "6. Resolve relative dates ('this Thursday', 'tomorrow at 3pm', 'next Monday') relative to the document's sent date if explicitly present in headers, otherwise relative to the reference current date/time. CRITICAL EDGE CASE: If the unstructured text contains NO dates, times, meetings, or deadlines, return `calendarEvents: []` and set `dueDateText: 'No fixed deadline'` and `dueDateIso: ''` on tasks—NEVER invent or hallucinate dates.",
    `7. Generate EXACTLY ${params.summaryPointCount} concise summary ${
      params.summaryPointCount === 1 ? "point" : "points"
    } in \`summaryBullets\` (MUST contain ${params.summaryPointCount} ${
      params.summaryPointCount === 1 ? "item" : "items"
    }). Each item has a 2-5 word \`lead\` phrase and a single clear \`detail\` sentence.`,
    "8. Extract concrete actionable tasks in `actionItems`. Start each task `title` with a clear action verb. Identify `owner` ('You' if addressed to the recipient, or the specific person/team named). Set `priority` to 'High', 'Medium', or 'Low'. Include a brief `sourceSnippet`.",
    "9. Extract meetings, appointments, exam windows, inspection windows, or hard calendar deadlines in `calendarEvents`. Format timed `startIso` and `endIso` as local wall-clock ISO strings `YYYY-MM-DDTHH:mm:ss` (without trailing Z). For all-day events, set `isAllDay: true` and format `startIso` and `endIso` as `YYYY-MM-DD`.",
    "10. In `referencedAttachments`, list any documents, PDFs, Word docs, spreadsheets, forms, or files explicitly mentioned in the email/document as attached, enclosed, or required.",
    languageRule,
    rawText
      ? "12. Because plain text content is already provided in the prompt, set `sourceTranscript` to an empty string ''."
      : "12. Because no plain text body was provided (e.g. a PDF or image screenshot was uploaded), transcribe the readable text from the uploaded document/image into `sourceTranscript` (up to 6,000 characters) so the user can inspect the full source context.",
    params.focusHint
      ? `13. Additional user focus instruction: ${params.focusHint}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  for (const f of inlineFiles) {
    parts.push({
      inlineData: {
        mimeType: f.mimeType,
        data: f.base64,
      },
    });
  }

  const promptLines: string[] = [
    `Evaluate this content on the basis of [${activeBases.join(
      ", "
    )}], classify urgency and tone, generate EXACTLY ${
      params.summaryPointCount
    } summary ${
      params.summaryPointCount === 1 ? "point" : "points"
    }${
      hasExplicitTargetLanguage ? ` in ${targetLang}` : ""
    }, and extract tasks, calendar events, and referenced attachments.`,
  ];
  if (inlineFiles.length > 0) {
    promptLines.push(
      `Attached file(s) provided: ${inlineFiles.map((f) => f.fileName).join(", ")}`
    );
  }
  if (rawText) {
    promptLines.push(`Document / Email / Transcript Content:\n"""\n${rawText}\n"""`);
  }

  parts.push({ text: promptLines.join("\n\n") });

  const response = await callWithRetry(() =>
    ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            documentTitle: {
              type: Type.STRING,
              description:
                "Clear, specific 3-8 word title summarizing the email, voice note, or document.",
            },
            documentType: {
              type: Type.STRING,
              description: "Short document category.",
            },
            senderOrSource: {
              type: Type.STRING,
              description:
                "Sender name, instructor, brand, organization, or speaker if identifiable, otherwise empty string.",
            },
            detectedLanguage: {
              type: Type.STRING,
              description:
                "Detected primary human language of the original source text (e.g. 'English', 'Spanish', 'Hindi', 'German').",
            },
            estimatedReadMinutesSaved: {
              type: Type.INTEGER,
              description:
                "Estimated minutes saved compared to manually reading and triaging the raw source (minimum 1).",
            },
            mailEvaluation: {
              type: Type.OBJECT,
              properties: {
                classification: {
                  type: Type.STRING,
                  description:
                    "MUST be one of: 'Action Required', 'Promotional / Marketing', 'Newsletter / Digest', 'Transactional / Receipt', 'Informational / FYI', or 'Suspicious / Unsolicited'.",
                },
                urgencyLevel: {
                  type: Type.STRING,
                  description:
                    "MUST be one of: 'Urgent', 'Action Required', or 'Informational'.",
                },
                detectedTone: {
                  type: Type.STRING,
                  description:
                    "Short 1-2 word tone or sentiment label such as 'Formal', 'Strict', 'Friendly', 'Collaborative', 'Urgent', 'Persuasive', or 'Informative'.",
                },
                requiresUserAction: {
                  type: Type.BOOLEAN,
                },
                recommendedDisposition: {
                  type: Type.STRING,
                },
                evaluationRationale: {
                  type: Type.STRING,
                },
                detectedSignals: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                criteriaBreakdown: {
                  type: Type.ARRAY,
                  description:
                    "Evaluation findings for each user-selected evaluation basis.",
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      criterion: { type: Type.STRING },
                      finding: { type: Type.STRING },
                      rating: { type: Type.STRING },
                    },
                    required: ["criterion", "finding", "rating"],
                  },
                },
              },
              required: [
                "classification",
                "urgencyLevel",
                "detectedTone",
                "requiresUserAction",
                "recommendedDisposition",
                "evaluationRationale",
                "detectedSignals",
                "criteriaBreakdown",
              ],
            },
            summaryBullets: {
              type: Type.ARRAY,
              description: `Exactly ${params.summaryPointCount} summary points.`,
              items: {
                type: Type.OBJECT,
                properties: {
                  lead: { type: Type.STRING },
                  detail: { type: Type.STRING },
                },
                required: ["lead", "detail"],
              },
            },
            actionItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  owner: { type: Type.STRING },
                  dueDateText: { type: Type.STRING },
                  dueDateIso: {
                    type: Type.STRING,
                    description:
                      "Task due date resolved to local ISO 'YYYY-MM-DDTHH:mm:ss' if a time is specified, 'YYYY-MM-DD' if date-only, or '' if no deadline exists.",
                  },
                  priority: { type: Type.STRING },
                  sourceSnippet: { type: Type.STRING },
                },
                required: [
                  "title",
                  "owner",
                  "dueDateText",
                  "dueDateIso",
                  "priority",
                  "sourceSnippet",
                ],
              },
            },
            calendarEvents: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  eventType: { type: Type.STRING },
                  startIso: { type: Type.STRING },
                  endIso: { type: Type.STRING },
                  isAllDay: { type: Type.BOOLEAN },
                  location: { type: Type.STRING },
                  organizer: { type: Type.STRING },
                  attendees: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  description: { type: Type.STRING },
                  statusNote: { type: Type.STRING },
                },
                required: [
                  "title",
                  "eventType",
                  "startIso",
                  "endIso",
                  "isAllDay",
                  "location",
                  "organizer",
                  "attendees",
                  "description",
                  "statusNote",
                ],
              },
            },
            referencedAttachments: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  fileName: { type: Type.STRING },
                  mimeHint: { type: Type.STRING },
                  contextNote: { type: Type.STRING },
                },
                required: ["fileName", "mimeHint", "contextNote"],
              },
            },
            sourceTranscript: {
              type: Type.STRING,
              description:
                "OCR plain-text transcript when only binary/image/PDF files were uploaded; empty string '' when plain text was already provided.",
            },
          },
          required: [
            "documentTitle",
            "documentType",
            "senderOrSource",
            "detectedLanguage",
            "estimatedReadMinutesSaved",
            "mailEvaluation",
            "summaryBullets",
            "actionItems",
            "calendarEvents",
            "referencedAttachments",
            "sourceTranscript",
          ],
        },
      },
    })
  );

  const jsonText = (response.text ?? "").trim();
  if (!jsonText) {
    const err = new Error(
      "The model returned an empty response. Please try again with clearer text, audio, or a readable PDF."
    );
    (err as Error & { statusCode?: number }).statusCode = 502;
    throw err;
  }

  const parsed = JSON.parse(jsonText) as Record<string, unknown>;
  const detectedLanguage =
    typeof parsed.detectedLanguage === "string" && parsed.detectedLanguage.trim()
      ? parsed.detectedLanguage.trim()
      : "English";
  const outputLanguage = hasExplicitTargetLanguage ? targetLang : detectedLanguage;

  const resolvedSourceText = (
    rawText ||
    (typeof parsed.sourceTranscript === "string"
      ? parsed.sourceTranscript.trim()
      : "")
  ).slice(0, 30000);

  return {
    ...parsed,
    detectedLanguage,
    outputLanguage,
    resolvedSourceText,
  };
}

function sendGenAiError(res: Response, error: unknown, defaultMsg: string) {
  console.error("API error:", error);
  const rawMessage = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode)
        : 500;

  if (
    status === 403 ||
    rawMessage.includes("PERMISSION_DENIED") ||
    rawMessage.includes("API_KEY_INVALID") ||
    rawMessage.includes("API key not valid")
  ) {
    res.status(403).json({
      error:
        "Unable to authenticate with Gemini API. Please check or select a valid API key in the Settings > Secrets panel.",
    });
    return;
  }

  if (status === 429 || rawMessage.includes("RESOURCE_EXHAUSTED")) {
    res.status(429).json({
      error:
        "API rate limit or quota reached. Upgrading to a paid tier in the Settings > Secrets panel increases available quota.",
    });
    return;
  }

  res.status(status >= 400 && status < 600 ? status : 500).json({
    error: rawMessage || defaultMsg,
  });
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ extended: true, limit: "25mb" }));

  // Enable CORS on Browser Extension & Inbound Webhook endpoints
  app.use("/api/extension", corsMiddleware);
  app.use("/api/webhooks", corsMiddleware);

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "distill-extractor-api" });
  });

  /**
   * POST /api/parse-docx
   * Extracts clean plain text from a base64-encoded .docx Word document.
   */
  app.post("/api/parse-docx", async (req: Request, res: Response) => {
    try {
      const base64 =
        typeof req.body?.base64 === "string" ? req.body.base64.trim() : "";
      if (!base64) {
        res.status(400).json({ error: "Missing base64 .docx payload." });
        return;
      }
      const buffer = Buffer.from(base64, "base64");
      const result = await mammoth.extractRawText({ buffer });
      res.json({ text: (result.value || "").trim() });
    } catch (error: unknown) {
      const msg =
        error instanceof Error
          ? error.message
          : "Could not parse .docx Word document.";
      res.status(400).json({ error: msg });
    }
  });

  /**
   * POST /api/transcribe-audio
   * Runs speech-to-text on recorded voice notes or uploaded audio files via gemini-3.5-transcribe.
   */
  app.post(
    "/api/transcribe-audio",
    optionalMultipartUpload,
    async (req: Request, res: Response) => {
      try {
        let base64 =
          typeof req.body?.base64 === "string" ? req.body.base64.trim() : "";
        let rawMime =
          typeof req.body?.mimeType === "string" ? req.body.mimeType.trim() : "";
        let fileName =
          typeof req.body?.fileName === "string" ? req.body.fileName.trim() : "";

        if (req.file) {
          base64 = req.file.buffer.toString("base64");
          rawMime = req.file.mimetype || rawMime;
          fileName = req.file.originalname || fileName;
        }

        if (!base64) {
          res.status(400).json({
            error: "Please record or upload an audio clip before transcribing.",
          });
          return;
        }

        const audioMime =
          normalizeServerAudioMime(rawMime, fileName) || "audio/webm";
        const ai = getGenAIClient();
        const transcript = await transcribeAudioBase64(ai, audioMime, base64);

        if (!transcript) {
          res.status(422).json({
            error:
              "No clear speech was detected in the audio recording. Please try speaking closer to the microphone.",
          });
          return;
        }

        const wordCount = transcript.split(/\s+/).filter(Boolean).length;
        res.json({ transcript, wordCount });
      } catch (error: unknown) {
        sendGenAiError(res, error, "Failed to transcribe voice note.");
      }
    }
  );

  /**
   * POST /api/extract
   * Evaluates an email/document/voice-note based on user-chosen criteria and extracts
   * summary points, tone & urgency, language, tasks, calendar events, and attachments.
   */
  app.post(
    "/api/extract",
    optionalMultipartUpload,
    async (req: Request, res: Response) => {
      try {
        const body = (req.body ?? {}) as ExtractPayload;
        let rawText = typeof body.text === "string" ? body.text.trim() : "";
        let fileData = body.fileData;

        if (req.file) {
          const lowerName = req.file.originalname.toLowerCase();
          const isDocxUpload =
            req.file.mimetype === DOCX_MIME || lowerName.endsWith(".docx");
          const isTextUpload =
            req.file.mimetype.startsWith("text/") ||
            req.file.mimetype === "message/rfc822" ||
            lowerName.endsWith(".txt") ||
            lowerName.endsWith(".md") ||
            lowerName.endsWith(".eml") ||
            lowerName.endsWith(".csv");

          if (isDocxUpload) {
            const docxRes = await mammoth.extractRawText({
              buffer: req.file.buffer,
            });
            const docxText = (docxRes.value || "").trim();
            rawText = [
              rawText,
              docxText
                ? `--- Word Document (${req.file.originalname}) ---\n${docxText}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n");
          } else if (isTextUpload) {
            const uploadedText = req.file.buffer.toString("utf-8").trim();
            rawText = [rawText, uploadedText].filter(Boolean).join("\n\n");
          } else {
            let detectedMime = req.file.mimetype;
            const audioMime = normalizeServerAudioMime(
              detectedMime,
              req.file.originalname
            );
            if (audioMime) {
              detectedMime = audioMime;
            } else if (!detectedMime || detectedMime === "application/octet-stream") {
              if (lowerName.endsWith(".pdf")) detectedMime = "application/pdf";
              else if (lowerName.endsWith(".png")) detectedMime = "image/png";
              else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) {
                detectedMime = "image/jpeg";
              } else if (lowerName.endsWith(".webp")) detectedMime = "image/webp";
            }
            fileData = {
              mimeType: detectedMime,
              base64: req.file.buffer.toString("base64"),
              fileName: req.file.originalname,
            };
          }
        }

        const timezone =
          typeof body.timezone === "string" && body.timezone
            ? body.timezone
            : "UTC";
        const countryName =
          typeof body.countryName === "string" && body.countryName
            ? body.countryName
            : "";
        const referenceDateIso =
          typeof body.referenceDateIso === "string" && body.referenceDateIso
            ? body.referenceDateIso
            : new Date().toISOString();
        const focusHint =
          typeof body.focusHint === "string" ? body.focusHint.trim() : "";
        const targetLanguage =
          typeof body.targetLanguage === "string" && body.targetLanguage.trim()
            ? body.targetLanguage.trim()
            : "Auto";

        const summaryPointCount = Math.min(
          10,
          Math.max(1, Math.round(Number(body.summaryPointCount) || 3))
        );

        const requestedBases = Array.isArray(body.evaluationBases)
          ? body.evaluationBases
              .map((b) => String(b || "").trim())
              .filter(Boolean)
              .slice(0, 10)
          : [];

        const candidateFiles: InlineFileItem[] = [];
        if (Array.isArray(body.fileDataList)) {
          for (const item of body.fileDataList) {
            if (item && item.base64 && item.mimeType) {
              candidateFiles.push(item);
            }
          }
        }
        if (fileData && fileData.base64 && candidateFiles.length === 0) {
          candidateFiles.push(fileData);
        }

        const result = await runDocumentExtraction({
          rawTextInput: rawText,
          candidateFiles,
          timezone,
          countryName,
          referenceDateIso,
          summaryPointCount,
          evaluationBases: requestedBases,
          focusHint,
          targetLanguage,
        });

        res.json(result);
      } catch (error: unknown) {
        sendGenAiError(res, error, "Failed to extract actions from document.");
      }
    }
  );

  /**
   * POST /api/translate-record
   * Translates an existing extracted document's summary, action items, calendar invites,
   * and disposition into the user's chosen target language while preserving IDs, statuses, and ISO dates.
   */
  app.post("/api/translate-record", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as TranslateRecordPayload;
      const targetLanguage =
        typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";

      if (!targetLanguage || targetLanguage.toLowerCase() === "auto") {
        res.status(400).json({
          error: "Select a specific target language to translate this extraction.",
        });
        return;
      }

      const inputBullets = Array.isArray(body.summaryBullets)
        ? body.summaryBullets
        : [];
      const inputTasks = Array.isArray(body.actionItems) ? body.actionItems : [];
      const inputEvents = Array.isArray(body.calendarEvents)
        ? body.calendarEvents
        : [];
      const inputCriteria = Array.isArray(body.criteriaBreakdown)
        ? body.criteriaBreakdown
        : [];

      const ai = getGenAIClient();

      const systemInstruction = [
        `You are a precise professional translator localizing structured executive briefs into ${targetLanguage}.`,
        "Rules:",
        `1. Translate all prose fields accurately and naturally into ${targetLanguage}.`,
        "2. Preserve every `id` string verbatim so items map back 1-to-1.",
        "3. Keep person names, email addresses, URLs, room codes, and brand names intact.",
      ].join("\n");

      const sourcePayload = {
        documentTitle: body.documentTitle || "Extracted Document",
        recommendedDisposition: body.recommendedDisposition || "",
        evaluationRationale: body.evaluationRationale || "",
        summaryBullets: inputBullets.map((b) => ({
          lead: String(b?.lead || ""),
          detail: String(b?.detail || ""),
        })),
        tasks: inputTasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDateText: t.dueDateText,
        })),
        events: inputEvents.map((ev) => ({
          id: ev.id,
          title: ev.title,
          description: ev.description,
          statusNote: ev.statusNote,
        })),
        criteriaBreakdown: inputCriteria.map((c) => ({
          criterion: c.criterion,
          finding: c.finding,
          rating: c.rating,
        })),
      };

      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: `Translate the following structured extraction into ${targetLanguage}:\n${JSON.stringify(
            sourcePayload,
            null,
            2
          )}`,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                documentTitle: { type: Type.STRING },
                recommendedDisposition: { type: Type.STRING },
                evaluationRationale: { type: Type.STRING },
                summaryBullets: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      lead: { type: Type.STRING },
                      detail: { type: Type.STRING },
                    },
                    required: ["lead", "detail"],
                  },
                },
                tasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      dueDateText: { type: Type.STRING },
                    },
                    required: ["id", "title", "dueDateText"],
                  },
                },
                events: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING },
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      statusNote: { type: Type.STRING },
                    },
                    required: ["id", "title", "description", "statusNote"],
                  },
                },
                criteriaBreakdown: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      criterion: { type: Type.STRING },
                      finding: { type: Type.STRING },
                      rating: { type: Type.STRING },
                    },
                    required: ["criterion", "finding", "rating"],
                  },
                },
              },
              required: [
                "documentTitle",
                "recommendedDisposition",
                "evaluationRationale",
                "summaryBullets",
                "tasks",
                "events",
                "criteriaBreakdown",
              ],
            },
          },
        })
      );

      const jsonText = (response.text ?? "").trim();
      if (!jsonText) {
        res.status(502).json({ error: "Received empty translation response." });
        return;
      }

      const translated = JSON.parse(jsonText) as {
        documentTitle?: string;
        recommendedDisposition?: string;
        evaluationRationale?: string;
        summaryBullets?: Array<{ lead: string; detail: string }>;
        tasks?: Array<{ id: string; title: string; dueDateText: string }>;
        events?: Array<{
          id: string;
          title: string;
          description: string;
          statusNote: string;
        }>;
        criteriaBreakdown?: Array<{
          criterion: string;
          finding: string;
          rating: string;
        }>;
      };

      const taskMap = new Map(
        (translated.tasks || []).map((t) => [t.id, t])
      );
      const eventMap = new Map(
        (translated.events || []).map((ev) => [ev.id, ev])
      );

      const mergedActionItems = inputTasks.map((orig, idx) => {
        const match = taskMap.get(orig.id) ?? translated.tasks?.[idx];
        return {
          ...orig,
          title: match?.title?.trim() || orig.title,
          dueDateText: match?.dueDateText?.trim() || orig.dueDateText,
        };
      });

      const mergedCalendarEvents = inputEvents.map((orig, idx) => {
        const match = eventMap.get(orig.id) ?? translated.events?.[idx];
        return {
          ...orig,
          title: match?.title?.trim() || orig.title,
          description: match?.description?.trim() ?? orig.description,
          statusNote: match?.statusNote?.trim() ?? orig.statusNote,
        };
      });

      res.json({
        outputLanguage: targetLanguage,
        documentTitle:
          translated.documentTitle?.trim() ||
          body.documentTitle ||
          "Extracted Document",
        recommendedDisposition:
          translated.recommendedDisposition?.trim() ||
          body.recommendedDisposition ||
          "",
        evaluationRationale:
          translated.evaluationRationale?.trim() ||
          body.evaluationRationale ||
          "",
        summaryBullets:
          translated.summaryBullets && translated.summaryBullets.length > 0
            ? translated.summaryBullets
            : inputBullets,
        actionItems: mergedActionItems,
        calendarEvents: mergedCalendarEvents,
        criteriaBreakdown:
          translated.criteriaBreakdown && translated.criteriaBreakdown.length > 0
            ? translated.criteriaBreakdown
            : inputCriteria,
      });
    } catch (error: unknown) {
      sendGenAiError(res, error, "Failed to translate extraction.");
    }
  });

  /**
   * GET /api/extension/source
   * Returns the complete Manifest v3 Chrome/Firefox browser extension source files.
   */
  app.get("/api/extension/source", (req: Request, res: Response) => {
    const proto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ||
      req.protocol ||
      "https";
    const host = req.headers.host || `localhost:${PORT}`;
    const origin =
      typeof req.query.origin === "string" && req.query.origin.trim()
        ? req.query.origin.trim()
        : `${proto}://${host}`;
    const token = sanitizeWorkspaceToken(req.query.token);

    const files = buildBrowserExtensionFiles(origin, token);
    res.json({ origin, token, files });
  });

  /**
   * GET /api/extension/download.zip
   * Generates and downloads a ready-to-load Manifest v3 .zip extension package.
   */
  app.get("/api/extension/download.zip", (req: Request, res: Response) => {
    const proto =
      (req.headers["x-forwarded-proto"] as string)?.split(",")[0] ||
      req.protocol ||
      "https";
    const host = req.headers.host || `localhost:${PORT}`;
    const origin =
      typeof req.query.origin === "string" && req.query.origin.trim()
        ? req.query.origin.trim()
        : `${proto}://${host}`;
    const token = sanitizeWorkspaceToken(req.query.token);

    const files = buildBrowserExtensionFiles(origin, token);
    const zipBuffer = createStoreZipBuffer(files);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="distill-browser-extension-mv3.zip"'
    );
    res.setHeader("Content-Length", String(zipBuffer.length));
    res.send(zipBuffer);
  });

  /**
   * POST /api/extension/extract
   * One-Click Extract endpoint called by the Chrome/Firefox companion extension (and in-app extension tester).
   */
  app.post("/api/extension/extract", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as {
        text?: string;
        pageTitle?: string;
        pageUrl?: string;
        workspaceToken?: string;
        targetLanguage?: string;
        summaryPointCount?: number;
        timezone?: string;
      };

      const selectionText = typeof body.text === "string" ? body.text.trim() : "";
      if (!selectionText) {
        res.status(400).json({
          error: "Highlight text on a webpage before running One-Click Extract.",
        });
        return;
      }

      const pageTitle =
        typeof body.pageTitle === "string" ? body.pageTitle.trim() : "";
      const pageUrl =
        typeof body.pageUrl === "string" ? body.pageUrl.trim() : "";

      const contextualText = [
        pageTitle ? `Webpage Title: ${pageTitle}` : "",
        pageUrl ? `Source URL: ${pageUrl}` : "",
        "",
        selectionText,
      ]
        .filter((line, idx) => idx >= 2 || Boolean(line))
        .join("\n")
        .trim();

      const extraction = await runDocumentExtraction({
        rawTextInput: contextualText,
        candidateFiles: [],
        timezone:
          typeof body.timezone === "string" && body.timezone
            ? body.timezone
            : "UTC",
        countryName: "",
        referenceDateIso: new Date().toISOString(),
        summaryPointCount: Math.min(
          10,
          Math.max(1, Math.round(Number(body.summaryPointCount) || 3))
        ),
        evaluationBases: [
          "Promotional & Spam Check",
          "Urgency & Deadlines",
          "Action & Effort Required",
        ],
        focusHint: "Extracted from highlighted browser webpage selection",
        targetLanguage:
          typeof body.targetLanguage === "string" && body.targetLanguage.trim()
            ? body.targetLanguage.trim()
            : "Auto",
      });

      const icsEvents = collectIcsEventsFromExtraction(extraction);
      const icsContent =
        icsEvents.length > 0
          ? buildServerIcs(
              icsEvents,
              String(extraction.documentTitle || "Distill Extracted Events")
            )
          : "";

      const token = sanitizeWorkspaceToken(
        body.workspaceToken || req.headers["x-distill-token"]
      );
      let queuedToWorkspace = false;
      if (token) {
        queuedToWorkspace = enqueueWorkspaceExtraction(token, {
          id: `ext-clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          receivedAtIso: new Date().toISOString(),
          channel: "extension",
          sender: pageUrl || pageTitle || "Browser Extension Clip",
          subject: String(extraction.documentTitle || pageTitle || "Web Clip"),
          extraction,
        });
      }

      res.json({
        ok: true,
        queuedToWorkspace,
        extraction,
        icsContent,
      });
    } catch (error: unknown) {
      sendGenAiError(res, error, "Browser extension extraction failed.");
    }
  });

  /**
   * POST /api/webhooks/inbound-email
   * Direct Email Webhook ("Forward to Extract") compatible with SendGrid Inbound Parse,
   * Mailgun Routes, Postmark Inbound, and direct JSON/form payloads.
   */
  app.post(
    "/api/webhooks/inbound-email",
    optionalAnyMultipartUpload,
    async (req: Request, res: Response) => {
      try {
        const b = (req.body ?? {}) as Record<string, unknown>;
        const sender = String(
          b.from || b.sender || b.From || "forwarded-sender@example.com"
        ).trim();
        const recipient = String(
          b.to || b.recipient || b.To || ""
        ).trim();
        const subject = String(
          b.subject || b.Subject || "Forwarded Email"
        ).trim();
        const plainBody = String(
          b.text || b["body-plain"] || b.TextBody || b.rawEml || ""
        ).trim();
        const htmlBody = String(
          b.html || b["body-html"] || b.HtmlBody || ""
        ).trim();
        const targetLanguage =
          typeof b.targetLanguage === "string" && b.targetLanguage.trim()
            ? b.targetLanguage.trim()
            : typeof req.query.lang === "string" && req.query.lang.trim()
              ? req.query.lang.trim()
              : "Auto";

        const resolvedBody =
          plainBody || (htmlBody ? stripHtmlTagsSimple(htmlBody) : "");

        const candidateFiles: InlineFileItem[] = [];
        const uploadedFilesArr = Array.isArray(req.files)
          ? (req.files as Express.Multer.File[])
          : [];
        for (const f of uploadedFilesArr) {
          if (!f || !f.buffer) continue;
          candidateFiles.push({
            fileName: f.originalname || "attachment",
            mimeType: f.mimetype || "application/octet-stream",
            base64: f.buffer.toString("base64"),
          });
        }

        if (!resolvedBody && candidateFiles.length === 0) {
          res.status(400).json({
            error:
              "Inbound email webhook payload contained no readable body text or supported attachments.",
          });
          return;
        }

        const fullEmailText = [
          `From: ${sender}`,
          recipient ? `To: ${recipient}` : "",
          `Subject: ${subject}`,
          "",
          resolvedBody,
        ]
          .filter((line, idx) => idx >= 3 || Boolean(line))
          .join("\n")
          .trim();

        const extraction = await runDocumentExtraction({
          rawTextInput: fullEmailText,
          candidateFiles,
          timezone:
            typeof b.timezone === "string" && b.timezone ? b.timezone : "UTC",
          countryName: "",
          referenceDateIso: new Date().toISOString(),
          summaryPointCount: Math.min(
            10,
            Math.max(1, Math.round(Number(b.summaryPointCount) || 3))
          ),
          evaluationBases: [
            "Promotional & Spam Check",
            "Urgency & Deadlines",
            "Action & Effort Required",
            "Tone & Sentiment",
          ],
          focusHint: "Forwarded to Distill inbound email webhook",
          targetLanguage,
        });

        const icsEvents = collectIcsEventsFromExtraction(extraction);
        const docTitle = String(extraction.documentTitle || subject);
        const icsContent =
          icsEvents.length > 0 ? buildServerIcs(icsEvents, docTitle) : "";

        const evalInfo =
          (extraction.mailEvaluation as Record<string, unknown> | undefined) ??
          {};
        const bullets = Array.isArray(extraction.summaryBullets)
          ? (extraction.summaryBullets as Array<{ lead?: string; detail?: string }>)
          : [];
        const actions = Array.isArray(extraction.actionItems)
          ? (extraction.actionItems as Array<{
              title?: string;
              owner?: string;
              dueDateText?: string;
              priority?: string;
            }>)
          : [];

        const replyLines: string[] = [
          `Distill Automated Summary — ${docTitle}`,
          `Urgency: ${String(evalInfo.urgencyLevel || "Action Required")} · Tone: ${String(
            evalInfo.detectedTone || "Formal"
          )} · Classification: ${String(
            evalInfo.classification || "Action Required"
          )}`,
          "",
          "Key Takeaways:",
          ...bullets.map(
            (pt, i) =>
              `${i + 1}. ${String(pt.lead || "Point").replace(/:$/, "")}: ${String(
                pt.detail || ""
              )}`
          ),
          "",
          "Action Items:",
          ...(actions.length > 0
            ? actions.map(
                (t) =>
                  `- [${String(t.priority || "Medium")}] ${String(
                    t.title || ""
                  )} (Due: ${String(t.dueDateText || "No fixed deadline")})`
              )
            : ["- No mandatory action items detected."]),
        ];

        if (icsEvents.length > 0) {
          replyLines.push(
            "",
            `Attached: distill-invite.ics (${icsEvents.length} calendar ${
              icsEvents.length === 1 ? "item" : "items"
            })`
          );
        }

        const token = resolveWorkspaceToken(
          req.query.token || b.token || req.headers["x-distill-token"],
          recipient
        );

        const inboundId = `inbound-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 6)}`;

        const queued = token
          ? enqueueWorkspaceExtraction(token, {
              id: inboundId,
              receivedAtIso: new Date().toISOString(),
              channel: "webhook",
              sender,
              subject,
              extraction,
            })
          : false;

        res.json({
          ok: true,
          inboundId,
          queuedForToken: queued ? token : null,
          receivedFrom: sender,
          subject,
          extraction,
          autoReply: {
            to: sender,
            subject: `Re: [Distill Summary] ${subject}`,
            textBody: replyLines.join("\n"),
            icsAttachment: icsContent
              ? {
                  filename: "distill-invite.ics",
                  contentType: "text/calendar; charset=utf-8; method=PUBLISH",
                  contentBase64: Buffer.from(icsContent, "utf-8").toString(
                    "base64"
                  ),
                  rawIcs: icsContent,
                }
              : null,
          },
        });
      } catch (error: unknown) {
        sendGenAiError(res, error, "Failed to process inbound email webhook.");
      }
    }
  );

  /**
   * GET /api/webhooks/inbox?token=...
   * Polls queued extractions forwarded via Direct Email Webhook or Companion Browser Extension.
   */
  app.get("/api/webhooks/inbox", (req: Request, res: Response) => {
    const token = sanitizeWorkspaceToken(
      req.query.token || req.headers["x-distill-token"]
    );
    if (!token) {
      res.json({ ok: true, token: "", count: 0, items: [] });
      return;
    }
    const items = webhookInboxByToken.get(token) ?? [];
    res.json({ ok: true, token, count: items.length, items });
  });

  /**
   * POST /api/webhooks/inbox/ack
   * Acknowledges and removes synced webhook/extension extractions from the server queue.
   */
  app.post("/api/webhooks/inbox/ack", (req: Request, res: Response) => {
    const token = sanitizeWorkspaceToken(
      req.body?.token || req.query.token || req.headers["x-distill-token"]
    );
    const ids = Array.isArray(req.body?.ids)
      ? (req.body.ids as unknown[]).map((x) => String(x))
      : [];
    if (!token) {
      res.json({ ok: true, remaining: 0 });
      return;
    }
    const existing = webhookInboxByToken.get(token) ?? [];
    const idSet = new Set(ids);
    const remaining =
      ids.length === 0
        ? []
        : existing.filter((item) => !idSet.has(item.id));
    if (remaining.length === 0) {
      webhookInboxByToken.delete(token);
    } else {
      webhookInboxByToken.set(token, remaining);
    }
    res.json({ ok: true, remaining: remaining.length });
  });

  /**
   * POST /api/draft-email
   * Generates or polishes an email draft in the user's chosen format style.
   */
  app.post("/api/draft-email", async (req: Request, res: Response) => {
    try {
      const body = (req.body ?? {}) as DraftEmailPayload;
      const intentOrNotes =
        typeof body.intentOrNotes === "string" ? body.intentOrNotes.trim() : "";
      const to = typeof body.to === "string" ? body.to.trim() : "";
      const subjectHint =
        typeof body.subjectHint === "string" ? body.subjectHint.trim() : "";
      const formatStyle =
        typeof body.formatStyle === "string" && body.formatStyle.trim()
          ? body.formatStyle.trim()
          : "Formal";
      const replyContext =
        typeof body.replyContext === "string" ? body.replyContext.trim() : "";
      const senderName =
        typeof body.senderName === "string" ? body.senderName.trim() : "";

      if (!intentOrNotes && !replyContext) {
        res.status(400).json({
          error:
            "Enter key points or instructions for the email you want to draft.",
        });
        return;
      }

      const ai = getGenAIClient();

      const systemInstruction = [
        "You are an expert business and professional email writer.",
        `Write a clean, natural, ready-to-send email following the '${formatStyle}' format style.`,
        "Guidelines:",
        "- Keep the tone authentic, clear, and well-structured with zero filler clichés.",
        "- If a recipient or sender name is not provided, use clean bracketed placeholders like [Recipient Name] or [Your Name].",
        "- Return JSON with `subject` (without a leading 'Subject:' prefix) and `body`.",
      ].join("\n");

      const promptParts = [
        `Requested Format Style: ${formatStyle}`,
        to ? `Recipient: ${to}` : "",
        senderName ? `Sender Sign-Off Name: ${senderName}` : "",
        subjectHint ? `Current / Suggested Subject: ${subjectHint}` : "",
        intentOrNotes ? `Points / Instructions to Cover:\n${intentOrNotes}` : "",
        replyContext
          ? `Context of Email Being Replied To:\n${replyContext}`
          : "",
      ]
        .filter(Boolean)
        .join("\n\n");

      const response = await callWithRetry(() =>
        ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: promptParts,
          config: {
            systemInstruction,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                subject: {
                  type: Type.STRING,
                  description: "Clear, well-crafted email subject line.",
                },
                body: {
                  type: Type.STRING,
                  description:
                    "Complete formatted email body including greeting and sign-off.",
                },
              },
              required: ["subject", "body"],
            },
          },
        })
      );

      const jsonText = (response.text ?? "").trim();
      if (!jsonText) {
        res.status(502).json({
          error: "Received an empty draft response. Please try again.",
        });
        return;
      }

      res.json(JSON.parse(jsonText));
    } catch (error: unknown) {
      sendGenAiError(res, error, "Failed to generate email draft.");
    }
  });

  /**
   * POST /api/ics
   * Generates a downloadable RFC 5545 .ics calendar file from event JSON.
   */
  app.post("/api/ics", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as {
      events?: ServerCalendarEventInput[];
      event?: ServerCalendarEventInput;
      calendarName?: string;
      filename?: string;
    };

    const events = Array.isArray(body.events)
      ? body.events
      : body.event
        ? [body.event]
        : [];

    if (events.length === 0) {
      res.status(400).json({
        error: "Provide at least one event in `events` or `event`.",
      });
      return;
    }

    const calendarName =
      body.calendarName || events[0]?.title || "Distill Calendar Invite";
    const safeFilename =
      (body.filename || calendarName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "invite";

    const icsText = buildServerIcs(events, calendarName);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFilename}.ics"`
    );
    res.send(icsText);
  });

  const distPath = path.join(__dirname, "dist");
  const isProd =
    process.env.NODE_ENV === "production" ||
    (!process.env.NODE_ENV && fs.existsSync(path.join(distPath, "index.html")));

  if (!isProd) {
    const vitePromise = import("vite").then(({ createServer }) =>
      createServer({
        server: { middlewareMode: true },
        appType: "spa",
      })
    );

    vitePromise.catch((err) => {
      console.error("Vite middleware initialization error:", err);
    });

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const vite = await vitePromise;
        vite.middlewares(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Distill server running on http://0.0.0.0:${PORT}`);
  });

  server.on("error", (err) => {
    console.error(`Server failed to bind port ${PORT}:`, err);
    process.exit(1);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
