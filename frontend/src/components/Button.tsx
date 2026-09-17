import { type PropsWithChildren } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

type ButtonProps = HTMLMotionProps<"button"> & {
  loading?: boolean;
};
const ACCENT = "#6d46df";

export const Button = ({
  children,
  loading,
  disabled,
  className,
  ...rest
}: PropsWithChildren<ButtonProps>) => {
  return (
    <motion.button
      disabled={loading || disabled}
      style={{ backgroundColor: ACCENT, boxShadow: `0 5px 24px -10px ${ACCENT}` }}
      className={cn(
        "w-full text-white rounded-2xl py-4 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 mt-4",
        className
      )}
      {...rest}
    >
      {loading && <LoaderCircle size={18} className="animate-spin" />}
      {children}
    </motion.button>
  );
};
