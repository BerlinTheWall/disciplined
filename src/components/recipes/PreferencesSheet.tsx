import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Plus, SlidersHorizontal, X } from "lucide-react";

import { useScrollLock } from "@/hooks/useScrollLock";
import { spring, tap } from "@/lib/motion";
import { usePreferenceStore } from "@/store/preferenceStore";
import { useRecipeStore } from "@/store/recipeStore";

interface PreferencesSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function PreferencesSheet({ isOpen, onClose }: PreferencesSheetProps) {
  useScrollLock(isOpen);

  const recipes = useRecipeStore((s) => s.recipes);
  const likedTags = usePreferenceStore((s) => s.likedTags);
  const avoidTags = usePreferenceStore((s) => s.avoidTags);
  const maxCookMinutes = usePreferenceStore((s) => s.maxCookMinutes);
  const toggleLikedTag = usePreferenceStore((s) => s.toggleLikedTag);
  const toggleAvoidTag = usePreferenceStore((s) => s.toggleAvoidTag);
  const setMaxCookMinutes = usePreferenceStore((s) => s.setMaxCookMinutes);

  const [likedInput, setLikedInput] = useState("");
  const [avoidInput, setAvoidInput] = useState("");

  // Tags that appear on the user's recipes, offered as quick suggestions.
  const knownTags = useMemo(() => {
    const set = new Set<string>();
    for (const r of recipes) for (const t of r.tags ?? []) set.add(t.trim().toLowerCase());
    return [...set].sort();
  }, [recipes]);

  function commit(raw: string, toggle: (t: string) => void, reset: () => void) {
    const t = raw.trim().toLowerCase();
    if (t) toggle(t);
    reset();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 shadow-xl max-h-[92vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={18} className="text-fg-muted" />
                <h2 className="text-lg font-semibold text-fg">Suggestion preferences</h2>
              </div>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="w-9 h-9 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
              >
                <X size={20} />
              </motion.button>
            </div>

            <div className="p-4 pt-2 pb-8 flex flex-col gap-6">
              <p className="text-sm text-fg-faint -mt-1">
                Tune what we suggest for each meal. Tags match your recipes' tags.
              </p>

              <TagSection
                label="Prefer"
                hint="Boost recipes with these tags"
                value={likedInput}
                onChange={setLikedInput}
                onSubmit={() => commit(likedInput, toggleLikedTag, () => setLikedInput(""))}
                selected={likedTags}
                onToggle={toggleLikedTag}
                suggestions={knownTags}
                tone="positive"
              />

              <TagSection
                label="Avoid"
                hint="Never suggest recipes with these tags"
                value={avoidInput}
                onChange={setAvoidInput}
                onSubmit={() => commit(avoidInput, toggleAvoidTag, () => setAvoidInput(""))}
                selected={avoidTags}
                onToggle={toggleAvoidTag}
                suggestions={knownTags}
                tone="negative"
              />

              <div>
                <label className="text-xs font-medium text-fg-muted mb-2 block">
                  Max cook time (min)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={maxCookMinutes ?? ""}
                  onChange={(e) =>
                    setMaxCookMinutes(e.target.value ? Number(e.target.value) : undefined)
                  }
                  placeholder="No limit"
                  className="w-full bg-surface-raised rounded-2xl px-4 py-2.5 text-base font-semibold text-fg placeholder-fg-faint focus:outline-none tabular-nums"
                />
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TagSection({
  label,
  hint,
  value,
  onChange,
  onSubmit,
  selected,
  onToggle,
  suggestions,
  tone,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  selected: string[];
  onToggle: (t: string) => void;
  suggestions: string[];
  tone: "positive" | "negative";
}) {
  const selectedStyle =
    tone === "positive"
      ? "bg-surface-inverse text-fg-inverse"
      : "bg-surface-inverse text-fg-inverse line-through";
  const unselected = suggestions.filter((t) => !selected.includes(t));

  return (
    <div>
      <label className="text-xs font-medium text-fg-muted block">{label}</label>
      <p className="text-xs text-fg-faint mb-2">{hint}</p>
      <div className="flex items-center gap-2 bg-surface-raised rounded-xl px-3 py-2 mb-2">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          placeholder="Add a tag…"
          className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder-fg-faint focus:outline-none"
        />
        <motion.button
          onClick={onSubmit}
          whileTap={tap}
          className="w-7 h-7 rounded-full bg-surface text-fg-muted flex items-center justify-center shrink-0"
          aria-label={`Add ${label} tag`}
        >
          <Plus size={15} />
        </motion.button>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selected.map((tag) => (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              className={`flex items-center gap-1 text-xs font-medium rounded-full pl-2.5 pr-2 py-1 ${selectedStyle}`}
            >
              {tag}
              <X size={12} className="opacity-70" />
            </button>
          ))}
        </div>
      )}

      {unselected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {unselected.map((tag) => (
            <button
              key={tag}
              onClick={() => onToggle(tag)}
              className="flex items-center gap-1 text-xs font-medium text-fg-muted bg-surface-alt rounded-full pl-2 pr-2.5 py-1"
            >
              <Check size={12} className="text-fg-faint" />
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
