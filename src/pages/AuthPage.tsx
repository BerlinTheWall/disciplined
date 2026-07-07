import { useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";

import { ApiError } from "@/lib/api";
import { tap } from "@/lib/motion";
import { useAuthStore } from "@/store/authStore";
import { useProfileStore } from "@/store/profileStore";

type Mode = "login" | "signup";

const inputClass =
  "w-full bg-surface-raised rounded-xl px-4 py-3 text-fg placeholder:text-fg-faint outline-none";

export default function AuthPage() {
  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const setProfileName = useProfileStore((s) => s.setName);

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignup = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (isSignup && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      if (isSignup) {
        await register(email.trim(), password, name.trim());
        if (name.trim()) setProfileName(name.trim());
      } else {
        await login(email.trim(), password);
      }
      // Success: the auth gate in main.tsx swaps this page out for the app.
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Can't reach the server — is the backend running?");
      setBusy(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-fg">Disciplined</h1>
          <p className="text-sm text-fg-faint mt-2">
            {isSignup ? "Create your account to get started" : "Welcome back — log in to continue"}
          </p>
        </div>

        {/* Login / Sign up toggle */}
        <div className="flex items-center bg-surface-raised rounded-xl p-1 mb-6">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className="relative flex-1 py-2 rounded-lg text-sm font-medium"
            >
              {mode === m && (
                <motion.div
                  layoutId="authToggle"
                  className="absolute inset-0 bg-surface rounded-lg shadow-sm"
                />
              )}
              <span className={`relative z-10 ${mode === m ? "text-fg" : "text-fg-faint"}`}>
                {m === "login" ? "Log in" : "Sign up"}
              </span>
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-3">
          {isSignup && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              className={inputClass}
            />
          )}
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
          />
          <div className="relative">
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignup ? "Password (min. 8 characters)" : "Password"}
              type={showPassword ? "text" : "password"}
              required
              autoComplete={isSignup ? "new-password" : "current-password"}
              className={`${inputClass} pr-12`}
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

          {error && <p className="text-sm text-red-400 px-1">{error}</p>}

          <motion.button
            type="submit"
            whileTap={tap}
            disabled={busy}
            className="w-full bg-fg text-fg-inverse rounded-xl py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy && <LoaderCircle size={18} className="animate-spin" />}
            {isSignup ? "Create account" : "Log in"}
          </motion.button>
        </form>
      </div>
    </div>
  );
}
