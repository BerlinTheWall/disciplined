import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Heart, Plus, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BottomSheet from "./BottomSheet";
import Collapse from "./Collapse";
import { COLOR_OPTIONS } from "./timeline/addItemOptions";
import { guessIcon, ICONS, type IconKey } from "@/lib/icons";
import { tap } from "@/lib/motion";
import { useInterestStore } from "@/store/interestStore";
import { useToastStore } from "@/store/toastStore";

// Curated starting points — tap to add instantly. Anything else goes through
// the free-text field below; both paths land in the same list.
const BUILTIN_INTEREST_PRESETS = [
  "Reading",
  "Meditation",
  "Journaling",
  "Stretching",
  "Walking",
  "Learning a language",
  "Drawing",
  "Calling a friend",
];

// FNV-1a — spreads similar titles across the palette. (A plain `h * 31 + c`
// mod 10 collapses to the sum of char codes mod 10, clumping on few colours.)
function hashTitle(title: string) {
  let h = 0x811c9dc5;
  for (const ch of title) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Interests have no colour of their own (the backend stores just title +
// icon), so one is derived per title: its hash picks a starting colour, and
// if an earlier item on screen already has it, it takes the next free one —
// so everything visible is distinct until the palette runs out (then a fresh
// round starts). Items are assigned in display order (your activities, then
// suggestions), so a colour only depends on the items before it and stays
// put as later ones come and go.
function assignColors(titles: string[]) {
  const n = COLOR_OPTIONS.length;
  const used = new Set<number>();
  const colors = new Map<string, string>();
  for (const title of titles) {
    const key = title.trim().toLowerCase();
    if (colors.has(key)) continue;
    if (used.size === n) used.clear();
    let i = hashTitle(key) % n;
    while (used.has(i)) i = (i + 1) % n;
    used.add(i);
    colors.set(key, COLOR_OPTIONS[i]);
  }
  return (title: string) => colors.get(title.trim().toLowerCase()) ?? COLOR_OPTIONS[0];
}

function IconDot({ icon, color, size }: { icon: IconKey; color: string; size: "sm" | "md" }) {
  const Icon = ICONS[icon] ?? ICONS.default;
  return (
    <span
      className={`${size === "md" ? "w-8 h-8" : "w-6 h-6"} rounded-full flex items-center justify-center shrink-0`}
      style={{ backgroundColor: color, color: "#111827" }}
    >
      <Icon size={size === "md" ? 15 : 13} />
    </span>
  );
}

interface InterestsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InterestsSheet({ isOpen, onClose }: InterestsSheetProps) {
  const [interests, loaded, fetchInterests, addInterest, removeInterest] = useInterestStore(
    useShallow((s) => [s.interests, s.loaded, s.fetchInterests, s.addInterest, s.removeInterest])
  );
  const [text, setText] = useState("");

  useEffect(() => {
    if (isOpen && !loaded) void fetchInterests().catch(() => {});
  }, [isOpen, loaded, fetchInterests]);

  const existingTitles = new Set(interests.map((i) => i.title.trim().toLowerCase()));
  const suggestions = BUILTIN_INTEREST_PRESETS.filter((p) => !existingTitles.has(p.toLowerCase()));
  const colorFor = assignColors([...interests.map((i) => i.title), ...suggestions]);

  // The store adds/removes optimistically and rolls back on failure — say so,
  // rather than letting the row silently reappear or vanish.
  async function add(title: string) {
    try {
      await addInterest(title);
    } catch {
      useToastStore.getState().show("Couldn't add that — try again", "error");
    }
  }
  async function remove(id: string) {
    try {
      await removeInterest(id);
    } catch {
      useToastStore.getState().show("Couldn't remove that — try again", "error");
    }
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setText("");
    void add(title);
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface-alt flex flex-col max-h-[85vh]"
    >
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#f472b6] text-[#111827]">
          <Heart size={15} />
        </span>
        <h2 className="text-base font-bold text-fg flex-1">Make Time For</h2>
        <motion.button
          onClick={onClose}
          whileTap={tap}
          aria-label="Close"
          className="p-2 -mr-2 text-fg-faint"
        >
          <X size={20} />
        </motion.button>
      </div>

      <div
        className="flex-1 overflow-y-auto px-5"
        style={{ paddingBottom: "calc(20px + env(safe-area-inset-bottom))" }}
      >
        <p className="text-sm text-fg-faint mb-5">
          Things you like or want to start doing. You&rsquo;ll get an occasional nudge to make time
          for one you haven&rsquo;t gotten to in a while.
        </p>

        {/* Your activities */}
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            Your activities
          </h3>
          {interests.length > 0 && (
            <span className="text-xs font-medium text-fg-faint tabular-nums">
              {interests.length}
            </span>
          )}
        </div>
        {/* Rows are height-animated so adding/removing one never jumps the
            sections below, and the last removal hands over to the empty state
            on the same clock. */}
        <div className="mb-5">
          <AnimatePresence initial={false}>
            {interests.map((interest) => {
              const color = colorFor(interest.title);
              return (
                <motion.div
                  key={interest.id}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="pb-1.5">
                    <div
                      className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl"
                      style={{ backgroundColor: `${color}24` }}
                    >
                      <IconDot icon={interest.icon} color={color} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-fg truncate">{interest.title}</p>
                        <p className="text-xs text-fg-faint">
                          Added{" "}
                          {new Date(interest.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                      <motion.button
                        onClick={() => void remove(interest.id)}
                        whileTap={tap}
                        aria-label={`Remove ${interest.title}`}
                        className="w-7 h-7 rounded-full flex items-center justify-center text-fg-faint shrink-0"
                      >
                        <X size={14} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
          <Collapse open={loaded && interests.length === 0}>
            <p className="text-sm text-fg-faint px-3.5 py-3 rounded-2xl border border-dashed border-border-strong">
              Nothing yet — pick a suggestion below or add your own.
            </p>
          </Collapse>
        </div>

        {/* Add more: one-tap suggestions, then free text */}
        <h3 className="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-2">
          Add more
        </h3>
        <Collapse open={suggestions.length > 0}>
          <div className="flex flex-wrap gap-2 pb-3">
            <AnimatePresence initial={false} mode="popLayout">
              {suggestions.map((title) => {
                const color = colorFor(title);
                return (
                  <motion.button
                    key={title}
                    layout
                    type="button"
                    onClick={() => void add(title)}
                    whileTap={tap}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center gap-2 pl-2 pr-3.5 py-2 rounded-full"
                    style={{ backgroundColor: `${color}2e` }}
                  >
                    <IconDot icon={guessIcon(title) ?? "default"} color={color} size="sm" />
                    <span className="text-sm font-medium text-fg whitespace-nowrap">{title}</span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </Collapse>

        <form onSubmit={handleAdd} className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Something else…"
            className="flex-1 min-w-0 h-11 px-4 rounded-full bg-surface border border-transparent text-sm text-fg placeholder:text-fg-faint outline-none focus:border-border-focus transition-colors"
          />
          <motion.button
            type="submit"
            whileTap={text.trim() ? tap : undefined}
            disabled={!text.trim()}
            aria-label="Add"
            className="w-11 h-11 rounded-full flex items-center justify-center bg-surface-inverse text-fg-inverse shrink-0 disabled:opacity-40"
          >
            <Plus size={20} strokeWidth={2.5} />
          </motion.button>
        </form>
      </div>
    </BottomSheet>
  );
}
