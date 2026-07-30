import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { LoaderCircle } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { ApiError } from "@/lib/api";
import { tap } from "@/lib/motion";
import { useAuthStore } from "@/store/authStore";

const fieldClass =
  "w-full bg-surface rounded-xl border border-border-input px-4 py-3 text-[15px] text-fg placeholder:text-fg-faint outline-none focus:border-border-focus transition-colors";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  email: string;
  message?: string;
  // Signup already gets a code from register() itself — this is only for the
  // blocked-login case, where nothing has been sent yet and the sheet would
  // otherwise open on an empty code with no way to know that.
  autoSendOnOpen?: boolean;
}

// Verification is a hard gate on login (see routers/auth.py) — this sheet is
// the one way in for an unverified account, reached either right after
// signup or when a login attempt comes back 403. Success logs the user
// straight in (verifyEmail returns a fresh token), same as ForgotPasswordSheet.
export default function VerifyEmailSheet({
  isOpen,
  onClose,
  email,
  message,
  autoSendOnOpen,
}: Props) {
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendVerification = useAuthStore((s) => s.resendVerification);

  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Adjust state during render (rather than in the effect below) for the
  // synchronous "about to auto-send" reset — the effect is left to do only
  // the actual async call and its own promise-callback state updates, which
  // is the part React's rules actually want inside an effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen && autoSendOnOpen) {
      setError(null);
      setBusy(true);
    }
  }

  useEffect(() => {
    if (!isOpen || !autoSendOnOpen) return;
    resendVerification(email)
      .then(setNotice)
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
      })
      .finally(() => setBusy(false));
  }, [isOpen, autoSendOnOpen, email, resendVerification]);

  function close() {
    onClose();
    window.setTimeout(() => {
      setCode("");
      setNotice(null);
      setError(null);
      setBusy(false);
    }, 250); // after the sheet's exit animation
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6) return;
    setError(null);
    setBusy(true);
    try {
      await verifyEmail(email, code);
      close();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      setNotice(await resendVerification(email));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={close} className="bg-surface px-6 pt-6 pb-8">
      <div className="w-10 h-1 rounded-full bg-border-strong mx-auto mb-5" />
      <h2 className="text-xl font-bold text-fg mb-1.5">Verify your email</h2>
      <p className="text-sm text-fg-faint mb-5">
        {message ?? `Enter the code we sent to ${email}`}
      </p>
      <form onSubmit={submit}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          className={`${fieldClass} tracking-[0.3em] text-center`}
        />
        {notice && <p className="text-sm text-fg-muted mt-2">{notice}</p>}
        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
        <motion.button
          type="submit"
          whileTap={tap}
          disabled={busy || code.length !== 6}
          className="w-full bg-fg text-fg-inverse rounded-2xl py-3.5 font-semibold flex items-center justify-center gap-2 mt-5 disabled:opacity-60"
        >
          {busy && <LoaderCircle size={18} className="animate-spin" />}
          Verify
        </motion.button>
        <button
          type="button"
          onClick={resend}
          disabled={busy}
          className="w-full text-center text-sm font-medium text-fg-muted mt-4 disabled:opacity-60"
        >
          Resend code
        </button>
      </form>
    </BottomSheet>
  );
}
