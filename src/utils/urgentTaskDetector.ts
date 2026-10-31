import { ActionItem, ExtractionRecord } from "../types";
import { wallClockIsoToUtcDate } from "./icsGenerator";

export const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface UrgentDueTaskMatch {
  recordId: string;
  documentTitle: string;
  task: ActionItem;
  dueLabel: string;
  sortDueMs: number;
}

function formatRemainingDuration(remainingMs: number): string {
  const clamped = Math.max(0, remainingMs);
  const totalMinutes = Math.round(clamped / 60_000);
  if (totalMinutes <= 1) {
    return "due now";
  }
  if (totalMinutes < 60) {
    return `due in ${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `due in ${hours}h`;
  }
  return `due in ${hours}h ${mins}m`;
}

/**
 * Evaluates whether a single task due-date string (ISO or natural text) falls
 * within the upcoming 24-hour window [nowMs, nowMs + 24h].
 */
function checkCandidateDateWithin24h(
  rawCandidate: string,
  timeZone: string,
  nowMs: number
): { dueLabel: string; sortDueMs: number } | null {
  const trimmed = (rawCandidate || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "no fixed deadline") {
    return null;
  }

  // 1. Explicit ISO timestamp with Z or numeric timezone offset (+HH:MM / -HH:MM)
  if (
    /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(
      trimmed
    )
  ) {
    const parsedMs = Date.parse(trimmed.replace(" ", "T"));
    if (
      Number.isFinite(parsedMs) &&
      parsedMs >= nowMs &&
      parsedMs <= nowMs + TWENTY_FOUR_HOURS_MS
    ) {
      return {
        dueLabel: formatRemainingDuration(parsedMs - nowMs),
        sortDueMs: parsedMs,
      };
    }
    return null;
  }

  // 2. Local wall-clock ISO timestamp without offset: YYYY-MM-DDTHH:mm(:ss)
  const wallClockDateTimeMatch = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}:\d{2}(?::\d{2})?)$/
  );
  if (wallClockDateTimeMatch) {
    const normalizedIso = `${wallClockDateTimeMatch[1]}T${wallClockDateTimeMatch[2]}`;
    const dt = wallClockIsoToUtcDate(normalizedIso, timeZone);
    if (dt) {
      const dueMs = dt.getTime();
      if (dueMs >= nowMs && dueMs <= nowMs + TWENTY_FOUR_HOURS_MS) {
        return {
          dueLabel: formatRemainingDuration(dueMs - nowMs),
          sortDueMs: dueMs,
        };
      }
    }
    return null;
  }

  // 3. Date-only ISO string: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const dayStart = wallClockIsoToUtcDate(`${trimmed}T00:00:00`, timeZone);
    const dayEnd = wallClockIsoToUtcDate(`${trimmed}T23:59:59`, timeZone);
    if (dayStart && dayEnd) {
      const startMs = dayStart.getTime();
      const endMs = dayEnd.getTime();
      if (endMs >= nowMs && startMs <= nowMs + TWENTY_FOUR_HOURS_MS) {
        const isToday = startMs <= nowMs && nowMs <= endMs;
        return {
          dueLabel: isToday ? "due today" : "due within 24h",
          sortDueMs: isToday ? endMs : Math.min(endMs, nowMs + TWENTY_FOUR_HOURS_MS),
        };
      }
    }
    return null;
  }

  // 4. Relative text phrases when dueDateIso was omitted
  const inHoursMatch = trimmed.match(/\bin\s+(\d{1,2})\s*h(?:ours?|rs?)\b/i);
  if (inHoursMatch) {
    const hrs = Number(inHoursMatch[1]);
    if (hrs >= 0 && hrs <= 24) {
      const targetMs = nowMs + hrs * 3_600_000;
      return {
        dueLabel: hrs === 0 ? "due now" : `due in ${hrs}h`,
        sortDueMs: targetMs,
      };
    }
  }

  if (/\b(due\s+today|today|tonight|within\s+24\s*h(?:ours?)?|eod\s+today)\b/i.test(trimmed)) {
    return {
      dueLabel: "due today",
      sortDueMs: nowMs + 6 * 3_600_000,
    };
  }

  // 5. Fallback standard Date.parse on explicit calendar strings (e.g. "Oct 31, 2026 2:00 PM")
  if (/\d{4}/.test(trimmed)) {
    const parsedMs = Date.parse(trimmed);
    if (
      Number.isFinite(parsedMs) &&
      parsedMs >= nowMs &&
      parsedMs <= nowMs + TWENTY_FOUR_HOURS_MS
    ) {
      return {
        dueLabel: formatRemainingDuration(parsedMs - nowMs),
        sortDueMs: parsedMs,
      };
    }
  }

  return null;
}

/**
 * Scans all extraction records for incomplete tasks marked with 'High' priority
 * whose due date falls within 24 hours from `nowMs`.
 */
export function findHighPriorityTasksDueWithin24h(
  records: ExtractionRecord[],
  fallbackTimezone = "UTC",
  nowMs: number = Date.now()
): UrgentDueTaskMatch[] {
  const matches: UrgentDueTaskMatch[] = [];

  for (const record of records) {
    const tz = record.timezone || fallbackTimezone || "UTC";
    for (const task of record.actionItems) {
      if (task.completed || task.priority !== "High") {
        continue;
      }

      const isoHit = task.dueDateIso
        ? checkCandidateDateWithin24h(task.dueDateIso, tz, nowMs)
        : null;
      const hit =
        isoHit ??
        (task.dueDateText
          ? checkCandidateDateWithin24h(task.dueDateText, tz, nowMs)
          : null);

      if (hit) {
        matches.push({
          recordId: record.id,
          documentTitle: record.documentTitle,
          task,
          dueLabel: hit.dueLabel,
          sortDueMs: hit.sortDueMs,
        });
      }
    }
  }

  matches.sort((a, b) => a.sortDueMs - b.sortDueMs);
  return matches;
}
