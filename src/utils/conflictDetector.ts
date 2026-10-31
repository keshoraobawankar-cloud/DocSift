import { ActionItem, CalendarEventItem, ExtractionRecord } from "../types";
import { wallClockIsoToUtcDate } from "./icsGenerator";

export interface ScheduleConflictMatch {
  targetRecordId: string;
  targetDocumentTitle: string;
  targetItemId: string;
  targetTitle: string;
  targetKind: "event" | "task";
  timeLabel: string;
  isExactTimeOverlap: boolean;
  message: string;
}

interface NormalizedScheduleSlot {
  uid: string;
  recordId: string;
  documentTitle: string;
  itemId: string;
  title: string;
  kind: "event" | "task";
  hasClockTime: boolean;
  ymd: string;
  startMs: number;
  endMs: number;
  timeLabel: string;
}

function formatClockLabelFromIso(iso: string): string {
  const cleaned = (iso || "").trim().replace(/Z$/i, "");
  const m = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/
  );
  if (!m) return iso;
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthLabel = months[Number(m[2]) - 1] || m[2];
  const dayNum = Number(m[3]);
  if (!m[4] || !m[5]) {
    return `${monthLabel} ${dayNum}`;
  }
  const hour24 = Number(m[4]);
  const minute = m[5];
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${minute} ${suffix}`;
}

function eventToSlot(
  recordId: string,
  documentTitle: string,
  ev: CalendarEventItem,
  timezone: string
): NormalizedScheduleSlot | null {
  const rawStart = (ev.startIso || "").trim();
  const ymdMatch = rawStart.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!ymdMatch) return null;

  const ymd = ymdMatch[1];
  const hasClock = !ev.isAllDay && /[T\s]\d{2}:\d{2}/.test(rawStart);

  if (!hasClock) {
    const dayUtc = wallClockIsoToUtcDate(`${ymd}T09:00:00`, timezone);
    const ms = dayUtc ? dayUtc.getTime() : Date.parse(`${ymd}T09:00:00Z`);
    if (Number.isNaN(ms)) return null;
    return {
      uid: `${recordId}::ev::${ev.id}`,
      recordId,
      documentTitle,
      itemId: ev.id,
      title: ev.title || "Scheduled Event",
      kind: "event",
      hasClockTime: false,
      ymd,
      startMs: ms,
      endMs: ms + 60 * 60_000,
      timeLabel: formatClockLabelFromIso(ymd),
    };
  }

  const startDate = wallClockIsoToUtcDate(rawStart, timezone);
  if (!startDate) return null;
  const endDate = ev.endIso ? wallClockIsoToUtcDate(ev.endIso, timezone) : null;
  const startMs = startDate.getTime();
  const endMs =
    endDate && endDate.getTime() > startMs
      ? endDate.getTime()
      : startMs + 45 * 60_000;

  return {
    uid: `${recordId}::ev::${ev.id}`,
    recordId,
    documentTitle,
    itemId: ev.id,
    title: ev.title || "Scheduled Event",
    kind: "event",
    hasClockTime: true,
    ymd,
    startMs,
    endMs,
    timeLabel: formatClockLabelFromIso(rawStart),
  };
}

function taskToSlot(
  recordId: string,
  documentTitle: string,
  task: ActionItem,
  timezone: string
): NormalizedScheduleSlot | null {
  if (task.completed || task.status === "done") return null;
  const rawDue = (task.dueDateIso || "").trim();
  const ymdMatch = rawDue.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!ymdMatch) return null;

  const ymd = ymdMatch[1];
  const hasClock = /[T\s]\d{2}:\d{2}/.test(rawDue);

  if (!hasClock) {
    const dayUtc = wallClockIsoToUtcDate(`${ymd}T17:00:00`, timezone);
    const ms = dayUtc ? dayUtc.getTime() : Date.parse(`${ymd}T17:00:00Z`);
    if (Number.isNaN(ms)) return null;
    return {
      uid: `${recordId}::task::${task.id}`,
      recordId,
      documentTitle,
      itemId: task.id,
      title: task.title || "Task Deadline",
      kind: "task",
      hasClockTime: false,
      ymd,
      startMs: ms,
      endMs: ms + 30 * 60_000,
      timeLabel: formatClockLabelFromIso(ymd),
    };
  }

  const dueDate = wallClockIsoToUtcDate(rawDue, timezone);
  if (!dueDate) return null;
  const dueMs = dueDate.getTime();

  return {
    uid: `${recordId}::task::${task.id}`,
    recordId,
    documentTitle,
    itemId: task.id,
    title: task.title || "Task Deadline",
    kind: "task",
    hasClockTime: true,
    ymd,
    startMs: dueMs - 15 * 60_000,
    endMs: dueMs + 30 * 60_000,
    timeLabel: formatClockLabelFromIso(rawDue),
  };
}

function collectAllSlots(
  records: ExtractionRecord[],
  timezone: string
): NormalizedScheduleSlot[] {
  const slots: NormalizedScheduleSlot[] = [];
  for (const rec of records) {
    for (const ev of rec.calendarEvents) {
      const s = eventToSlot(rec.id, rec.documentTitle, ev, timezone);
      if (s) slots.push(s);
    }
    for (const task of rec.actionItems) {
      const s = taskToSlot(rec.id, rec.documentTitle, task, timezone);
      if (s) slots.push(s);
    }
  }
  return slots;
}

function matchConflictsAgainstPool(
  probe: NormalizedScheduleSlot,
  pool: NormalizedScheduleSlot[]
): ScheduleConflictMatch[] {
  const matches: ScheduleConflictMatch[] = [];

  for (const candidate of pool) {
    if (candidate.uid === probe.uid) continue;

    // Avoid noisy self-match between a task and an identically-timed calendar event inside the same document
    if (
      candidate.recordId === probe.recordId &&
      candidate.kind !== probe.kind &&
      candidate.ymd === probe.ymd
    ) {
      continue;
    }

    if (probe.hasClockTime && candidate.hasClockTime) {
      if (probe.startMs < candidate.endMs && candidate.startMs < probe.endMs) {
        const subjectNoun =
          probe.kind === "task" ? "This deadline" : "This event";
        const otherNoun =
          candidate.kind === "task" ? "another task" : "an event";
        matches.push({
          targetRecordId: candidate.recordId,
          targetDocumentTitle: candidate.documentTitle,
          targetItemId: candidate.itemId,
          targetTitle: candidate.title,
          targetKind: candidate.kind,
          timeLabel: candidate.timeLabel,
          isExactTimeOverlap: true,
          message: `Note: ${subjectNoun} overlaps with ${otherNoun} "${candidate.title}" set for ${candidate.timeLabel} (${candidate.documentTitle}).`,
        });
      }
    } else if (
      !probe.hasClockTime &&
      !candidate.hasClockTime &&
      probe.recordId !== candidate.recordId &&
      probe.ymd === candidate.ymd
    ) {
      const subjectNoun =
        probe.kind === "task" ? "This deadline" : "This all-day event";
      matches.push({
        targetRecordId: candidate.recordId,
        targetDocumentTitle: candidate.documentTitle,
        targetItemId: candidate.itemId,
        targetTitle: candidate.title,
        targetKind: candidate.kind,
        timeLabel: candidate.timeLabel,
        isExactTimeOverlap: false,
        message: `Note: ${subjectNoun} falls on the same date (${candidate.timeLabel}) as "${candidate.title}" (${candidate.documentTitle}).`,
      });
    }
  }

  return matches.sort(
    (a, b) => Number(b.isExactTimeOverlap) - Number(a.isExactTimeOverlap)
  );
}

export function buildWorkspaceConflictLookup(
  records: ExtractionRecord[],
  timezone: string
): {
  byTaskUid: Map<string, ScheduleConflictMatch[]>;
  byEventUid: Map<string, ScheduleConflictMatch[]>;
} {
  const pool = collectAllSlots(records, timezone);
  const byTaskUid = new Map<string, ScheduleConflictMatch[]>();
  const byEventUid = new Map<string, ScheduleConflictMatch[]>();

  for (const slot of pool) {
    const found = matchConflictsAgainstPool(slot, pool);
    if (found.length === 0) continue;
    if (slot.kind === "task") {
      byTaskUid.set(`${slot.recordId}::${slot.itemId}`, found);
    } else {
      byEventUid.set(`${slot.recordId}::${slot.itemId}`, found);
    }
  }

  return { byTaskUid, byEventUid };
}
