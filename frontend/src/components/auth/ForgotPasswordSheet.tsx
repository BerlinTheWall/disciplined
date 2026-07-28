import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { ApiError } from "@/lib/api";
import { tap } from "@/lib/motion";
import { useAuthStore } from "@/store/authStore";

const fieldClass =
  "w-full bg-surface rounded-xl border border-border-input px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint outline-none focus:border-border-focus transition-colors";

type Step = "request" | "reset";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
}

// Two-step flow, both hitting the same email-code machinery the backend uses
// for verification: request a code by email, then submit the code + a new
// password in one shot. Success logs the user straight in (resetPassword
// returns a fresh token), so this sheet never has to hand back to a login
// form.
export default function ForgotPasswordSheet({ isOpen, onClose, initialEmail = "" }: Props) {
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const resetPassword = useAuthStore((s) => s.resetPassword);

  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The sheet mounts once and stays mounted (only its inner BottomSheet
  // toggles), so `initialEmail` would otherwise freeze at whatever was typed
  // before the very first open. Adjust state during render (React's
  // documented pattern for this, rather than an effect) each time `isOpen`
  // flips to true, so it picks up whatever's in the login field by then.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setEmail(initialEmail);
  }

  function resetLocalState() {
    setStep("request");
    setCode("");
    setNewPassword("");
    setNotice(null);
    setError(null);
    setBusy(false);
  }

  function close() {
    onClose();
    window.setTimeout(resetLocalState, 250); // after the sheet's exit animation
  }

  async function sendCode() {
    if (busy || !email.trim()) return;
    setError(null);
    // Not wrapped in a <form>/type="submit" like the login/signup fields
    // (this button just triggers a fetch), so the browser's native
    // type="email" check never runs here — catch it ourselves instead of
    // letting a malformed address reach the server as a 422.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    setBusy(true);
    try {
      const message = await forgotPassword(email.trim());
      setNotice(message);
      setStep("reset");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await resetPassword(email.trim(), code.trim(), newPassword);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
      setBusy(false);
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={close} className="bg-surface px-6 pt-6 pb-8">
      <div className="w-10 h-1 rounded-full bg-border-strong mx-auto mb-5" />
      {step === "request" ? (
        <>
          <h2 className="text-xl font-bold text-fg mb-1.5">Reset your password</h2>
          <p className="text-sm text-fg-faint mb-5">
            Enter your account email and we'll send you a code to reset your password.
          </p>
          <label className="block text-sm font-semibold text-fg mb-1.5">Email address</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            type="email"
            autoComplete="email"
            className={fieldClass}
          />
          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
          <motion.button
            type="button"
            whileTap={tap}
            disabled={busy || !email.trim()}
            onClick={sendCode}
            className="w-full bg-fg text-fg-inverse rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 mt-5 disabled:opacity-60"
          >
            {busy && <LoaderCircle size={18} className="animate-spin" />}
            Send reset code
          </motion.button>
        </>
      ) : (
        <form onSubmit={submitReset}>
          <h2 className="text-xl font-bold text-fg mb-1.5">Check your email</h2>
          <p className="text-sm text-fg-faint mb-5">{notice}</p>

          <label className="block text-sm font-semibold text-fg mb-1.5">Code</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            inputMode="numeric"
            autoComplete="one-time-code"
            className={`${fieldClass} tracking-[0.3em] text-center`}
          />

          <label className="block text-sm font-semibold text-fg mb-1.5 mt-4">New password</label>
          <div className="relative">
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
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

          {error && <p className="text-sm text-red-400 mt-2">{error}</p>}

          <motion.button
            type="submit"
            whileTap={tap}
            disabled={busy || code.length !== 6}
            className="w-full bg-fg text-fg-inverse rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 mt-5 disabled:opacity-60"
          >
            {busy && <LoaderCircle size={18} className="animate-spin" />}
            Reset password
          </motion.button>

          <button
            type="button"
            onClick={() => setStep("request")}
            className="w-full text-center text-sm font-medium text-fg-muted mt-4"
          >
            Use a different email
          </button>
        </form>
      )}
    </BottomSheet>
  );
}
