import { ActionItem, CalendarEventItem } from "../types";

function escapeIcsText(value: string): string {
  return (value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Folds lines longer than 73 ASCII characters per RFC 5545 Section 3.1.
 */
function foldIcsLine(line: string): string {
  if (line.length <= 73) return line;
  const chunks: string[] = [];
  let remaining = line;
  let first = true;
  while (remaining.length > 0) {
    const limit = first ? 73 : 72;
    chunks.push((first ? "" : " ") + remaining.slice(0, limit));
    remaining = remaining.slice(limit);
    first = false;
  }
  return chunks.join("\r\n");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatUtcDateToIcs(date: Date): string {
  return (
    `${date.getUTCFullYear()}` +
    `${pad2(date.getUTCMonth() + 1)}` +
    `${pad2(date.getUTCDate())}T` +
    `${pad2(date.getUTCHours())}` +
    `${pad2(date.getUTCMinutes())}` +
    `${pad2(date.getUTCSeconds())}Z`
  );
}

function parseWallClockParts(iso: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} | null {
  const cleaned = (iso || "").trim().replace(/Z$/i, "");
  const match = cleaned.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: match[4] ? Number(match[4]) : 9,
    minute: match[5] ? Number(match[5]) : 0,
    second: match[6] ? Number(match[6]) : 0,
  };
}

function getZonedParts(epochMs: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour === 24 ? 0 : map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/**
 * Converts a wall-clock ISO string (e.g. "2026-11-05T14:00:00") in a given IANA timezone
 * into an exact UTC Date object, handling Daylight Saving Time offsets cleanly.
 */
export function wallClockIsoToUtcDate(localIso: string, timeZone: string): Date | null {
  const target = parseWallClockParts(localIso);
  if (!target) return null;

  const targetAsUtcMs = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second
  );

  try {
    let guessMs = targetAsUtcMs;
    for (let pass = 0; pass < 2; pass += 1) {
      const observed = getZonedParts(guessMs, timeZone);
      const observedAsUtcMs = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second
      );
      const diffMs = targetAsUtcMs - observedAsUtcMs;
      guessMs += diffMs;
    }
    return new Date(guessMs);
  } catch {
    return new Date(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      target.second
    );
  }
}

function addDaysToYmd(year: number, month: number, day: number, daysToAdd: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day + daysToAdd));
  return `${dt.getUTCFullYear()}${pad2(dt.getUTCMonth() + 1)}${pad2(dt.getUTCDate())}`;
}

function resolveEventDatePair(
  event: CalendarEventItem,
  timeZone: string
): { isAllDay: boolean; startToken: string; endToken: string } {
  const startParts = parseWallClockParts(event.startIso);
  const endParts = parseWallClockParts(event.endIso);

  if (event.isAllDay && startParts) {
    const startYmd = `${startParts.year}${pad2(startParts.month)}${pad2(startParts.day)}`;
    let endYmd = addDaysToYmd(startParts.year, startParts.month, startParts.day, 1);

    if (endParts) {
      const candidateEndYmd = `${endParts.year}${pad2(endParts.month)}${pad2(endParts.day)}`;
      if (candidateEndYmd > startYmd) {
        endYmd = addDaysToYmd(endParts.year, endParts.month, endParts.day, 1);
      }
    }
    return { isAllDay: true, startToken: startYmd, endToken: endYmd };
  }

  const startUtc =
    wallClockIsoToUtcDate(event.startIso, timeZone) ?? new Date(Date.now() + 3600_000);
  let endUtc = wallClockIsoToUtcDate(event.endIso, timeZone);

  if (!endUtc || endUtc.getTime() <= startUtc.getTime()) {
    endUtc = new Date(startUtc.getTime() + 45 * 60_000);
  }

  return {
    isAllDay: false,
    startToken: formatUtcDateToIcs(startUtc),
    endToken: formatUtcDateToIcs(endUtc),
  };
}

function buildVEventLines(event: CalendarEventItem, timeZone: string): string[] {
  const dtStamp = formatUtcDateToIcs(new Date());
  const uid = `${event.id}-${Date.now()}@distill.calendar`;
  const lines: string[] = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${dtStamp}`];

  const { isAllDay, startToken, endToken } = resolveEventDatePair(event, timeZone);

  if (isAllDay) {
    lines.push(`DTSTART;VALUE=DATE:${startToken}`);
    lines.push(`DTEND;VALUE=DATE:${endToken}`);
  } else {
    lines.push(`DTSTART:${startToken}`);
    lines.push(`DTEND:${endToken}`);
  }

  lines.push(`SUMMARY:${escapeIcsText(event.title || "Scheduled Event")}`);

  if (event.location) {
    lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  }

  const descSegments: string[] = [];
  if (event.description) {
    descSegments.push(event.description);
  }
  if (event.organizer) {
    descSegments.push(`Organizer: ${event.organizer}`);
  }
  if (event.attendees && event.attendees.length > 0) {
    descSegments.push(`Participants: ${event.attendees.join(", ")}`);
  }
  if (event.statusNote) {
    descSegments.push(`Note: ${event.statusNote}`);
  }

  if (descSegments.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descSegments.join("\n\n"))}`);
  }

  lines.push("STATUS:CONFIRMED");
  lines.push("BEGIN:VALARM");
  lines.push("TRIGGER:-PT15M");
  lines.push("ACTION:DISPLAY");
  lines.push(`DESCRIPTION:${escapeIcsText(`Reminder: ${event.title}`)}`);
  lines.push("END:VALARM");
  lines.push("END:VEVENT");

  return lines;
}

export function generateIcsContent(
  events: CalendarEventItem[],
  timeZone: string,
  calendarName = "Distill Extracted Events"
): string {
  const rawLines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Distill Mail & Document Extractor//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  for (const ev of events) {
    rawLines.push(...buildVEventLines(ev, timeZone));
  }

  rawLines.push("END:VCALENDAR");
  return rawLines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/**
 * Generates a direct 1-click "Add to Google Calendar" URL without requiring OAuth.
 */
export function buildGoogleCalendarUrl(
  event: CalendarEventItem,
  timeZone: string
): string {
  const { startToken, endToken } = resolveEventDatePair(event, timeZone);
  const detailsParts: string[] = [];
  if (event.description) detailsParts.push(event.description);
  if (event.organizer) detailsParts.push(`Organizer: ${event.organizer}`);
  if (event.attendees && event.attendees.length > 0) {
    detailsParts.push(`Participants: ${event.attendees.join(", ")}`);
  }
  if (event.statusNote) detailsParts.push(`Status: ${event.statusNote}`);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title || "Scheduled Event",
    dates: `${startToken}/${endToken}`,
    ctz: timeZone,
  });

  if (detailsParts.length > 0) {
    params.set("details", detailsParts.join("\n\n"));
  }
  if (event.location) {
    params.set("location", event.location);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function slugifyFilename(title: string): string {
  const slug = (title || "calendar-invite")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "calendar-invite";
}

export function triggerIcsDownload(icsContent: string, filenameBase: string): void {
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filenameBase.endsWith(".ics") ? filenameBase : `${filenameBase}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function actionItemToCalendarEvent(
  item: ActionItem,
  documentTitle: string
): CalendarEventItem {
  const fallbackYmd = new Date(Date.now() + 86400_000).toISOString().slice(0, 10);
  const dateIso =
    item.dueDateIso && /^\d{4}-\d{2}-\d{2}/.test(item.dueDateIso)
      ? item.dueDateIso.slice(0, 10)
      : fallbackYmd;

  return {
    id: `task-ics-${item.id}`,
    title: `Deadline: ${item.title}`,
    eventType: "Deadline",
    startIso: dateIso,
    endIso: dateIso,
    isAllDay: true,
    location: "",
    organizer: item.owner || "",
    attendees: [],
    description: `Action item extracted from "${documentTitle}".\nOwner: ${item.owner}\nDue: ${item.dueDateText}\n\nSource context: ${item.sourceSnippet}`,
    statusNote: `${item.priority} priority task deadline`,
  };
}

export function formatEventDateRange(event: CalendarEventItem): string {
  const start = parseWallClockParts(event.startIso);
  if (!start) return event.startIso || "Date TBD";

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const dateLabel = `${months[start.month - 1] ?? ""} ${start.day}, ${start.year}`;

  if (event.isAllDay) {
    const end = parseWallClockParts(event.endIso);
    if (
      end &&
      (end.year !== start.year || end.month !== start.month || end.day !== start.day)
    ) {
      const endLabel = `${months[end.month - 1] ?? ""} ${end.day}, ${end.year}`;
      return `${dateLabel} – ${endLabel} · All day`;
    }
    return `${dateLabel} · All day`;
  }

  const fmtTime = (h: number, m: number) => {
    const suffix = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${pad2(m)} ${suffix}`;
  };

  const startClock = fmtTime(start.hour, start.minute);
  const end = parseWallClockParts(event.endIso);
  if (end) {
    const endClock = fmtTime(end.hour, end.minute);
    return `${dateLabel} · ${startClock} – ${endClock}`;
  }
  return `${dateLabel} · ${startClock}`;
}
