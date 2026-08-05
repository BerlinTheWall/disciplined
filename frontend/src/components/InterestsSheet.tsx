import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Heart, Plus, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BottomSheet from "./BottomSheet";
import Collapse from "./Collapse";
import { ICONS } from "@/lib/icons";
import { tap } from "@/lib/motion";
import { useInterestStore } from "@/store/interestStore";

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
    if (isOpen && !loaded) void fetchInterests();
  }, [isOpen, loaded, fetchInterests]);

  const existingTitles = new Set(interests.map((i) => i.title.trim().toLowerCase()));
  const suggestions = BUILTIN_INTEREST_PRESETS.filter((p) => !existingTitles.has(p.toLowerCase()));

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    setText("");
    void addInterest(title);
  }

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface-alt flex flex-col max-h-[75vh]"
    >
      <div className="flex items-center gap-2.5 px-5 pt-4 pb-3">
        <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[#f472b6] text-[#111827]">
          <Heart size={15} />
        </span>
        <h2 className="text-base font-bold text-fg flex-1">Activities</h2>
        <motion.button
          onClick={onClose}
          whileTap={tap}
          aria-label="Close"
          className="p-2 -mr-2 text-fg-faint"
        >
          <X size={20} />
        </motion.button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <p className="text-sm text-fg-faint mb-3">
          Things you like or want to start doing. You&rsquo;ll get an occasional nudge to make time
          for one you haven&rsquo;t gotten to in a while.
        </p>

        <Collapse open={suggestions.length > 0} className="flex flex-wrap gap-2 mb-4">
          {suggestions.map((title) => (
            <motion.button
              key={title}
              type="button"
              onClick={() => void addInterest(title)}
              whileTap={tap}
              className="px-3.5 py-2 rounded-full bg-surface-raised text-sm font-medium text-fg"
            >
              {title}
            </motion.button>
          ))}
        </Collapse>

        <form onSubmit={handleAdd} className="flex items-center gap-2 mb-4">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Something else..."
            className="flex-1 h-10 px-3.5 rounded-full bg-surface-raised text-sm text-fg placeholder:text-fg-faint outline-none"
          />
          <motion.button
            type="submit"
            whileTap={tap}
            aria-label="Add"
            className="w-10 h-10 rounded-full flex items-center justify-center bg-fg text-fg-inverse shrink-0"
          >
            <Plus size={18} />
          </motion.button>
        </form>

        <Collapse open={interests.length > 0} className="flex flex-col gap-1.5">
          {interests.map((interest) => {
            const Icon = ICONS[interest.icon] ?? ICONS.default;
            return (
              <div
                key={interest.id}
                className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-surface-raised"
              >
                <span className="w-7 h-7 rounded-full flex items-center justify-center bg-surface text-fg-faint shrink-0">
                  <Icon size={14} />
                </span>
                <span className="flex-1 text-sm font-medium text-fg">{interest.title}</span>
                <motion.button
                  onClick={() => void removeInterest(interest.id)}
                  whileTap={tap}
                  aria-label={`Remove ${interest.title}`}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-fg-faint"
                >
                  <X size={14} />
                </motion.button>
              </div>
            );
          })}
        </Collapse>
      </div>
    </BottomSheet>
  );
}
