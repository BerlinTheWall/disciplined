import { AnimatePresence, motion } from "framer-motion";

// Wraps a conditional block so it expands/collapses smoothly instead of
// popping in and out with a sudden layout jump. Children unmount when closed.
export default function Collapse({
  open,
  children,
  className,
  outerClassName,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  // For items inside a gap-N stack: pass a negative bottom margin here (and
  // matching padding via className) so the parent gap collapses along with
  // the content instead of jumping away on unmount.
  outerClassName?: string;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className={`overflow-hidden ${outerClassName ?? ""}`}
        >
          <div className={className}>{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
