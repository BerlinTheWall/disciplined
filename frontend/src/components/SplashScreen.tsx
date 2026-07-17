import { motion } from "framer-motion";

import logo from "@/assets/logo.svg";
import { useThemeStore } from "@/store/themeStore";

// Cold-start splash: the orbit logo spinning over the app's ambient background
// with the wordmark beneath. Rendered only on the WebView's initial load (a
// resume from the background doesn't reload the page, so it never reappears
// mid-session); Root unmounts it via AnimatePresence for the fade-out.
export default function SplashScreen() {
  const theme = useThemeStore((s) => s.theme);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5"
      style={{ background: "var(--app-bg)" }}
      exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeOut" } }}
    >
      <motion.img
        src={logo}
        alt=""
        className={`w-20 h-20 object-contain ${theme === "light" ? "brightness-0" : ""}`}
        animate={{ rotate: 360 }}
        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
      />
      <motion.span
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.35, ease: "easeOut" }}
        className="text-2xl font-extrabold tracking-wide text-fg"
      >
        Disciplined
      </motion.span>
    </motion.div>
  );
}
