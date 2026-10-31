import {
  ActionItem,
  CalendarEventItem,
  ExtractionRecord,
  getTaskKanbanStatus,
} from "../types";
import {
  actionItemToCalendarEvent,
  formatEventDateRange,
  generateIcsContent,
  slugifyFilename,
  triggerIcsDownload,
} from "./icsGenerator";

export async function copyTextToClipboard(text: string): Promise<void> {
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

function triggerBlobDownload(
  content: string,
  mimeType: string,
  filename: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatKanbanLabel(task: ActionItem): string {
  const st = getTaskKanbanStatus(task);
  if (st === "done") return "Done";
  if (st === "in_progress") return "In Progress";
  return "To Do";
}

/**
 * Standard clean Markdown (.md) export including tweaked summary, evaluation, tone/urgency, language, tasks, events, and workspace notes.
 */
export function buildRecordMarkdown(record: ExtractionRecord): string {
  const lines: string[] = [`# ${record.documentTitle}`, ""];

  const metaParts = [
    record.documentType || "Document",
    record.senderOrSource ? `Source: ${record.senderOrSource}` : "",
    record.countryName ? `Country: ${record.countryName}` : "",
    record.detectedLanguage ? `Detected Language: ${record.detectedLanguage}` : "",
    record.outputLanguage && record.outputLanguage !== record.detectedLanguage
      ? `Translated To: ${record.outputLanguage}`
      : "",
  ].filter(Boolean);

  if (metaParts.length > 0) {
    lines.push(`_${metaParts.join(" · ")}_`, "");
  }

  if (record.mailEvaluation) {
    const ev = record.mailEvaluation;
    lines.push("## Mail Evaluation");
    lines.push(`- **Classification:** ${ev.classification}`);
    if (ev.urgencyLevel) {
      lines.push(`- **Urgency:** ${ev.urgencyLevel}`);
    }
    if (ev.detectedTone) {
      lines.push(`- **Tone:** ${ev.detectedTone}`);
    }
    lines.push(
      `- **Disposition:** ${ev.recommendedDisposition}`,
      `- **Action Required:** ${ev.requiresUserAction ? "Yes" : "No"}`,
      `- **Rationale:** ${ev.evaluationRationale}`
    );
    if (ev.criteriaBreakdown && ev.criteriaBreakdown.length > 0) {
      lines.push("", "### Selected Evaluation Criteria");
      for (const item of ev.criteriaBreakdown) {
        lines.push(`- **${item.criterion}** (${item.rating}): ${item.finding}`);
      }
    }
    lines.push("");
  }

  lines.push(
    `## Key Summary (${record.summaryBullets.length} ${
      record.summaryBullets.length === 1 ? "Point" : "Points"
    })`
  );
  record.summaryBullets.forEach((b, i) => {
    lines.push(`${i + 1}. **${b.lead.replace(/:$/, "")}:** ${b.detail}`);
  });
  lines.push("");

  lines.push("## Action Items");
  if (record.actionItems.length === 0) {
    lines.push("- No action items detected.");
  } else {
    for (const t of record.actionItems) {
      lines.push(
        `- [${t.completed ? "x" : " "}] **${t.title}** — Stage: ${formatKanbanLabel(
          t
        )} · Owner: ${t.owner || "You"} · Due: ${
          t.dueDateText || "No fixed deadline"
        } · Priority: ${t.priority}`
      );
    }
  }
  lines.push("");

  lines.push("## Calendar Events");
  if (record.calendarEvents.length === 0) {
    lines.push("- No scheduled calendar events detected.");
  } else {
    for (const ev of record.calendarEvents) {
      lines.push(
        `- **${ev.title}** (${ev.eventType}) — ${formatEventDateRange(ev)}${
          ev.location ? ` · Location: ${ev.location}` : ""
        }`
      );
    }
  }

  if (record.workspaceNotes && record.workspaceNotes.trim()) {
    lines.push("", "## Workspace Notes", record.workspaceNotes.trim());
  }

  lines.push("");
  return lines.join("\n");
}

export function downloadMarkdownFile(record: ExtractionRecord): void {
  const md = buildRecordMarkdown(record);
  const name = `${slugifyFilename(record.documentTitle)}.md`;
  triggerBlobDownload(md, "text/markdown;charset=utf-8", name);
}

/**
 * Single-record structured JSON (.json) export.
 */
export function downloadRecordJsonFile(record: ExtractionRecord): void {
  const exportObj = {
    app: "Distill",
    exportedAtIso: new Date().toISOString(),
    record: {
      ...record,
      attachments: (record.attachments || []).map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        origin: a.origin,
        contextNote: a.contextNote,
      })),
    },
  };
  const json = JSON.stringify(exportObj, null, 2);
  const name = `${slugifyFilename(record.documentTitle)}.json`;
  triggerBlobDownload(json, "application/json;charset=utf-8", name);
}

/**
 * Notion-optimized block Markdown (uses Notion callout blockquotes, native to-do blocks, and clean dividers).
 */
export function buildNotionBlocksMarkdown(record: ExtractionRecord): string {
  const lines: string[] = [`# ${record.documentTitle}`, ""];

  if (record.mailEvaluation) {
    const ev = record.mailEvaluation;
    const toneMeta = [
      ev.urgencyLevel ? `Urgency: ${ev.urgencyLevel}` : "",
      ev.detectedTone ? `Tone: ${ev.detectedTone}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(
      `> **${ev.classification}**${toneMeta ? ` (${toneMeta})` : ""} — ${
        ev.recommendedDisposition
      }`,
      `> ${ev.evaluationRationale}`,
      ""
    );
  }

  lines.push("---", "", "### Key Takeaways");
  for (const b of record.summaryBullets) {
    lines.push(`- **${b.lead.replace(/:$/, "")}:** ${b.detail}`);
  }
  lines.push("", "### Action Checklist");

  if (record.actionItems.length === 0) {
    lines.push("- [ ] No mandatory tasks required");
  } else {
    for (const t of record.actionItems) {
      const dueTag =
        t.dueDateText && t.dueDateText !== "No fixed deadline"
          ? ` *(Due: ${t.dueDateText})*`
          : "";
      lines.push(
        `- [${t.completed ? "x" : " "}] ${t.title} — \`${
          t.priority
        }\` · \`${formatKanbanLabel(t)}\` · @${t.owner || "You"}${dueTag}`
      );
    }
  }

  if (record.calendarEvents.length > 0) {
    lines.push("", "### Schedule & Deadlines");
    for (const ev of record.calendarEvents) {
      lines.push(
        `- **${ev.title}** · \`${formatEventDateRange(ev)}\`${
          ev.location ? ` · ${ev.location}` : ""
        }`
      );
    }
  }

  if (record.workspaceNotes && record.workspaceNotes.trim()) {
    lines.push("", "### Notes", record.workspaceNotes.trim());
  }

  return lines.join("\n");
}

export async function copyNotionBlocks(record: ExtractionRecord): Promise<void> {
  await copyTextToClipboard(buildNotionBlocksMarkdown(record));
}

export function downloadNotionMarkdown(record: ExtractionRecord): void {
  const content = buildNotionBlocksMarkdown(record);
  const name = `${slugifyFilename(record.documentTitle)}-notion.md`;
  triggerBlobDownload(content, "text/markdown;charset=utf-8", name);
}

function escapeCsvCell(val: string): string {
  const clean = (val || "").replace(/\r?\n/g, " ").trim();
  if (clean.includes(",") || clean.includes('"')) {
    return `"${clean.replace(/"/g, '""')}"`;
  }
  return clean;
}

function mapTodoistPriority(priority: ActionItem["priority"]): string {
  // In Todoist CSV import templates: 4 = Priority 1 (Urgent/Red), 3 = P2, 2 = P3, 1 = P4 (Low)
  if (priority === "High") return "4";
  if (priority === "Medium") return "3";
  return "1";
}

/**
 * Official Todoist CSV Project Import format (TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG)
 */
export function buildTodoistCsv(record: ExtractionRecord): string {
  const header =
    "TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG";
  const rows: string[] = [header];

  rows.push(
    [
      "section",
      escapeCsvCell(record.documentTitle),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ].join(",")
  );

  for (const item of record.actionItems) {
    if (item.completed) continue;
    const dueValue =
      item.dueDateIso ||
      (item.dueDateText && item.dueDateText !== "No fixed deadline"
        ? item.dueDateText
        : "");
    const descParts = [
      item.owner ? `Owner: ${item.owner}` : "",
      item.sourceSnippet ? `Source: "${item.sourceSnippet}"` : "",
    ].filter(Boolean);

    rows.push(
      [
        "task",
        escapeCsvCell(item.title),
        escapeCsvCell(descParts.join(" | ")),
        mapTodoistPriority(item.priority),
        "1",
        "",
        "",
        escapeCsvCell(dueValue),
        "en",
      ].join(",")
    );
  }

  return rows.join("\r\n") + "\r\n";
}

export function downloadTodoistCsv(record: ExtractionRecord): void {
  const csv = buildTodoistCsv(record);
  const name = `${slugifyFilename(record.documentTitle)}-todoist.csv`;
  triggerBlobDownload(csv, "text/csv;charset=utf-8", name);
}

export async function copyTodoistQuickAdd(
  record: ExtractionRecord
): Promise<void> {
  const lines = record.actionItems
    .filter((t) => !t.completed)
    .map((t) => {
      const pFlag =
        t.priority === "High" ? "p1" : t.priority === "Medium" ? "p2" : "p4";
      const due =
        t.dueDateIso ||
        (t.dueDateText && t.dueDateText !== "No fixed deadline"
          ? t.dueDateText
          : "");
      return `${t.title}${due ? ` ${due}` : ""} ${pFlag}`;
    });

  await copyTextToClipboard(
    lines.length > 0 ? lines.join("\n") : record.documentTitle
  );
}

/**
 * Multi-Document Batch Consolidated Report (.md) & Bundled .ics Package Exporters
 */
export function buildBatchConsolidatedMarkdown(
  records: ExtractionRecord[]
): string {
  const dateStamp = new Date().toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const totalTasks = records.reduce((s, r) => s + r.actionItems.length, 0);
  const totalEvents = records.reduce((s, r) => s + r.calendarEvents.length, 0);
  const urgentCount = records.filter(
    (r) => r.mailEvaluation?.urgencyLevel === "Urgent"
  ).length;

  const lines: string[] = [
    "# Distill Consolidated Batch Extraction Report",
    "",
    `_Generated: ${dateStamp} · Documents: ${records.length} · Action Items: ${totalTasks} · Calendar Events: ${totalEvents}${
      urgentCount > 0 ? ` · Urgent Items: ${urgentCount}` : ""
    }_`,
    "",
    "## Executive Rollup",
    "",
  ];

  records.forEach((rec, idx) => {
    const urgency = rec.mailEvaluation?.urgencyLevel || "Action Required";
    const tone = rec.mailEvaluation?.detectedTone || "Neutral";
    lines.push(
      `${idx + 1}. **${rec.documentTitle}** — ${urgency} · Tone: ${tone} · ${
        rec.actionItems.length
      } tasks · ${rec.calendarEvents.length} events`
    );
  });

  lines.push("", "---", "");

  records.forEach((rec) => {
    lines.push(buildRecordMarkdown(rec), "---", "");
  });

  return lines.join("\n");
}

export function downloadBatchConsolidatedMarkdown(
  records: ExtractionRecord[],
  filenamePrefix = "distill-consolidated-report"
): void {
  if (records.length === 0) return;
  const md = buildBatchConsolidatedMarkdown(records);
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(
    md,
    "text/markdown;charset=utf-8",
    `${filenamePrefix}-${dateStamp}.md`
  );
}

export function downloadBatchConsolidatedJson(
  records: ExtractionRecord[],
  filenamePrefix = "distill-consolidated-batch"
): void {
  if (records.length === 0) return;
  const payload = {
    app: "Distill",
    reportType: "batch-consolidated-report",
    exportedAtIso: new Date().toISOString(),
    documentCount: records.length,
    totalActionItems: records.reduce((s, r) => s + r.actionItems.length, 0),
    totalCalendarEvents: records.reduce((s, r) => s + r.calendarEvents.length, 0),
    records: records.map((rec) => ({
      ...rec,
      attachments: (rec.attachments || []).map((a) => ({
        id: a.id,
        fileName: a.fileName,
        mimeType: a.mimeType,
        sizeBytes: a.sizeBytes,
        origin: a.origin,
        contextNote: a.contextNote,
      })),
    })),
  };
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerBlobDownload(
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8",
    `${filenamePrefix}-${dateStamp}.json`
  );
}

export function downloadBatchBundledIcs(
  records: ExtractionRecord[],
  timezone: string,
  filenamePrefix = "distill-bundled-schedule"
): number {
  const combinedEvents: CalendarEventItem[] = [];

  for (const rec of records) {
    for (const ev of rec.calendarEvents) {
      combinedEvents.push(ev);
    }
    for (const task of rec.actionItems) {
      if (!task.completed && task.dueDateIso) {
        combinedEvents.push(actionItemToCalendarEvent(task, rec.documentTitle));
      }
    }
  }

  if (combinedEvents.length === 0) return 0;

  const ics = generateIcsContent(
    combinedEvents,
    timezone,
    `Distill Batch Schedule (${records.length} Docs)`
  );
  const dateStamp = new Date().toISOString().slice(0, 10);
  triggerIcsDownload(ics, `${filenamePrefix}-${dateStamp}`);
  return combinedEvents.length;
}
