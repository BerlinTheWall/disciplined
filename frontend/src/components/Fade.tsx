import { AnimatePresence, motion } from "framer-motion";

interface FadeProps {
  activeKey: string | number;
  children: React.ReactNode;
  duration?: number;
  className?: string;
}

const Fade = ({ activeKey, children, duration = 0.2, className }: FadeProps) => {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration, ease: "easeInOut" }}
        className={className}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
};

export default Fade;
