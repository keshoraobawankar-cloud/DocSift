import React, { useState } from "react";
import { AlertCircle, Globe, Loader2, Moon, Sun } from "lucide-react";
import { ALL_COUNTRIES, CountryOption } from "../utils/countries";

interface AuthScreenProps {
  isDark: boolean;
  onToggleTheme: () => void;
  selectedCountry: CountryOption;
  onSelectCountry: (country: CountryOption) => void;
  defaultSummaryPoints: number;
  onChangeDefaultSummaryPoints: (points: number) => void;
  onAuthenticateWithGoogle: (mode: "login" | "signup") => Promise<void>;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  isDark,
  onToggleTheme,
  selectedCountry,
  onSelectCountry,
  defaultSummaryPoints,
  onChangeDefaultSummaryPoints,
  onAuthenticateWithGoogle,
}) => {
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleAction = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await onAuthenticateWithGoogle(authMode);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Authentication could not be completed.";
      if (msg.includes("popup-closed-by-user")) {
        setAuthError("Sign-in window was closed before completing authentication.");
      } else {
        setAuthError(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Minimal Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-8">
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0">
            Distill
          </span>

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

      {/* Centered Log In / Sign Up Card */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
        <section
          aria-label="Account Authentication"
          className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 sm:p-8"
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

          {authError && (
            <div
              role="alert"
              className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <span>{authError}</span>
            </div>
          )}

          <div className="mt-6">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => void handleGoogleAction()}
              className="w-full inline-flex items-center justify-center gap-2.5 px-4 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:cursor-not-allowed"
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
          </div>
        </section>
      </main>
    </div>
  );
};
