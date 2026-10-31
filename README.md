# Distill — Smart Mail & Document Action Extractor

Distill turns long emails, campus syllabus announcements, meeting memos, and formal PDF notices into three immediate outputs:
1. **Key Summary** — Exactly 3 concise executive bullet points.
2. **Action Extractor** — Tasks, owners, relative/explicit deadlines, and priority-coded rows (`High` red, `Medium` amber, `Low` green).
3. **1-Click Calendar Integration** — Downloadable RFC 5545 `.ics` calendar files (single or combined) plus direct **Add to Google Calendar** links.

---

## Architecture

```text
+-----------------------------------------------------------------------+
|                              USER INPUT                               |
|        [ Paste Email Text ]   OR   [ Upload PDF/Notice Document ]     |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|               BACKEND API (Express + Gemini Structured JSON)          |
|                     POST /api/extract  ·  POST /api/ics               |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                         CORE FEATURE ENGINE                           |
|  1. Key Summary       2. Action Extractor       3. .ics Generator     |
|  (3 Bullet Points)    (Tasks & Deadlines)       (1-Click Calendar)    |
+-----------------------------------------------------------------------+
```

---

## Backend API Reference

### 1. `POST /api/extract`
Extracts a 3-bullet summary, actionable tasks, and calendar events using Gemini structured JSON mode.

- **JSON Payload (`application/json`):**
  ```bash
  curl -X POST http://localhost:3000/api/extract \
    -H "Content-Type: application/json" \
    -d '{
      "text": "Hi team, submit the Q4 migration checklist by Tuesday Nov 3 at 5pm and join our Go/No-Go sync Wednesday Nov 4 from 2:00 PM to 3:00 PM.",
      "timezone": "America/Los_Angeles"
    }'
  ```
- **Multipart File Upload (`multipart/form-data`):**
  ```bash
  curl -X POST http://localhost:3000/api/extract \
    -F "file=@syllabus-update.pdf" \
    -F "timezone=America/Los_Angeles"
  ```

### 2. `POST /api/ics`
Generates a standards-compliant `.ics` calendar invite directly from event JSON.

```bash
curl -X POST http://localhost:3000/api/ics \
  -H "Content-Type: application/json" \
  -d '{
    "event": {
      "title": "Q4 Go/No-Go Review",
      "startIso": "2026-11-04T14:00:00Z",
      "endIso": "2026-11-04T15:00:00Z",
      "location": "Conference Room 4B"
    }
  }' -o invite.ics
```

---

## Local Development & Deployment

```bash
npm install
npm run dev      # Runs full-stack Express + Vite server on port 3000
npm run build    # Builds production frontend assets into dist/
npm start        # Serves full-stack production app via node server.ts
```

Set `GEMINI_API_KEY` in your hosting environment variables before starting the server.

---

## 30-Second Demo GIF Recording Script

Use a screen recorder (e.g., Kap, CleanShot X, OBS, or ScreenToGif) at `1440×900` resolution:

1. **0:00 – 0:06 (Input):** Show the **Workspace** view. Click **Campus Syllabus & Exam Notice** (or drag-and-drop a PDF notice into **Upload PDF / File**).
2. **0:06 – 0:12 (Extract):** Click **Extract Actions & Invites**. Capture the smooth skeleton transition into the structured results card.
3. **0:12 – 0:20 (Summary & Priority Tasks):** Scroll slightly to highlight the **3-Bullet Summary** and the color-coded **Action Extractor** rows (Red = High, Amber = Medium, Green = Low). Check off one task.
4. **0:20 – 0:30 (1-Click Calendar):** Click **.ics File** (or **Download All .ics**) to download the calendar invite and click **Google Calendar** to show the pre-filled event ready to save.
