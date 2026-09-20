import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useShallow } from "zustand/shallow";

import logo from "@/assets/logo.svg";
import LoginForm from "@/components/auth/LoginForm";
import SignUpForm from "@/components/auth/SignUpForm";
import VerifyEmailSheet from "@/components/auth/VerifyEmailSheet";
import { AppleLogo, GoogleLogo } from "@/components/icons/ProviderLogos";
import { spring, tap } from "@/lib/motion";
import { useAuthErrorStore } from "@/store/authStore";
import { useThemeStore } from "@/store/themeStore";

type Mode = "login" | "signup";

const ACCENT = "#6d46df";

const FORMS: Record<Mode, React.ReactNode> = {
  login: <LoginForm />,
  signup: <SignUpForm />,
};

export default function AuthPage() {
  const theme = useThemeStore((s) => s.theme);
  const [error, setError] = useAuthErrorStore(useShallow((state) => [state.error, state.setError]));

  const [mode, setMode] = useState<Mode>("login");

  const isSignup = mode === "signup";

  function switchMode() {
    setMode(isSignup ? "login" : "signup");
    setError(null);
  }

  return (
    <>
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
                  alt="disciplined logo"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
                  className={`w-24 h-24 object-contain ${theme !== "dark" ? "brightness-0" : ""}`}
                />
              </motion.div>
            </div>
          </div>

          <div className="mb-6 overflow-hidden">
            <p className="text-[15px] text-fg-faint">Welcome to</p>
            <h1 className="text-[34px] leading-tight font-bold text-fg tracking-tight">
              Disciplined
            </h1>
          </div>

          {FORMS[mode]}
          <AnimatePresence initial={false}>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.15 }}
                className="text-sm text-red-400 px-1 overflow-hidden mt-3"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

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
              <GoogleLogo size={20} />
            </motion.button>
            <motion.button
              type="button"
              whileTap={tap}
              className="w-14 h-14 rounded-full border border-border-strong bg-surface flex items-center justify-center text-fg"
              aria-label="Continue with Apple"
            >
              <AppleLogo size={22} />
            </motion.button>
          </div>

          <p className="text-center text-sm text-fg-faint">
            {isSignup ? "Already have an account? " : "Not registered yet? "}
            <button
              type="button"
              onClick={switchMode}
              className="font-semibold text-fg underline cursor-pointer"
            >
              {isSignup ? "Log in" : "Create account"}
            </button>
          </p>
        </div>
      </div>

      <VerifyEmailSheet />
    </>
  );
}
