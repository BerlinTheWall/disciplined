import { useCallback, useLayoutEffect, useState } from "react";
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

// Deliberately tweens, not springs: a spring on the height overshoots and
// wobbles against the fade, which is most of what made this feel unsteady.
// Exit is quicker than enter so the gap between the two forms is barely there.
const EASE = [0.32, 0.72, 0, 1] as const;
const EXIT_S = 0.14;
const ENTER_S = 0.22;

// A short directional slide, in the spirit of App.tsx's pageVariants but
// sequenced rather than overlapped: the two forms have different fields in
// different places, so showing both at once just reads as a jumble. The old
// one leaves first, the new one follows.
const formVariants = {
  enter: (d: number) => ({ x: d > 0 ? 16 : -16, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: { duration: ENTER_S, ease: EASE } },
  exit: (d: number) => ({
    x: d > 0 ? -16 : 16,
    opacity: 0,
    transition: { duration: EXIT_S, ease: "easeIn" as const },
  }),
};

export default function AuthPage() {
  const theme = useThemeStore((s) => s.theme);
  const [error, setError] = useAuthErrorStore(useShallow((state) => [state.error, state.setError]));

  // [mode, direction] — direction drives which way the forms slide, matching
  // App.tsx's page switcher.
  const [[mode, dir], setMode] = useState<[Mode, number]>(["login", 0]);

  const isSignup = mode === "signup";

  function switchMode() {
    setMode(isSignup ? ["login", -1] : ["signup", 1]);
    setError(null);
  }

  // Sign up is a good deal taller than login, so swapping the forms alone would
  // snap everything below them (the divider, provider buttons, the switch) to a
  // new position mid-slide. Animating a measured height instead keeps the whole
  // column moving as one. Measured live rather than via a CSS transition on
  // `auto`, which doesn't animate, and the observer keeps it honest when a
  // validation message expands the active form.
  const [formHeight, setFormHeight] = useState<number>();

  // Tracked as state off the ref callback rather than measured in an effect
  // keyed on `mode`: under mode="wait" the incoming form doesn't mount until
  // the outgoing one has finished leaving, so at the moment `mode` changes
  // there is no node to measure yet. The ref firing is the only reliable
  // signal that the new form exists. Unmounts pass null, which we ignore —
  // the next form registers a beat later, and dropping the height in between
  // would collapse the column.
  const [formNode, setFormNode] = useState<HTMLDivElement | null>(null);
  const registerForm = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    setFormNode(node);
    // Measured here, in the same commit the form mounts, so the wrapper is
    // already the right size on the frame the incoming form first paints.
    setFormHeight(node.offsetHeight);
  }, []);

  useLayoutEffect(() => {
    if (!formNode) return;
    // Keeps the height honest when the active form grows — a validation
    // message appearing under a field, say.
    const observer = new ResizeObserver(() => setFormHeight(formNode.offsetHeight));
    observer.observe(formNode);
    return () => observer.disconnect();
  }, [formNode]);

  return (
    <>
      {/* h-dvh (not h-screen/100vh): in iOS standalone mode 100vh is taller than
          the truly visible viewport, so the scroll container itself overflows the
          screen and its last rows (the log in / create account switch) end up
          clipped by body's overflow:hidden with no way to scroll to them. The
          bottom padding adds the safe-area inset so the switch also clears the
          home indicator. */}
      <div
        className="h-dvh overflow-y-auto px-6"
        style={{
          paddingTop: "calc(40px + env(safe-area-inset-top))",
          paddingBottom: "calc(40px + env(safe-area-inset-bottom))",
        }}
      >
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

          {/* mode="wait" — the outgoing form is fully gone before the incoming
              one starts, so the two sets of fields never share the screen. The
              wrapper holds the old height through the gap (formHeight only
              updates once the new form has mounted), then resizes underneath
              the incoming fade. */}
          <motion.div
            animate={{ height: formHeight }}
            transition={{ duration: ENTER_S, ease: EASE }}
            className="relative overflow-hidden"
          >
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={mode}
                custom={dir}
                ref={registerForm}
                variants={formVariants}
                initial="enter"
                animate="center"
                exit="exit"
              >
                {FORMS[mode]}
              </motion.div>
            </AnimatePresence>
          </motion.div>
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

          {/* Crossfaded rather than swapped, so the line doesn't flip text
              mid-slide. Fixed-height box because the outgoing copy is gone
              before the incoming one arrives, and an empty line would
              otherwise collapse the row. */}
          <div className="relative h-5">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={mode}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.12, ease: "easeOut" }}
                className="absolute inset-x-0 top-0 text-center text-sm text-fg-faint"
              >
                {isSignup ? "Already have an account? " : "Not registered yet? "}
                <button
                  type="button"
                  onClick={switchMode}
                  className="font-semibold text-fg underline cursor-pointer"
                >
                  {isSignup ? "Log in" : "Create account"}
                </button>
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>

      <VerifyEmailSheet />
    </>
  );
}
