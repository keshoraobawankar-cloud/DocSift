import React, { useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Lock,
  Moon,
  ShieldAlert,
  Sun,
} from "lucide-react";
import { ALL_COUNTRIES, CountryOption } from "../utils/countries";
import firebaseConfig from "../../firebase-applet-config.json";

interface AuthScreenProps {
  isDark: boolean;
  onToggleTheme: () => void;
  selectedCountry: CountryOption;
  onSelectCountry: (country: CountryOption) => void;
  defaultSummaryPoints: number;
  onChangeDefaultSummaryPoints: (points: number) => void;
  onAuthenticateWithGoogle: (mode: "login" | "signup") => Promise<void>;
  onContinueAsGuest: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  isDark,
  onToggleTheme,
  selectedCountry,
  onSelectCountry,
  defaultSummaryPoints,
  onChangeDefaultSummaryPoints,
  onAuthenticateWithGoogle,
  onContinueAsGuest,
}) => {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  const currentHostname = useMemo(() => {
    if (typeof window !== "undefined" && window.location.hostname) {
      return window.location.hostname;
    }
    return "ais-dev-vqd2mbjzi2l3uvxuxej7jv-713927283873.asia-northeast1.run.app";
  }, []);

  const projectId = firebaseConfig.projectId || "curious-bank-k01dl";
  const consoleAuthSettingsUrl = `https://console.firebase.google.com/project/${projectId}/authentication/settings`;

  const isUnauthorizedDomain = useMemo(() => {
    if (!authError) return false;
    const lower = authError.toLowerCase();
    return (
      lower.includes("unauthorized-domain") ||
      lower.includes("auth/unauthorized-domain") ||
      lower.includes("not authorized to use firebase authentication")
    );
  }, [authError]);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDomain(text);
      setTimeout(() => setCopiedDomain(null), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedDomain(text);
      setTimeout(() => setCopiedDomain(null), 2000);
    }
  };

  const handleGoogleAction = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await onAuthenticateWithGoogle(authMode);
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code?: unknown }).code)
          : "";
      const rawMsg =
        err instanceof Error ? err.message : "Authentication could not be completed.";

      if (code === "auth/unauthorized-domain" || rawMsg.includes("unauthorized-domain")) {
        setAuthError(
          "Firebase: Error (auth/unauthorized-domain). This application domain is not authorized in your Firebase project console."
        );
      } else if (code === "auth/popup-closed-by-user" || rawMsg.includes("popup-closed-by-user")) {
        setAuthError("Sign-in window was closed before completing authentication.");
      } else {
        setAuthError(rawMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-8">
          <div className="flex items-center gap-3">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
              Distill
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900 font-medium hidden sm:inline-flex items-center gap-1">
              Smart Mail &amp; Document Action Extractor
            </span>
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isDark ? (
              <>
                <Sun className="w-3.5 h-3.5" />
                <span>Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" />
                <span>Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <section
          aria-label="Account Authentication"
          className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8 shadow-xs"
        >
          {/* Segmented Log In / Sign Up Switcher */}
          <div
            role="tablist"
            aria-label="Authentication mode"
            className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg mb-6"
          >
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "login"}
              onClick={() => {
                setAuthMode("login");
                setAuthError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                authMode === "login"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Log In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={authMode === "signup"}
              onClick={() => {
                setAuthMode("signup");
                setAuthError(null);
              }}
              className={`py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                authMode === "signup"
                  ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Sign Up
            </button>
          </div>

          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {authMode === "login"
              ? "Log in to your workspace"
              : "Create your Distill account"}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
            {authMode === "login"
              ? "Access your saved email evaluations, extracted tasks, calendar invites, and attachments."
              : "Set your country and summary preferences to save all extracted records to your account."}
          </p>

          {authMode === "signup" && (
            <div className="mt-5 space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
              <div>
                <label
                  htmlFor="signup-country-select"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Country
                </label>
                <div className="relative">
                  <Globe className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    id="signup-country-select"
                    value={selectedCountry.code}
                    onChange={(e) => {
                      const found = ALL_COUNTRIES.find(
                        (c) => c.code === e.target.value
                      );
                      if (found) onSelectCountry(found);
                    }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 pl-9 pr-3 py-2 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                  >
                    {ALL_COUNTRIES.map((country) => (
                      <option
                        key={country.code}
                        value={country.code}
                        className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      >
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="signup-summary-points"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  Default summary points
                </label>
                <select
                  id="signup-summary-points"
                  value={defaultSummaryPoints}
                  onChange={(e) =>
                    onChangeDefaultSummaryPoints(Number(e.target.value))
                  }
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 px-3 py-2 text-xs text-slate-900 dark:text-slate-100 tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-600/30"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                    <option
                      key={num}
                      value={num}
                      className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                    >
                      {num} {num === 1 ? "point" : "points"}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Dedicated Solution Box for auth/unauthorized-domain */}
          {isUnauthorizedDomain ? (
            <div
              role="alert"
              className="mt-5 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/80 text-amber-900 dark:text-amber-200 text-xs space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                    Firebase: Domain Not Authorized (auth/unauthorized-domain)
                  </h3>
                  <p className="mt-1 text-amber-800 dark:text-amber-300 leading-relaxed">
                    Firebase Authentication blocks Google Sign-In popups until your current application domain is registered in your project&apos;s <strong>Authorized domains</strong> list.
                  </p>
                </div>
              </div>

              {/* Current Domain Copy Box */}
              <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="block text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    Domain to Authorize:
                  </span>
                  <code className="block font-mono text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                    {currentHostname}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopy(currentHostname)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-200 transition-colors shrink-0 cursor-pointer"
                  title="Copy domain to clipboard"
                >
                  {copiedDomain === currentHostname ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Domain</span>
                    </>
                  )}
                </button>
              </div>

              {/* Step-by-Step Instructions */}
              <div className="space-y-1.5 text-amber-900 dark:text-amber-200/90 pl-1">
                <p className="font-medium">How to fix in 30 seconds:</p>
                <ol className="list-decimal pl-4 space-y-1 leading-normal text-amber-800 dark:text-amber-300">
                  <li>
                    Open Firebase Console Settings:{" "}
                    <a
                      href={consoleAuthSettingsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 underline hover:text-blue-700"
                    >
                      <span>Console &gt; Auth &gt; Settings</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>Scroll down to the <strong>Authorized domains</strong> section and click <strong>Add domain</strong>.</li>
                  <li>Paste <code className="font-mono bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded text-[11px]">{currentHostname}</code> and click <strong>Save</strong>.</li>
                  <li>Click <strong>Retry Google Sign-In</strong> below.</li>
                </ol>
              </div>

              {/* Action Buttons inside notice */}
              <div className="pt-2 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleGoogleAction()}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium bg-amber-600 hover:bg-amber-700 text-white text-xs transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Retrying...</span>
                    </>
                  ) : (
                    <span>Retry Google Sign-In</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={onContinueAsGuest}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-slate-800 dark:text-slate-200 hover:bg-amber-100/50 dark:hover:bg-slate-800 text-xs transition-colors cursor-pointer"
                >
                  <span>Continue as Guest</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : authError ? (
            <div
              role="alert"
              className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{authError}</span>
            </div>
          ) : null}

          {/* Primary Action Button */}
          {!isUnauthorizedDomain && (
            <div className="mt-6 space-y-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleGoogleAction()}
                className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed shadow-xs"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4 shrink-0"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fill="currentColor"
                        d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81Z"
                      />
                    </svg>
                    <span>
                      {authMode === "login"
                        ? "Log In with Google"
                        : "Sign Up with Google"}
                    </span>
                  </>
                )}
              </button>

              {/* Instant Guest / Local Workspace Alternative */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={onContinueAsGuest}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                >
                  <Lock className="w-3 h-3 text-slate-400" />
                  <span>Or continue without sign-in (Local Workspace)</span>
                  <ArrowRight className="w-3 h-3 ml-0.5" />
                </button>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  Processes documents &amp; generates summaries privately in your browser.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
