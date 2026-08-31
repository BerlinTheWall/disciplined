/* eslint-disable prettier/prettier */
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import logo from "@/assets/logo.svg";
import ForgotPasswordSheet from "@/components/auth/ForgotPasswordSheet";
import VerifyEmailSheet from "@/components/auth/VerifyEmailSheet";
import Collapse from "@/components/Collapse";
import { ApiError } from "@/lib/api";
import { spring, tap } from "@/lib/motion";
import { useAuthStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";

type Mode = "login" | "signup";

// Same violet the onboarding wizard uses for its "wake up" accent — keeps the
// hero glow on-brand instead of introducing a new color.
const ACCENT = "#6d46df";

const fieldClass =
  "w-full bg-surface rounded-xl border border-border-input px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint outline-none focus:border-border-focus transition-colors";

// Google's four-color "G" glyph — the one brand mark here that isn't
// monochrome, so it can't reuse currentColor like the Apple glyph below.
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <path
        fill="#4285F4"
        d="M19.6 10.23c0-.68-.06-1.33-.17-1.96H10v3.71h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.89-1.74 2.98-4.3 2.98-7.27Z"
      />
      <path
        fill="#34A853"
        d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.05.96-3.4.96-2.6 0-4.8-1.76-5.59-4.12H1.06v2.59A10 10 0 0 0 10 20Z"
      />
      <path
        fill="#FBBC05"
        d="M4.41 11.92a5.99 5.99 0 0 1 0-3.84V5.49H1.06a10 10 0 0 0 0 9.02l3.35-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M10 3.96c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.96 9.96 0 0 0 10 0 10 10 0 0 0 1.06 5.49l3.35 2.6c.79-2.37 2.99-4.13 5.59-4.13Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 384 512" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

export default function AuthPage() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const theme = useThemeStore((s) => s.theme);

  const [mode, setMode] = useState<Mode>("login");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  // Set on a successful signup (account created, needs its code) or when a
  // login attempt comes back 403 (account exists but was never verified).
  // Non-null drives the sheet open; which case it was just changes the copy.
  const [verifyFor, setVerifyFor] = useState<{ email: string; reason: "signup" | "login" } | null>(
    null
  );

  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (isSignup && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (isSignup && password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        await register(email.trim(), password, firstName.trim(), lastName.trim());
        setVerifyFor({ email: email.trim(), reason: "signup" });
      } else {
        await login(email.trim(), password);
        // Success: the auth gate in main.tsx swaps this page out for the app.
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        // Correct credentials, unverified account — see routers/auth.py.
        setVerifyFor({ email: email.trim(), reason: "login" });
      } else if (err instanceof ApiError) {
        // Network/offline failures land here too now — api.ts's request()
        // always throws an ApiError with an already-specific message
        // (offline vs. unreachable vs. a real server error), so there's
        // nothing left to guess at in this branch.
        setError(err.message);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="h-screen overflow-y-auto px-6 py-10">
      <div className="w-full max-w-sm mx-auto">
        {/* Hero */}
        <div className="flex justify-center mb-6">
          <div className="relative flex items-center justify-center">
            <div
              className="absolute w-40 h-40 rounded-full blur-2xl opacity-30"
              style={{ backgroundColor: ACCENT }}
            />
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={spring.gentle}
              className="relative w-32 h-32 rounded-full shadow-card flex items-center justify-center"
            >
              <motion.img
                src={logo}
                alt=""
                animate={{ rotate: 360 }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                className={`w-24 h-24 object-contain ${theme !== "dark" ? "brightness-0" : ""}`}
              />
            </motion.div>
          </div>
        </div>

        {/* Heading — the "Welcome to Disciplined" wordmark collapses away in
            signup (its height animating to 0 is what carries the fields up
            smoothly instead of them jumping), leaving just the mode label. */}
        <div className="mb-6 overflow-hidden">
          <Collapse open={!isSignup} className="pb-8">
            <p className="text-[15px] text-fg-faint">Welcome to</p>
            <h1 className="text-[34px] leading-tight font-bold text-fg tracking-tight">
              Disciplined
            </h1>
          </Collapse>
          <AnimatePresence mode="wait">
            <motion.p
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.1 }}
              className="text-2xl font-semibold text-fg-muted"
            >
              {isSignup ? "Sign up" : "Login"}
            </motion.p>
          </AnimatePresence>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Collapse open={isSignup} outerClassName="-mb-4" className="pb-4">
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-semibold text-fg mb-1.5">First name</label>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                  autoComplete="given-name"
                  required={isSignup}
                  className={fieldClass}
                />
              </div>
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-semibold text-fg mb-1.5">Last name</label>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                  autoComplete="family-name"
                  required={isSignup}
                  className={fieldClass}
                />
              </div>
            </div>
          </Collapse>

          <div>
            <label className="block text-sm font-semibold text-fg mb-1.5">Email address</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              type="email"
              required
              autoComplete="email"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-fg mb-1.5">Password</label>
            <div className="relative">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isSignup ? "Min. 8 characters" : "Your password"}
                type={showPassword ? "text" : "password"}
                required
                autoComplete={isSignup ? "new-password" : "current-password"}
                className={`${fieldClass} pr-12`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-fg-faint"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <Collapse open={!isSignup} className="pt-1.5">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  className="text-sm font-medium text-fg-muted"
                >
                  Forgot password?
                </button>
              </div>
            </Collapse>
          </div>

          <Collapse open={isSignup} outerClassName="-mb-4" className="pb-4">
            <div>
              <label className="block text-sm font-semibold text-fg mb-1.5">Confirm password</label>
              <div className="relative">
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  type={showConfirmPassword ? "text" : "password"}
                  required={isSignup}
                  autoComplete="new-password"
                  className={`${fieldClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-fg-faint"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </Collapse>

          <AnimatePresence initial={false}>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="text-sm text-red-400 px-1 overflow-hidden"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <motion.button
            type="submit"
            whileTap={tap}
            disabled={busy}
            style={{ backgroundColor: ACCENT, boxShadow: `0 5px 24px -10px ${ACCENT}` }}
            className="w-full text-white rounded-2xl py-4 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 mt-4"
          >
            {busy && <LoaderCircle size={18} className="animate-spin" />}
            {isSignup ? "Create account" : "Login"}
          </motion.button>
        </form>

        {/* Not wired up yet — no OAuth provider is configured on the backend. */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border-strong" />
          <span className="text-xs text-fg-faint shrink-0">Or continue with</span>
          <div className="flex-1 h-px bg-border-strong" />
        </div>

        <div className="flex items-center justify-center gap-4 mb-7">
          <motion.button
            type="button"
            whileTap={tap}
            className="w-14 h-14 rounded-full border border-border-strong bg-surface flex items-center justify-center"
            aria-label="Continue with Google"
          >
            <GoogleIcon />
          </motion.button>
          <motion.button
            type="button"
            whileTap={tap}
            className="w-14 h-14 rounded-full border border-border-strong bg-surface flex items-center justify-center text-fg"
            aria-label="Continue with Apple"
          >
            <AppleIcon />
          </motion.button>
        </div>

        <p className="text-center text-sm text-fg-faint">
          {isSignup ? "Already have an account? " : "Not registered yet? "}
          <button
            type="button"
            onClick={() => switchMode(isSignup ? "login" : "signup")}
            className="font-semibold text-fg"
          >
            {isSignup ? "Log in" : "Create account"}
          </button>
        </p>
      </div>

      <ForgotPasswordSheet
        isOpen={forgotOpen}
        onClose={() => setForgotOpen(false)}
        initialEmail={email}
      />

      <VerifyEmailSheet
        isOpen={!!verifyFor}
        onClose={() => setVerifyFor(null)}
        email={verifyFor?.email ?? ""}
        message={
          verifyFor?.reason === "login" ? "This account hasn't been verified yet." : undefined
        }
        // Signup already triggered a send from register() itself; a blocked
        // login hasn't sent anything yet, so this is what actually gets a
        // code moving instead of the sheet just sitting there empty.
        autoSendOnOpen={verifyFor?.reason === "login"}
      />
    </div>
  );
}
