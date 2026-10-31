import React, { useMemo, useState } from "react";
import {
  Download,
  ExternalLink,
  Search,
  MapPin,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import { CalendarEventItem, ExtractionRecord } from "../types";
import {
  buildGoogleCalendarUrl,
  formatEventDateRange,
  generateIcsContent,
  slugifyFilename,
  triggerIcsDownload,
} from "../utils/icsGenerator";
import { buildWorkspaceConflictLookup } from "../utils/conflictDetector";

interface CalendarQueueViewProps {
  records: ExtractionRecord[];
  timezone: string;
  countryName: string;
  onOpenRecord: (recordId: string) => void;
  onStartNewExtraction: () => void;
  onNotifyToast?: (message: string) => void;
}

interface FlattenedEvent {
  key: string;
  recordId: string;
  documentTitle: string;
  event: CalendarEventItem;
}

export const CalendarQueueView: React.FC<CalendarQueueViewProps> = ({
  records,
  timezone,
  countryName,
  onOpenRecord,
  onStartNewExtraction,
  onNotifyToast,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const conflictLookup = useMemo(
    () => buildWorkspaceConflictLookup(records, timezone),
    [records, timezone]
  );

  const allEvents = useMemo<FlattenedEvent[]>(() => {
    const items: FlattenedEvent[] = [];
    for (const rec of records) {
      for (const ev of rec.calendarEvents) {
        items.push({
          key: `${rec.id}::${ev.id}`,
          recordId: rec.id,
          documentTitle: rec.documentTitle,
          event: ev,
        });
      }
    }
    return items.sort((a, b) =>
      (a.event.startIso || "").localeCompare(b.event.startIso || "")
    );
  }, [records]);

  const conflictEventCount = useMemo(
    () =>
      allEvents.filter((item) => conflictLookup.byEventUid.has(item.key)).length,
    [allEvents, conflictLookup]
  );

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allEvents;
    return allEvents.filter(
      ({ documentTitle, event }) =>
        event.title.toLowerCase().includes(q) ||
        event.location.toLowerCase().includes(q) ||
        event.eventType.toLowerCase().includes(q) ||
        documentTitle.toLowerCase().includes(q)
    );
  }, [allEvents, searchQuery]);

  const toggleSelectKey = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAllFiltered = () => {
    const allFilteredSelected =
      filteredEvents.length > 0 &&
      filteredEvents.every((item) => selectedKeys.has(item.key));

    if (allFilteredSelected) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filteredEvents.map((item) => item.key)));
    }
  };

  const handleBatchDownload = () => {
    const chosen = filteredEvents.filter((item) =>
      selectedKeys.size > 0 ? selectedKeys.has(item.key) : true
    );
    if (chosen.length === 0) return;
    const ics = generateIcsContent(
      chosen.map((c) => c.event),
      timezone,
      "Distill Combined Schedule"
    );
    triggerIcsDownload(ics, "distill-combined-schedule");
    onNotifyToast?.(
      `Downloaded combined .ics schedule (${chosen.length} events)`
    );
  };

  if (allEvents.length === 0) {
    return (
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center">
        <div className="max-w-md mx-auto">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            No calendar invites generated yet
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2">
            Meetings, exam windows, inspections, and appointments detected across your documents appear here with automatic conflict detection and 1-click .ics export.
          </p>
          <div className="mt-6">
            <button
              type="button"
              onClick={onStartNewExtraction}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Extract First Document
            </button>
          </div>
        </div>
      </section>
    );
  }

  const activeExportCount =
    selectedKeys.size > 0 ? selectedKeys.size : filteredEvents.length;

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
      <div className="p-5 sm:p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Calendar Invites (.ics Hub)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
            {allEvents.length} extracted{" "}
            {allEvents.length === 1 ? "event" : "events"} · Country:{" "}
            {countryName}
            {conflictEventCount > 0
              ? ` · ${conflictEventCount} schedule ${
                  conflictEventCount === 1 ? "overlap" : "overlaps"
                } detected`
              : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={handleBatchDownload}
          disabled={activeExportCount === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="tabular-nums">
            {selectedKeys.size > 0
              ? `Download Selected .ics (${selectedKeys.size})`
              : `Download All .ics (${filteredEvents.length})`}
          </span>
        </button>
      </div>

      <div className="px-5 py-3.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-950/30">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter events by title, room, link, or source..."
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
          />
        </div>

        <button
          type="button"
          onClick={toggleSelectAllFiltered}
          className="text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 whitespace-nowrap shrink-0 cursor-pointer"
        >
          {filteredEvents.length > 0 &&
          filteredEvents.every((item) => selectedKeys.has(item.key))
            ? "Clear selection"
            : "Select all visible"}
        </button>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
          No calendar events match your search query.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-6 pr-3 w-10">Pick</th>
                <th className="py-3 px-3">Event &amp; Source</th>
                <th className="py-3 px-3 whitespace-nowrap">Date &amp; Time</th>
                <th className="py-3 px-3">Location / Link</th>
                <th className="py-3 pl-3 pr-6 text-right whitespace-nowrap">
                  1-Click Export
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {filteredEvents.map(({ key, recordId, documentTitle, event }) => {
                const evConflicts = conflictLookup.byEventUid.get(key) ?? [];

                return (
                  <tr
                    key={key}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 pl-6 pr-3 align-top">
                      <input
                        type="checkbox"
                        checked={selectedKeys.has(key)}
                        onChange={() => toggleSelectKey(key)}
                        aria-label={`Select ${event.title}`}
                        className="mt-1 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-600 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 px-3 align-top max-w-md">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {event.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        <span>{event.eventType}</span>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => onOpenRecord(recordId)}
                          className="inline-flex items-center gap-0.5 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                        >
                          <span className="truncate max-w-[200px]">
                            {documentTitle}
                          </span>
                          <ArrowUpRight className="w-3 h-3 shrink-0" />
                        </button>
                      </div>

                      {evConflicts.length > 0 && (
                        <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-900/60 bg-amber-50/75 dark:bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-300 flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>{evConflicts[0].message}</span>
                          </span>
                          {evConflicts[0].targetRecordId !== recordId && (
                            <button
                              type="button"
                              onClick={() =>
                                onOpenRecord(evConflicts[0].targetRecordId)
                              }
                              className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <span>Open conflict</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-3 align-top text-xs font-mono text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      {formatEventDateRange(event)}
                    </td>
                    <td className="py-3.5 px-3 align-top text-xs text-slate-600 dark:text-slate-400 max-w-[220px]">
                      {event.location ? (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{event.location}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-600">
                          —
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 pl-3 pr-6 align-top text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <a
                          href={buildGoogleCalendarUrl(event, timezone)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Google Cal</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => {
                            const ics = generateIcsContent(
                              [event],
                              timezone,
                              event.title
                            );
                            triggerIcsDownload(ics, slugifyFilename(event.title));
                            onNotifyToast?.(`Downloaded "${event.title}.ics"`);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-md transition-colors cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>.ics</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};
