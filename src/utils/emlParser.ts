import { UploadedFilePayload } from "../types";

function stripHtmlTags(html: string): string {
  return html
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

function decodeQuotedPrintable(input: string): string {
  return input
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_match, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function extractMimeParam(headerBlock: string, paramName: string): string | null {
  const regex = new RegExp(`${paramName}=(?:"([^"]+)"|([^;\\r\\n\\s]+))`, "i");
  const match = headerBlock.match(regex);
  return match ? (match[1] || match[2] || "").trim() : null;
}

export interface ParsedEmlResult {
  readableText: string;
  attachments: UploadedFilePayload[];
}

/**
 * Extracts readable headers, body text, AND embedded MIME file attachments from raw .eml RFC 822 email files.
 */
export function parseRawEmlWithAttachments(rawEml: string): ParsedEmlResult {
  const splitMatch = rawEml.match(/\r?\n\r?\n/);
  if (!splitMatch || splitMatch.index === undefined) {
    return { readableText: rawEml.trim(), attachments: [] };
  }

  const headerBlock = rawEml.slice(0, splitMatch.index);
  let bodyBlock = rawEml.slice(splitMatch.index + splitMatch[0].length);

  const unfoldedHeaders = headerBlock.replace(/\r?\n[ \t]+/g, " ");
  const headerLines = unfoldedHeaders.split(/\r?\n/);

  const importantHeaders: string[] = [];
  for (const line of headerLines) {
    if (/^(From|To|Cc|Subject|Date):/i.test(line)) {
      importantHeaders.push(line.trim());
    }
  }

  const extractedAttachments: UploadedFilePayload[] = [];
  const boundaryMatch = unfoldedHeaders.match(/boundary="?([^";\r\n]+)"?/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = bodyBlock.split(`--${boundary}`);
    const textChunks: string[] = [];

    parts.forEach((part, idx) => {
      if (!part || part.trim() === "--" || part.trim() === "") return;
      const partSplit = part.match(/\r?\n\r?\n/);
      if (!partSplit || partSplit.index === undefined) return;

      const rawPartHeaders = part.slice(0, partSplit.index).replace(/\r?\n[ \t]+/g, " ");
      const rawPartBody = part
        .slice(partSplit.index + partSplit[0].length)
        .replace(/\r?\n--$/, "")
        .trim();

      const contentTypeMatch = rawPartHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      const mimeType = contentTypeMatch
        ? contentTypeMatch[1].trim().toLowerCase()
        : "text/plain";

      const fileName =
        extractMimeParam(rawPartHeaders, "filename") ||
        extractMimeParam(rawPartHeaders, "name");

      const isAttachment =
        /Content-Disposition:\s*attachment/i.test(rawPartHeaders) ||
        Boolean(fileName && !mimeType.startsWith("multipart/"));

      const isBase64 = /Content-Transfer-Encoding:\s*base64/i.test(rawPartHeaders);
      const isQP = /Content-Transfer-Encoding:\s*quoted-printable/i.test(rawPartHeaders);

      if (isAttachment) {
        const safeName = fileName || `eml-attachment-${idx + 1}`;
        if (isBase64) {
          const cleanB64 = rawPartBody.replace(/\s+/g, "");
          const approxBytes = Math.floor((cleanB64.length * 3) / 4);
          let textContent: string | undefined;
          if (mimeType.startsWith("text/")) {
            try {
              textContent = atob(cleanB64);
            } catch {
              textContent = undefined;
            }
          }
          extractedAttachments.push({
            id: `eml-att-${Date.now()}-${idx}`,
            fileName: safeName,
            mimeType,
            sizeBytes: approxBytes,
            origin: "eml",
            base64: cleanB64,
            extractedText: textContent,
          });
        } else {
          const decodedText = isQP ? decodeQuotedPrintable(rawPartBody) : rawPartBody;
          const b64 = btoa(unescape(encodeURIComponent(decodedText)));
          extractedAttachments.push({
            id: `eml-att-${Date.now()}-${idx}`,
            fileName: safeName,
            mimeType,
            sizeBytes: new Blob([decodedText]).size,
            origin: "eml",
            base64: b64,
            extractedText: decodedText,
          });
        }
        return;
      }

      let decodedBody = rawPartBody;
      if (isBase64) {
        try {
          decodedBody = atob(rawPartBody.replace(/\s+/g, ""));
        } catch {
          return;
        }
      } else if (isQP) {
        decodedBody = decodeQuotedPrintable(rawPartBody);
      }

      if (mimeType === "text/plain") {
        textChunks.push(decodedBody.trim());
      } else if (mimeType === "text/html" && textChunks.length === 0) {
        textChunks.push(stripHtmlTags(decodedBody));
      }
    });

    if (textChunks.length > 0) {
      bodyBlock = textChunks.join("\n\n");
    }
  } else {
    if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(unfoldedHeaders)) {
      bodyBlock = decodeQuotedPrintable(bodyBlock);
    }
    if (/<html|<body|<div|<p>/i.test(bodyBlock)) {
      bodyBlock = stripHtmlTags(bodyBlock);
    }
  }

  return {
    readableText: [...importantHeaders, "", bodyBlock.trim()].join("\n").trim(),
    attachments: extractedAttachments,
  };
}

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ALLOWED_AUDIO_MIMES = new Set([
  "audio/webm",
  "audio/mp3",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/ogg",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
]);

export function normalizeAudioMime(rawMime: string, fileName = ""): string | null {
  const baseMime = (rawMime || "").split(";")[0].trim().toLowerCase();
  const lower = fileName.toLowerCase();
  if (baseMime === "audio/mpeg" || baseMime === "audio/mp3" || lower.endsWith(".mp3")) {
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
  if (ALLOWED_AUDIO_MIMES.has(baseMime)) {
    return baseMime;
  }
  return null;
}

export function fileToBase64(file: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error("Could not read file from disk."));
    reader.readAsDataURL(file);
  });
}

export async function readUploadedFile(file: File): Promise<UploadedFilePayload> {
  if (file.size === 0) {
    throw new Error(`"${file.name}" is empty (0 bytes). Please choose a valid document.`);
  }

  const maxBytes = 18 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error("File exceeds the 18 MB upload limit. Please select a smaller document.");
  }

  const lowerName = file.name.toLowerCase();
  const isEml = lowerName.endsWith(".eml") || file.type === "message/rfc822";

  if (isEml) {
    const rawText = await file.text();
    const { readableText, attachments } = parseRawEmlWithAttachments(rawText);
    return {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      mimeType: "message/rfc822",
      sizeBytes: file.size,
      origin: "uploaded",
      extractedText: readableText,
      embeddedAttachments: attachments,
    };
  }

  const isDocx = lowerName.endsWith(".docx") || file.type === DOCX_MIME;
  if (isDocx) {
    const base64 = await fileToBase64(file);
    let extractedText: string | undefined;
    try {
      const resp = await fetch("/api/parse-docx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 }),
      });
      if (resp.ok) {
        const parsed = (await resp.json()) as { text?: string };
        if (parsed.text) extractedText = parsed.text;
      }
    } catch {
      // Server will still parse base64 .docx during /api/extract if offline/unavailable here
    }
    return {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      mimeType: DOCX_MIME,
      sizeBytes: file.size,
      origin: "uploaded",
      base64,
      extractedText,
    };
  }

  const isTextLike =
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    file.type.startsWith("text/");

  if (isTextLike) {
    const rawText = await file.text();
    const b64 = btoa(unescape(encodeURIComponent(rawText)));
    return {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      mimeType: file.type || "text/plain",
      sizeBytes: file.size,
      origin: "uploaded",
      base64: b64,
      extractedText: rawText,
    };
  }

  const detectedAudioMime = normalizeAudioMime(file.type, file.name);
  if (detectedAudioMime) {
    const base64 = await fileToBase64(file);
    return {
      id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      mimeType: detectedAudioMime,
      sizeBytes: file.size,
      origin: "uploaded",
      base64,
    };
  }

  let mimeType = file.type;
  if (!mimeType || mimeType === "application/octet-stream") {
    if (lowerName.endsWith(".pdf")) mimeType = "application/pdf";
    else if (lowerName.endsWith(".png")) mimeType = "image/png";
    else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) mimeType = "image/jpeg";
    else if (lowerName.endsWith(".webp")) mimeType = "image/webp";
  }

  if (
    !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mimeType)
  ) {
    throw new Error(
      "Supported formats: PDF (.pdf), Word (.docx), Image OCR (.png, .jpg, .webp), Audio (.mp3, .wav, .m4a, .webm, .ogg), Email (.eml), or Text (.txt, .md, .csv)."
    );
  }

  const base64 = await fileToBase64(file);

  return {
    id: `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fileName: file.name,
    mimeType,
    sizeBytes: file.size,
    origin: "uploaded",
    base64,
  };
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
