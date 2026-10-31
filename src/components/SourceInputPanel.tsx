import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Download,
  FileAudio,
  FileText,
  FolderOpen,
  Languages,
  Loader2,
  Mic,
  Paperclip,
  PenLine,
  Plus,
  Save,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  InputSourceMode,
  SUPPORTED_LANGUAGES,
  UploadedFilePayload,
} from "../types";
import {
  fileToBase64,
  formatFileSize,
  normalizeAudioMime,
  readUploadedFile,
} from "../utils/emlParser";
import { EMAIL_WRITING_FORMATS } from "../data/emailFormats";

export const EVALUATION_BASIS_OPTIONS: Array<{
  id: string;
  label: string;
}> = [
  { id: "Promotional & Spam Check", label: "Promotional / Spam" },
  { id: "Urgency & Deadlines", label: "Urgency & Deadlines" },
  { id: "Sender Credibility & Risk", label: "Sender Credibility" },
  { id: "Action & Effort Required", label: "Action & Effort" },
  { id: "Tone & Sentiment", label: "Tone & Sentiment" },
  { id: "Financial & Legal Impact", label: "Financial & Legal" },
];

interface SourceInputPanelProps {
  sourceMode: InputSourceMode;
  onSourceModeChange: (mode: InputSourceMode) => void;
  textValue: string;
  onTextChange: (text: string) => void;
  uploadedFiles: UploadedFilePayload[];
  onUploadedFilesChange: (files: UploadedFilePayload[]) => void;
  summaryPointCount: number;
  onSummaryPointCountChange: (count: number) => void;
  targetLanguage: string;
  onTargetLanguageChange: (language: string) => void;
  batchMode: "separate" | "combined";
  onBatchModeChange: (mode: "separate" | "combined") => void;
  batchProgress: { completed: number; total: number } | null;
  selectedEvaluationBases: string[];
  onToggleEvaluationBasis: (basis: string) => void;
  customEvaluationBasis: string;
  onCustomEvaluationBasisChange: (val: string) => void;
  focusHint: string;
  onFocusHintChange: (hint: string) => void;
  isExtracting: boolean;
  onExtract: () => void;
  onOpenEmailFormats: () => void;
  onNotifyToast?: (message: string) => void;
  // Draft Email Composer props
  draftTo: string;
  onDraftToChange: (val: string) => void;
  draftSubject: string;
  onDraftSubjectChange: (val: string) => void;
  draftBody: string;
  onDraftBodyChange: (val: string) => void;
  draftFormatStyle: string;
  onDraftFormatStyleChange: (val: string) => void;
  draftNotes: string;
  onDraftNotesChange: (val: string) => void;
  isGeneratingDraft: boolean;
  onGenerateDraft: () => void;
  isSavingDraft: boolean;
  onSaveDraft: () => void;
  onNewDraft: () => void;
}

function formatTimerClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export const SourceInputPanel: React.FC<SourceInputPanelProps> = ({
  sourceMode,
  onSourceModeChange,
  textValue,
  onTextChange,
  uploadedFiles,
  onUploadedFilesChange,
  summaryPointCount,
  onSummaryPointCountChange,
  targetLanguage,
  onTargetLanguageChange,
  batchMode,
  onBatchModeChange,
  batchProgress,
  selectedEvaluationBases,
  onToggleEvaluationBasis,
  customEvaluationBasis,
  onCustomEvaluationBasisChange,
  focusHint,
  onFocusHintChange,
  isExtracting,
  onExtract,
  onOpenEmailFormats,
  onNotifyToast,
  draftTo,
  onDraftToChange,
  draftSubject,
  onDraftSubjectChange,
  draftBody,
  onDraftBodyChange,
  draftFormatStyle,
  onDraftFormatStyleChange,
  draftNotes,
  onDraftNotesChange,
  isGeneratingDraft,
  onGenerateDraft,
  isSavingDraft,
  onSaveDraft,
  onNewDraft,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const attachCompanionRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const [showFocusInput, setShowFocusInput] = useState(false);
  const [showCustomBasisInput, setShowCustomBasisInput] = useState(false);
  const [copiedDraft, setCopiedDraft] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);

  // Voice Note Recorder & Speech-to-Text state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioLevels, setAudioLevels] = useState<number[]>(
    Array(16).fill(12)
  );
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordedPayload, setRecordedPayload] =
    useState<UploadedFilePayload | null>(null);
  const [isTranscribingAudio, setIsTranscribingAudio] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const cleanupRecordingResources = () => {
    if (animFrameRef.current !== null) {
      window.cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      void audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    mediaRecorderRef.current = null;
  };

  useEffect(() => {
    return () => {
      cleanupRecordingResources();
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startVoiceRecording = async () => {
    setFileError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setFileError(
        "Microphone recording is not supported in this browser. You can upload an audio file (.mp3, .wav, .m4a, .webm, .ogg) instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const preferredTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      let chosenMime = "";
      for (const candidate of preferredTypes) {
        if (
          typeof MediaRecorder !== "undefined" &&
          MediaRecorder.isTypeSupported(candidate)
        ) {
          chosenMime = candidate;
          break;
        }
      }

      const recorder = chosenMime
        ? new MediaRecorder(stream, { mimeType: chosenMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      // Live Web Audio API level analyzer
      try {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        const audioCtx = new AudioCtx();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const updateMeter = () => {
          analyser.getByteFrequencyData(freqData);
          const bars: number[] = [];
          for (let i = 0; i < 16; i += 1) {
            const val = freqData[i] || 0;
            bars.push(Math.max(12, Math.min(100, Math.round((val / 255) * 100))));
          }
          setAudioLevels(bars);
          animFrameRef.current = window.requestAnimationFrame(updateMeter);
        };
        animFrameRef.current = window.requestAnimationFrame(updateMeter);
      } catch {
        // Fallback if AudioContext is restricted
      }

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        try {
          const rawMime = recorder.mimeType || chosenMime || "audio/webm";
          const normalizedMime =
            normalizeAudioMime(rawMime, "voice-note.webm") || "audio/webm";
          const ext =
            normalizedMime === "audio/mp4"
              ? "m4a"
              : normalizedMime === "audio/ogg"
                ? "ogg"
                : "webm";

          const blob = new Blob(audioChunksRef.current, {
            type: normalizedMime,
          });
          if (blob.size === 0) {
            setFileError("Recorded voice note was empty. Please try again.");
            cleanupRecordingResources();
            return;
          }

          if (recordedAudioUrl) {
            URL.revokeObjectURL(recordedAudioUrl);
          }
          const previewUrl = URL.createObjectURL(blob);
          setRecordedAudioUrl(previewUrl);

          const base64 = await fileToBase64(blob);
          const stamp = new Date()
            .toTimeString()
            .slice(0, 8)
            .replace(/:/g, "-");
          const payload: UploadedFilePayload = {
            id: `voice-${Date.now()}`,
            fileName: `voice-note-${stamp}.${ext}`,
            mimeType: normalizedMime,
            sizeBytes: blob.size,
            origin: "uploaded",
            base64,
          };
          setRecordedPayload(payload);
          onUploadedFilesChange([payload]);
          onNotifyToast?.("Recorded voice note — ready to transcribe or extract");
        } catch {
          setFileError("Failed to finalize recorded audio.");
        } finally {
          cleanupRecordingResources();
        }
      };

      setRecordingSeconds(0);
      setIsRecording(true);
      recorder.start(250);

      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch {
      cleanupRecordingResources();
      setIsRecording(false);
      setFileError(
        "Microphone access was denied or unavailable. Allow microphone permission or upload an audio recording (.mp3, .wav, .m4a, .webm)."
      );
    }
  };

  const stopVoiceRecording = () => {
    setIsRecording(false);
    setAudioLevels(Array(16).fill(12));
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    } else {
      cleanupRecordingResources();
    }
  };

  const handleClearVoiceNote = () => {
    if (isRecording) {
      stopVoiceRecording();
    }
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setRecordedPayload(null);
    setRecordingSeconds(0);
    onUploadedFilesChange(
      uploadedFiles.filter((f) => !f.mimeType.startsWith("audio/"))
    );
  };

  const handleAudioFileUpload = async (file: File | undefined) => {
    if (!file) return;
    setFileError(null);
    try {
      const payload = await readUploadedFile(file);
      if (!payload.mimeType.startsWith("audio/")) {
        setFileError(
          "Please select a supported audio file (.mp3, .wav, .m4a, .webm, or .ogg)."
        );
        return;
      }
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
      }
      const previewUrl = URL.createObjectURL(file);
      setRecordedAudioUrl(previewUrl);
      setRecordedPayload(payload);
      onUploadedFilesChange([payload]);
      onNotifyToast?.(`Loaded audio "${file.name}"`);
    } catch (err) {
      setFileError(
        err instanceof Error ? err.message : "Could not read audio file."
      );
    }
  };

  const handleTranscribeVoiceNote = async () => {
    const targetAudio =
      recordedPayload ||
      uploadedFiles.find((f) => f.mimeType.startsWith("audio/") && f.base64);
    if (!targetAudio || !targetAudio.base64) {
      setFileError("Record or upload a voice note first.");
      return;
    }

    setFileError(null);
    setIsTranscribingAudio(true);
    try {
      const resp = await fetch("/api/transcribe-audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base64: targetAudio.base64,
          mimeType: targetAudio.mimeType,
          fileName: targetAudio.fileName,
        }),
      });
      const data = (await resp.json()) as {
        transcript?: string;
        wordCount?: number;
        error?: string;
      };
      if (!resp.ok) {
        throw new Error(data?.error || "Speech-to-text transcription failed.");
      }
      const cleanTranscript = (data.transcript || "").trim();
      if (!cleanTranscript) {
        setFileError("No clear speech was detected in the recording.");
        return;
      }

      onTextChange(
        textValue.trim()
          ? `${textValue.trim()}\n\n${cleanTranscript}`
          : cleanTranscript
      );
      // Keep transcript in textValue and remove raw audio binary from uploadedFiles so extraction doesn't double-transcribe
      const withExtractedText: UploadedFilePayload = {
        ...targetAudio,
        extractedText: cleanTranscript,
      };
      setRecordedPayload(withExtractedText);
      onUploadedFilesChange([withExtractedText]);
      onNotifyToast?.(
        `Transcribed ${data.wordCount || cleanTranscript.split(/\s+/).length} spoken words`
      );
    } catch (err) {
      setFileError(
        err instanceof Error
          ? err.message
          : "Failed to transcribe audio recording."
      );
    } finally {
      setIsTranscribingAudio(false);
    }
  };

  const handleFilesSelected = async (
    fileList: FileList | null | undefined,
    append: boolean,
    isFolderSelection = false
  ) => {
    if (!fileList || fileList.length === 0) return;
    setFileError(null);

    const newlyRead: UploadedFilePayload[] = [];
    let extractedEmlBody = "";
    let skippedCount = 0;
    let firstReason = "";

    for (let i = 0; i < fileList.length; i += 1) {
      const file = fileList[i];
      if (!file) continue;
      if (file.name.startsWith(".")) continue; // Skip .DS_Store / hidden folder metadata

      try {
        const payload = await readUploadedFile(file);
        if (payload.mimeType === "message/rfc822") {
          if (payload.extractedText && !extractedEmlBody && fileList.length === 1) {
            extractedEmlBody = payload.extractedText;
          }
          newlyRead.push(payload);
          if (
            payload.embeddedAttachments &&
            payload.embeddedAttachments.length > 0
          ) {
            newlyRead.push(...payload.embeddedAttachments);
          }
        } else {
          newlyRead.push(payload);
        }
      } catch (err) {
        skippedCount += 1;
        if (!firstReason && err instanceof Error) {
          firstReason = err.message;
        }
      }
    }

    if (newlyRead.length === 0) {
      setFileError(
        firstReason ||
          "No supported documents (.pdf, .docx, .eml, .txt, image OCR, or audio) found in selection."
      );
      return;
    }

    if (extractedEmlBody && !textValue.trim() && newlyRead.length === 1) {
      onTextChange(extractedEmlBody);
    }

    const merged = append ? [...uploadedFiles, ...newlyRead] : newlyRead;
    onUploadedFilesChange(merged);

    if (isFolderSelection || newlyRead.length > 1) {
      onNotifyToast?.(
        `Queued ${newlyRead.length} ${
          newlyRead.length === 1 ? "file" : "files"
        } for processing${
          skippedCount > 0 ? ` (${skippedCount} unsupported skipped)` : ""
        }`
      );
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    await handleFilesSelected(e.dataTransfer.files, uploadedFiles.length > 0);
  };

  const handleRemoveFile = (id: string) => {
    onUploadedFilesChange(uploadedFiles.filter((f) => f.id !== id));
    if (recordedPayload?.id === id) {
      setRecordedPayload(null);
      if (recordedAudioUrl) {
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
      }
    }
  };

  const wordCount = textValue.trim()
    ? textValue.trim().split(/\s+/).length
    : 0;

  const draftWordCount = draftBody.trim()
    ? draftBody.trim().split(/\s+/).length
    : 0;

  const canSubmitExtraction =
    !isExtracting &&
    !isRecording &&
    !isTranscribingAudio &&
    (textValue.trim().length > 0 || uploadedFiles.length > 0);

  const activeBasisTotal =
    selectedEvaluationBases.length + (customEvaluationBasis.trim() ? 1 : 0);

  const handleCopyDraft = async () => {
    const full = [
      draftTo.trim() ? `To: ${draftTo.trim()}` : "",
      draftSubject.trim() ? `Subject: ${draftSubject.trim()}` : "",
      "",
      draftBody,
    ]
      .filter((line, idx) => idx >= 2 || Boolean(line))
      .join("\n")
      .trim();

    if (!full) return;
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = full;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedDraft(true);
    setTimeout(() => setCopiedDraft(false), 1800);
  };

  const handleDownloadEml = () => {
    if (!draftSubject.trim() && !draftBody.trim()) return;
    const emlLines = [
      `Date: ${new Date().toUTCString()}`,
      draftTo.trim() ? `To: ${draftTo.trim()}` : "",
      `Subject: ${draftSubject.trim() || "Draft Email"}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "",
      draftBody,
    ].filter((line, idx) => idx >= 5 || Boolean(line));

    const blob = new Blob([emlLines.join("\r\n")], {
      type: "message/rfc822;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const safeName =
      (draftSubject.trim() || "email-draft")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40) || "email-draft";
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.eml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const triggerSaveDraft = () => {
    onSaveDraft();
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1800);
  };

  const isBatchUploadActive =
    sourceMode === InputSourceMode.UploadFile &&
    uploadedFiles.length > 1 &&
    batchMode === "separate";

  const activeAudioPayload =
    recordedPayload ||
    uploadedFiles.find((f) => f.mimeType.startsWith("audio/")) ||
    null;

  return (
    <section
      aria-label="Workspace Mail Input and Composer"
      className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col divide-y divide-slate-200 dark:divide-slate-800"
    >
      {/* Hidden Multi-File, Folder & Audio Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.eml,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.webm,.ogg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,message/rfc822,text/plain,image/png,image/jpeg,image/webp,audio/*"
        onChange={(e) => {
          void handleFilesSelected(e.target.files, uploadedFiles.length > 0);
          e.target.value = "";
        }}
        className="sr-only"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({
          webkitdirectory: "",
          directory: "",
        } as React.InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => {
          void handleFilesSelected(
            e.target.files,
            uploadedFiles.length > 0,
            true
          );
          e.target.value = "";
        }}
        className="sr-only"
      />
      <input
        ref={attachCompanionRef}
        type="file"
        multiple
        accept=".pdf,.docx,.eml,.txt,.md,.csv,.png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.webm,.ogg,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,message/rfc822,text/plain,image/png,image/jpeg,image/webp,audio/*"
        onChange={(e) => {
          void handleFilesSelected(e.target.files, true);
          e.target.value = "";
        }}
        className="sr-only"
      />
      <input
        ref={audioInputRef}
        type="file"
        accept=".mp3,.wav,.m4a,.webm,.ogg,audio/mpeg,audio/mp3,audio/wav,audio/mp4,audio/x-m4a,audio/webm,audio/ogg"
        onChange={(e) => {
          void handleAudioFileUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="sr-only"
      />

      {/* Header & 4-Way Segmented Switcher (Paste Text | Upload | Voice Note | Draft Email) */}
      <div className="p-5 sm:p-6 flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {sourceMode === InputSourceMode.DraftEmail
                ? "Draft Email"
                : sourceMode === InputSourceMode.VoiceNote
                  ? "Voice Note & Audio Extractor"
                  : "Source Mail or Document"}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {sourceMode === InputSourceMode.DraftEmail
                ? "Compose directly, insert a standard format, or generate from notes"
                : sourceMode === InputSourceMode.VoiceNote
                  ? "Record spoken reminders or upload meeting audio for speech-to-text & .ics extraction"
                  : "Single document, folder batch upload, auto-translation, and custom summary length"}
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Workspace mode"
          className="inline-flex flex-wrap items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg self-start gap-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === InputSourceMode.PasteText}
            onClick={() => {
              setFileError(null);
              if (isRecording) stopVoiceRecording();
              onSourceModeChange(InputSourceMode.PasteText);
            }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sourceMode === InputSourceMode.PasteText
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Paste Text
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === InputSourceMode.UploadFile}
            onClick={() => {
              setFileError(null);
              if (isRecording) stopVoiceRecording();
              onSourceModeChange(InputSourceMode.UploadFile);
            }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums ${
              sourceMode === InputSourceMode.UploadFile
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Upload{uploadedFiles.length > 0 ? ` (${uploadedFiles.length})` : ""}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === InputSourceMode.VoiceNote}
            onClick={() => {
              setFileError(null);
              onSourceModeChange(InputSourceMode.VoiceNote);
            }}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sourceMode === InputSourceMode.VoiceNote
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            <Mic className="w-3 h-3" />
            <span>Voice Note</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sourceMode === InputSourceMode.DraftEmail}
            onClick={() => {
              setFileError(null);
              if (isRecording) stopVoiceRecording();
              onSourceModeChange(InputSourceMode.DraftEmail);
            }}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sourceMode === InputSourceMode.DraftEmail
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Draft Email
          </button>
        </div>
      </div>

      {sourceMode === InputSourceMode.DraftEmail ? (
        /* ================= DRAFT EMAIL COMPOSER ================= */
        <>
          <div className="p-5 sm:p-6 flex flex-col gap-4">
            {/* Quick AI Draft Generator Bar */}
            <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                  Draft from key points (optional)
                </span>
                <div className="flex items-center gap-2">
                  <select
                    aria-label="Draft format style"
                    value={draftFormatStyle}
                    onChange={(e) => onDraftFormatStyleChange(e.target.value)}
                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  >
                    {EMAIL_WRITING_FORMATS.map((fmt) => (
                      <option key={fmt.id} value={fmt.shortLabel}>
                        {fmt.shortLabel} Format
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={onOpenEmailFormats}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Formats</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={draftNotes}
                  onChange={(e) => onDraftNotesChange(e.target.value)}
                  placeholder="Describe what you want to say..."
                  className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                />
                <button
                  type="button"
                  disabled={isGeneratingDraft || !draftNotes.trim()}
                  onClick={onGenerateDraft}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 disabled:opacity-50 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isGeneratingDraft ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Drafting...</span>
                    </>
                  ) : (
                    <>
                      <PenLine className="w-3.5 h-3.5" />
                      <span>Generate</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Recipient & Subject */}
            <div className="grid grid-cols-1 gap-3">
              <div>
                <label
                  htmlFor="draft-to-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  To
                </label>
                <input
                  id="draft-to-input"
                  type="text"
                  value={draftTo}
                  onChange={(e) => onDraftToChange(e.target.value)}
                  placeholder="Recipient name or email"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>

              <div>
                <label
                  htmlFor="draft-subject-input"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Subject
                </label>
                <input
                  id="draft-subject-input"
                  type="text"
                  value={draftSubject}
                  onChange={(e) => onDraftSubjectChange(e.target.value)}
                  placeholder="Email subject line"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-3.5 py-2 text-xs font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                />
              </div>
            </div>

            {/* Draft Body */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                <label
                  htmlFor="draft-body-textarea"
                  className="font-medium text-slate-700 dark:text-slate-300"
                >
                  Message
                </label>
                <div className="flex items-center gap-2.5 tabular-nums">
                  <span>{draftWordCount.toLocaleString()} words</span>
                  {(draftSubject || draftBody || draftTo) && (
                    <>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={onNewDraft}
                        className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Reset
                      </button>
                    </>
                  )}
                </div>
              </div>

              <textarea
                id="draft-body-textarea"
                value={draftBody}
                onChange={(e) => onDraftBodyChange(e.target.value)}
                placeholder="Write your email message here..."
                rows={9}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-4 py-3 text-sm leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors resize-y min-h-[190px]"
              />
            </div>
          </div>

          {/* Draft Actions Footer */}
          <div className="px-5 py-4 sm:px-6 bg-slate-50/60 dark:bg-slate-950/40 rounded-b-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!draftSubject.trim() && !draftBody.trim()}
                onClick={() => void handleCopyDraft()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                {copiedDraft ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={!draftSubject.trim() && !draftBody.trim()}
                onClick={handleDownloadEml}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
              >
                <Download className="w-3.5 h-3.5" />
                <span>.eml</span>
              </button>
            </div>

            <button
              type="button"
              disabled={
                isSavingDraft || (!draftSubject.trim() && !draftBody.trim())
              }
              onClick={triggerSaveDraft}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
            >
              {savedFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Draft Saved</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Draft</span>
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        /* ================= PASTE TEXT / UPLOAD / VOICE NOTE EXTRACTOR ================= */
        <>
          <div className="p-5 sm:p-6 flex-1 flex flex-col gap-4">
            {sourceMode === InputSourceMode.PasteText ? (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <label
                    htmlFor="raw-email-textarea"
                    className="font-medium text-slate-700 dark:text-slate-300"
                  >
                    Email body, forwarded thread, or notice text
                  </label>
                  <div className="flex items-center gap-2.5 tabular-nums">
                    <button
                      type="button"
                      onClick={onOpenEmailFormats}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                      <span>Formats</span>
                    </button>
                    <span
                      aria-hidden="true"
                      className="text-slate-300 dark:text-slate-700"
                    >
                      ·
                    </span>
                    <span>{wordCount.toLocaleString()} words</span>
                    {textValue.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <button
                          type="button"
                          onClick={() => onTextChange("")}
                          className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 underline underline-offset-2 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Clear
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <textarea
                  id="raw-email-textarea"
                  value={textValue}
                  onChange={(e) => onTextChange(e.target.value)}
                  placeholder="Paste email or document text in any language..."
                  rows={8}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-4 py-3 text-sm leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600 transition-colors resize-y min-h-[175px]"
                />

                {/* Companion Email Attachments Strip */}
                <div className="pt-0.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => attachCompanionRef.current?.click()}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                      <span>Attach files included with this email</span>
                    </button>
                    {uploadedFiles.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {uploadedFiles.length} attached
                      </span>
                    )}
                  </div>

                  {uploadedFiles.length > 0 && (
                    <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40">
                      {uploadedFiles.map((f) => (
                        <div
                          key={f.id}
                          className="px-3 py-2 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                              {f.fileName}
                            </span>
                            <span aria-hidden="true" className="text-slate-400">
                              ·
                            </span>
                            <span className="text-slate-500 dark:text-slate-400 font-mono tabular-nums shrink-0">
                              {formatFileSize(f.sizeBytes)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(f.id)}
                            aria-label={`Remove ${f.fileName}`}
                            className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : sourceMode === InputSourceMode.VoiceNote ? (
              /* ================= AUDIO / VOICE NOTE PROCESSOR ================= */
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {isRecording
                          ? "Recording live voice note..."
                          : activeAudioPayload
                            ? activeAudioPayload.fileName
                            : "Record a spoken reminder or meeting memo"}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                        {isRecording
                          ? `Elapsed ${formatTimerClock(recordingSeconds)} · Speak dates, times, and tasks clearly`
                          : activeAudioPayload
                            ? `${activeAudioPayload.mimeType} · ${formatFileSize(
                                activeAudioPayload.sizeBytes
                              )}`
                            : "Supports browser microphone or .mp3, .wav, .m4a, .webm, .ogg files"}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isRecording ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void startVoiceRecording()}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Mic className="w-3.5 h-3.5" />
                            <span>
                              {activeAudioPayload
                                ? "Record Again"
                                : "Start Recording"}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => audioInputRef.current?.click()}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload Audio</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={stopVoiceRecording}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer tabular-nums"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop ({formatTimerClock(recordingSeconds)})</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Live Web Audio Level Meter while recording */}
                  {isRecording && (
                    <div
                      aria-label="Live microphone input level"
                      className="h-10 px-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-1.5"
                    >
                      <div className="flex items-end gap-1 h-6 flex-1">
                        {audioLevels.map((lvl, idx) => (
                          <div
                            key={idx}
                            style={{
                              height: `${Math.max(15, lvl)}%`,
                            }}
                            className="flex-1 bg-blue-600 dark:bg-blue-400 rounded-xs transition-opacity"
                          />
                        ))}
                      </div>
                      <span className="font-mono text-xs font-semibold text-red-600 dark:text-red-400 tabular-nums shrink-0 ml-2">
                        {formatTimerClock(recordingSeconds)}
                      </span>
                    </div>
                  )}

                  {/* Audio Preview Player + Speech-to-Text Button */}
                  {activeAudioPayload && !isRecording && (
                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800/80 space-y-3">
                      {recordedAudioUrl && (
                        <audio
                          controls
                          src={recordedAudioUrl}
                          className="w-full h-9"
                        />
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          disabled={isTranscribingAudio}
                          onClick={() => void handleTranscribeVoiceNote()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 hover:bg-blue-100/80 dark:hover:bg-blue-950/70 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          {isTranscribingAudio ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Running Speech-to-Text...</span>
                            </>
                          ) : (
                            <>
                              <FileAudio className="w-3.5 h-3.5" />
                              <span>Transcribe Audio to Text</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={handleClearVoiceNote}
                          className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 dark:hover:text-red-400 whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Remove Audio</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Editable Speech-to-Text Transcript Box */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <label
                      htmlFor="voice-transcript-textarea"
                      className="font-medium text-slate-700 dark:text-slate-300"
                    >
                      Spoken transcript or additional context (optional before extraction)
                    </label>
                    <span className="tabular-nums">
                      {wordCount.toLocaleString()} words
                    </span>
                  </div>
                  <textarea
                    id="voice-transcript-textarea"
                    rows={4}
                    value={textValue}
                    onChange={(e) => onTextChange(e.target.value)}
                    placeholder="Click Transcribe Audio to Text above to inspect/edit your transcript first, or click Extract & Evaluate directly..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-3.5 py-2.5 text-xs leading-relaxed text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  />
                </div>
              </div>
            ) : (
              /* ================= UPLOAD & BATCH MULTI-FILE / FOLDER PROCESSOR ================= */
              <div className="flex flex-col gap-3.5">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className={`min-h-[155px] rounded-lg border border-dashed px-6 py-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isDragging
                      ? "border-blue-600 bg-blue-50/50 dark:bg-blue-950/20"
                      : "border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40 hover:border-slate-400 dark:hover:border-slate-600"
                  }`}
                >
                  <Upload className="w-6 h-6 text-slate-500 dark:text-slate-400 mb-2" />
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Drop multiple PDFs, Word (.docx), screenshots (OCR), .eml, audio, or .txt
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                    Drag &amp; drop a batch of files or select an entire document folder up to 18 MB per file.
                  </p>

                  <div
                    className="mt-3.5 flex flex-wrap items-center justify-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Select Files</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => folderInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>Select Folder</span>
                    </button>
                  </div>
                </div>

                {/* Multi-File Batch Mode Toggle */}
                {uploadedFiles.length > 1 && (
                  <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                      Batch Queue ({uploadedFiles.length} files)
                    </span>

                    <div className="inline-flex items-center p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-md">
                      <button
                        type="button"
                        onClick={() => onBatchModeChange("separate")}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          batchMode === "separate"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        Separate Docs
                      </button>
                      <button
                        type="button"
                        onClick={() => onBatchModeChange("combined")}
                        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          batchMode === "combined"
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                            : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        Combined Brief
                      </button>
                    </div>
                  </div>
                )}

                {/* Live Concurrent Batch Progress Bar */}
                {isExtracting && batchProgress && (
                  <div className="p-3 rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 space-y-2">
                    <div className="flex items-center justify-between text-xs font-medium text-blue-800 dark:text-blue-300 tabular-nums">
                      <span>Processing batch concurrently...</span>
                      <span>
                        {batchProgress.completed} / {batchProgress.total} completed
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-blue-200/70 dark:bg-blue-900/60 overflow-hidden">
                      <div
                        style={{
                          transform: `scaleX(${Math.max(
                            0.06,
                            batchProgress.completed /
                              Math.max(1, batchProgress.total)
                          )})`,
                          transformOrigin: "left",
                        }}
                        className="h-full w-full bg-blue-600 dark:bg-blue-400 transition-transform duration-150"
                      />
                    </div>
                  </div>
                )}

                {uploadedFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>
                        {uploadedFiles.length}{" "}
                        {uploadedFiles.length === 1 ? "file" : "files"} staged
                      </span>
                      {uploadedFiles.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onUploadedFilesChange([])}
                          className="text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 underline underline-offset-2 cursor-pointer"
                        >
                          Clear all
                        </button>
                      )}
                    </div>

                    <div className="divide-y divide-slate-200 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/50 max-h-52 overflow-y-auto">
                      {uploadedFiles.map((f) => (
                        <div
                          key={f.id}
                          className="p-3 flex items-start justify-between gap-3"
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            {f.mimeType.startsWith("audio/") ? (
                              <FileAudio className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            ) : (
                              <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                                {f.fileName}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                                <span>
                                  {f.origin === "eml"
                                    ? `Extracted from .eml (${f.mimeType})`
                                    : f.mimeType}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{formatFileSize(f.sizeBytes)}</span>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveFile(f.id)}
                            aria-label={`Remove ${f.fileName}`}
                            className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded transition-colors shrink-0 cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {fileError && (
              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                {fileError}
              </p>
            )}

            {/* User-Controlled Summary Points, Target Language & Evaluation Basis Section */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3.5">
              {/* Summary Points Selector (1 to 10) */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="summary-point-count-select"
                  className="text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Summary points
                </label>
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 5, 7, 10].map((preset) => {
                    const isActive = summaryPointCount === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onSummaryPointCountChange(preset)}
                        className={`px-2 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isActive
                            ? "bg-slate-900 dark:bg-blue-600 text-white font-medium"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                  <select
                    id="summary-point-count-select"
                    value={summaryPointCount}
                    onChange={(e) =>
                      onSummaryPointCountChange(Number(e.target.value))
                    }
                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs font-mono tabular-nums text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "pt" : "pts"}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Multi-Language Auto-Translation & Summarization Selector */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="output-language-select"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  <Languages className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Output language</span>
                </label>

                <select
                  id="output-language-select"
                  value={targetLanguage}
                  onChange={(e) => onTargetLanguageChange(e.target.value)}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-600/30 max-w-[220px]"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Evaluation Basis Multi-Select */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    Evaluation basis
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowCustomBasisInput((prev) => !prev)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Custom basis</span>
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {EVALUATION_BASIS_OPTIONS.map((opt) => {
                    const isSelected = selectedEvaluationBases.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onToggleEvaluationBasis(opt.id)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isSelected
                            ? "bg-blue-50 dark:bg-blue-950/40 border-blue-600/60 text-blue-700 dark:text-blue-300"
                            : "bg-slate-50/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {(showCustomBasisInput || customEvaluationBasis) && (
                  <input
                    type="text"
                    value={customEvaluationBasis}
                    onChange={(e) => onCustomEvaluationBasisChange(e.target.value)}
                    placeholder="Enter custom evaluation basis..."
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-3 py-1.5 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                  />
                )}
              </div>

              {/* Optional Role/Focus Filter */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowFocusInput((prev) => !prev)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span>
                    {showFocusInput || focusHint
                      ? "Hide focus filter"
                      : "Add optional role or focus filter"}
                  </span>
                </button>

                {(showFocusInput || focusHint) && (
                  <div className="mt-2">
                    <label htmlFor="focus-hint-input" className="sr-only">
                      Optional role or focus filter
                    </label>
                    <input
                      id="focus-hint-input"
                      type="text"
                      value={focusHint}
                      onChange={(e) => onFocusHintChange(e.target.value)}
                      placeholder="Optional extraction focus or role filter"
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 px-3.5 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-600/30 focus:border-blue-600"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Primary Action Footer */}
          <div className="px-5 py-4 sm:px-6 bg-slate-50/60 dark:bg-slate-950/40 rounded-b-xl flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {summaryPointCount}{" "}
              {summaryPointCount === 1 ? "pt" : "pts"} ·{" "}
              {targetLanguage === "Auto" ? "Auto lang" : targetLanguage} ·{" "}
              {Math.max(1, activeBasisTotal)}{" "}
              {Math.max(1, activeBasisTotal) === 1 ? "basis" : "bases"}
            </p>

            <button
              type="button"
              disabled={!canSubmitExtraction}
              onClick={onExtract}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 dark:disabled:text-slate-500 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed tabular-nums"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>
                    {batchProgress
                      ? `Batch (${batchProgress.completed}/${batchProgress.total})...`
                      : "Evaluating & Extracting..."}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {isBatchUploadActive
                      ? `Extract Batch (${uploadedFiles.length})`
                      : "Extract & Evaluate"}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </section>
  );
};
