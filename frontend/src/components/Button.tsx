import { type PropsWithChildren } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";
import { LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

type ButtonProps = HTMLMotionProps<"button"> & {
  loading?: boolean;
};
// const ACCENT = "#6d46df";

export const Button = ({
  children,
  loading,
  disabled,
  className,
  variant = "default",
  ...rest
}: PropsWithChildren<ButtonProps> & VariantProps<typeof buttonVariants>) => {
  return (
    <motion.button
      disabled={loading || disabled}
      // style={{ backgroundColor: ACCENT, boxShadow: `0 5px 24px -10px ${ACCENT}` }}
      className={cn(buttonVariants({ variant, className }))}
      {...rest}
    >
      {loading && <LoaderCircle size={18} className="animate-spin" />}
      {children}
    </motion.button>
  );
};

const buttonVariants = cva(
  "w-full rounded-2xl py-4 font-semibold flex items-center justify-center gap-2 disabled:opacity-60 mt-4",
  {
    variants: {
      variant: {
        default: "bg-[#6d46df] text-white",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);
