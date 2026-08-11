import { AnimatePresence, motion } from "framer-motion";
import { Check, X as XIcon } from "lucide-react";

import { spring } from "@/lib/motion";
import { useToastStore } from "@/store/toastStore";

// Mounted once at the app root — floats a single auto-dismissing
// confirmation above the bottom nav. See toastStore.ts for how to trigger one.
export default function ToastHost() {
  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed inset-x-3 z-[80] flex justify-center bottom-32 pointer-events-none">
      <AnimatePresence>
        {message && (
          <motion.div
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={spring.snappy}
            role="status"
            onClick={dismiss}
            className="pointer-events-auto flex items-center gap-2.5 max-w-[90vw] px-4 py-3 rounded-2xl shadow-xl border border-border-strong bg-surface cursor-pointer"
          >
            {kind === "success" ? (
              <Check size={16} className="text-emerald-500 shrink-0" />
            ) : (
              <XIcon size={16} className="text-red-500 shrink-0" />
            )}
            <span className="text-sm font-medium text-fg">{message}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
