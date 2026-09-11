import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Crown, Lock, Sparkles, Sprout, X, type LucideIcon } from "lucide-react";

import BottomSheet from "./BottomSheet";
import type { SubscriptionTier } from "@/lib/api";
import { tap } from "@/lib/motion";
import { TIER_INFO, tierOf, TIERS } from "@/lib/tiers";
import { useAuthStore } from "@/store/authStore";

const PLAN_ICONS: Record<SubscriptionTier, LucideIcon> = {
  free: Sprout,
  plus: Sparkles,
  pro: Crown,
};

// One plan: its name, then what it includes — "Everything in <plan below>"
// plus what it adds. Plans at or below the user's read as included (ticks in
// the plan colour); plans above read as locked (padlocks, faint).
function PlanCard({ tier, current }: { tier: SubscriptionTier; current: SubscriptionTier }) {
  const info = TIER_INFO[tier];
  const Icon = PLAN_ICONS[tier];
  const index = TIERS.indexOf(tier);
  const isCurrent = tier === current;
  const unlocked = index <= TIERS.indexOf(current);
  const features = [
    ...(index > 0 ? [`Everything in ${TIER_INFO[TIERS[index - 1]].label}`] : []),
    ...info.adds,
  ];

  return (
    <div
      className={`rounded-3xl bg-surface p-4 border ${isCurrent ? "" : "border-border"}`}
      style={
        isCurrent ? { borderColor: info.color, boxShadow: `0 0 0 1px ${info.color}` } : undefined
      }
    >
      <div className="flex items-center gap-3">
        <span
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${info.color}26`, color: info.color }}
        >
          <Icon size={18} />
        </span>
        <p className="flex-1 text-lg font-bold text-fg">{info.label}</p>
        {isCurrent && (
          // Text in fg, not the plan colour: gold/blue on a light tint is
          // too low-contrast to read in light mode.
          <span
            className="text-xs font-semibold text-fg rounded-full px-2.5 py-1"
            style={{ backgroundColor: `${info.color}33` }}
          >
            Current plan
          </span>
        )}
      </div>
      <ul className="mt-3 space-y-2">
        {features.map((feature) => (
          <li
            key={feature}
            className={`flex items-center gap-2.5 text-sm ${unlocked ? "text-fg-muted" : "text-fg-faint"}`}
          >
            {unlocked ? (
              <Check size={15} className="shrink-0" style={{ color: info.color }} />
            ) : (
              <Lock size={14} className="shrink-0" />
            )}
            {feature}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Header pill (beside the notification bell on Profile) naming the user's
// plan; tapping it opens every plan side by side. No purchase flow exists
// yet, so the sheet is informational — no upgrade button.
export default function SubscriptionPill() {
  const current = useAuthStore((s) => tierOf(s.user));
  const [isOpen, setIsOpen] = useState(false);
  const info = TIER_INFO[current];
  const Icon = PLAN_ICONS[current];

  return (
    <>
      <motion.button
        onClick={() => setIsOpen(true)}
        whileTap={tap}
        aria-label={`Your plan: ${info.label}. See plans`}
        className="h-10 pl-3 pr-3.5 rounded-full flex items-center gap-1.5 shrink-0 text-sm font-semibold text-fg"
        style={{ backgroundColor: `${info.color}26` }}
      >
        <Icon size={16} style={{ color: info.color }} />
        {info.label}
      </motion.button>

      <BottomSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="bg-surface-alt max-h-[85vh] flex flex-col overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-fg">Plans</h2>
            <p className="text-sm text-fg-faint">You&rsquo;re on {info.label}</p>
          </div>
          <motion.button
            onClick={() => setIsOpen(false)}
            whileTap={tap}
            aria-label="Close"
            className="p-2 -mr-2 text-fg-faint"
          >
            <X size={20} />
          </motion.button>
        </div>
        <div
          className="flex-1 overflow-y-auto px-5 flex flex-col gap-3"
          style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
        >
          {TIERS.map((tier) => (
            <PlanCard key={tier} tier={tier} current={current} />
          ))}
        </div>
      </BottomSheet>
    </>
  );
}
