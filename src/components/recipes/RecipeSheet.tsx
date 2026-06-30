/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChefHat, Minus, Plus, Search, Trash2, X } from "lucide-react";

import { useAutoFocus } from "@/hooks/useAutoFocus";
import { useScrollLock } from "@/hooks/useScrollLock";
import { FALLBACK_FOOD_ICON, FOOD_CATEGORIES } from "@/lib/foodCategories";
import { formatAmount, indexItems, lineNutrition } from "@/lib/grocery";
import { spring, tap } from "@/lib/motion";
import { addNutrition, emptyNutrition } from "@/lib/nutritions";
import { useGroceryStore } from "@/store/groceryStore";
import { useRecipeStore } from "@/store/recipeStore";
import type { Recipe, RecipeIngredient } from "@/types/recipe";
import { useConfirm } from "../ConfirmDialog";
import AddGroceryItemSheet from "../expenses/AddGroceryItemSheet";

const COLOR_OPTIONS = [
  "#fb923c",
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
  "#22d3ee",
  "#a3e635",
  "#fb7185",
  "#f87171",
];

function isLightColor(hex: string) {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

interface RecipeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editRecipe?: Recipe | null;
}

export default function RecipeSheet({ isOpen, onClose, editRecipe }: RecipeSheetProps) {
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const addRecipe = useRecipeStore((s) => s.addRecipe);
  const updateRecipe = useRecipeStore((s) => s.updateRecipe);
  const deleteRecipe = useRecipeStore((s) => s.deleteRecipe);
  const confirm = useConfirm();

  const isEditing = !!editRecipe;
  useScrollLock(isOpen);
  const nameRef = useRef<HTMLInputElement>(null);
  useAutoFocus(nameRef, isOpen && !isEditing);
  const items = indexItems(groceryItems);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [servings, setServings] = useState(2);
  const [timeMin, setTimeMin] = useState("");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [steps, setSteps] = useState<string[]>([""]);
  const [query, setQuery] = useState("");
  const [newItemOpen, setNewItemOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setQuery("");
    if (editRecipe) {
      setName(editRecipe.name);
      setColor(editRecipe.color);
      setServings(editRecipe.servings);
      setTimeMin(editRecipe.timeMin ? String(editRecipe.timeMin) : "");
      setIngredients(editRecipe.ingredients);
      setSteps(editRecipe.steps.length ? editRecipe.steps : [""]);
    } else {
      setName("");
      setColor(COLOR_OPTIONS[0]);
      setServings(2);
      setTimeMin("");
      setIngredients([]);
      setSteps([""]);
    }
  }, [isOpen, editRecipe]);

  const chosen = new Map(ingredients.map((i) => [i.itemId, i.servings]));

  // Filter the catalog by search, always keeping chosen ingredients visible.
  const q = query.trim().toLowerCase();
  const shownItems = groceryItems.filter(
    (it) => chosen.has(it.id) || it.name.toLowerCase().includes(q)
  );

  function toggleItem(itemId: string) {
    setIngredients((prev) =>
      prev.some((i) => i.itemId === itemId)
        ? prev.filter((i) => i.itemId !== itemId)
        : [...prev, { itemId, servings: 1 }]
    );
  }
  function bumpServings(itemId: string, delta: number) {
    setIngredients((prev) =>
      prev.map((i) =>
        i.itemId === itemId
          ? { ...i, servings: Math.max(0.25, Math.round((i.servings + delta) * 100) / 100) }
          : i
      )
    );
  }

  function setStep(index: number, value: string) {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  }
  function addStep() {
    setSteps((prev) => [...prev, ""]);
  }
  function removeStep(index: number) {
    setSteps((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== index)));
  }

  const total = ingredients.reduce(
    (acc, i) => addNutrition(acc, lineNutrition(items[i.itemId], i.servings)),
    emptyNutrition()
  );

  const canSave = name.trim().length > 0;

  async function handleSave() {
    if (!canSave) return;
    const payload = {
      name: name.trim(),
      color,
      servings: Math.max(1, servings),
      timeMin: timeMin ? Number(timeMin) : undefined,
      ingredients,
      steps: steps.map((s) => s.trim()).filter(Boolean),
    };
    if (isEditing) {
      const ok = await confirm({
        title: "Save changes?",
        message: `Update "${payload.name}" with your edits.`,
        confirmLabel: "Save",
      });
      if (!ok) return;
      updateRecipe(editRecipe!.id, payload);
    } else {
      addRecipe(payload);
    }
    onClose();
  }

  async function handleDelete() {
    if (!editRecipe) return;
    const ok = await confirm({
      title: "Delete recipe?",
      message: `"${editRecipe.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    deleteRecipe(editRecipe.id);
    onClose();
  }

  const onColor = isLightColor(color) ? "#111827" : "#ffffff";
  const headerBtn = {
    backgroundColor: isLightColor(color) ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.25)",
    color: onColor,
  };

  return (
    <>
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
              {/* Colored header */}
              <div className="px-4 pt-3 pb-5 rounded-t-2xl" style={{ backgroundColor: color }}>
                <div className="flex items-center justify-between">
                  <motion.button
                    onClick={onClose}
                    whileTap={tap}
                    className="w-9 h-9 rounded-full flex items-center justify-center"
                    style={headerBtn}
                  >
                    <X size={20} />
                  </motion.button>
                  {isEditing && (
                    <motion.button
                      onClick={handleDelete}
                      whileTap={tap}
                      className="w-9 h-9 rounded-full flex items-center justify-center"
                      style={headerBtn}
                    >
                      <Trash2 size={18} />
                    </motion.button>
                  )}
                </div>
                <div className="flex items-center gap-4 mt-3">
                  <div
                    className="w-16 h-16 rounded-full border-[3px] border-white flex items-center justify-center shrink-0"
                    style={{ backgroundColor: "#2f2f33" }}
                  >
                    <ChefHat size={28} style={{ color }} />
                  </div>
                  <input
                    ref={nameRef}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Recipe name"
                    className={`flex-1 min-w-0 bg-transparent text-2xl font-semibold border-b pb-1 focus:outline-none ${isLightColor(color) ? "placeholder-black/40" : "placeholder-white/50"}`}
                    style={{
                      color: onColor,
                      caretColor: onColor,
                      borderColor: isLightColor(color)
                        ? "rgba(17,24,39,0.3)"
                        : "rgba(255,255,255,0.5)",
                    }}
                  />
                </div>
              </div>

              {/* Body */}
              <div className="p-4 pb-6">
                {/* Servings + time */}
                <div className="flex gap-3 mb-5">
                  <div className="flex-1">
                    <label className="text-xs font-medium text-fg-muted mb-2 block">Servings</label>
                    <div className="flex items-center justify-between bg-surface-raised rounded-2xl px-3 py-2.5">
                      <motion.button
                        onClick={() => setServings((s) => Math.max(1, s - 1))}
                        whileTap={tap}
                        className="w-7 h-7 rounded-full bg-surface text-fg-muted flex items-center justify-center"
                      >
                        <Minus size={14} />
                      </motion.button>
                      <span className="text-base font-semibold text-fg tabular-nums">
                        {servings}
                      </span>
                      <motion.button
                        onClick={() => setServings((s) => s + 1)}
                        whileTap={tap}
                        className="w-7 h-7 rounded-full bg-surface text-fg-muted flex items-center justify-center"
                      >
                        <Plus size={14} />
                      </motion.button>
                    </div>
                  </div>
                  <div className="flex-1">
                    <label className="text-xs font-medium text-fg-muted mb-2 block">
                      Time (min)
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={timeMin}
                      onChange={(e) => setTimeMin(e.target.value)}
                      placeholder="25"
                      className="w-full bg-surface-raised rounded-2xl px-4 py-2.5 text-base font-semibold text-fg text-center placeholder-fg-faint focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                {/* Color */}
                <label className="text-xs font-medium text-fg-muted mb-2 block">Color</label>
                <div
                  className="flex gap-3 overflow-x-auto bg-surface-raised rounded-full p-1.5 mb-6"
                  style={{ scrollbarWidth: "none" }}
                >
                  {COLOR_OPTIONS.map((c) => (
                    <motion.button
                      key={c}
                      onClick={() => setColor(c)}
                      whileTap={tap}
                      className="w-8 h-8 rounded-full shrink-0"
                      style={{
                        backgroundColor: c,
                        outline: color === c ? "2px solid var(--fg)" : "none",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>

                {/* Ingredients from catalog */}
                <label className="text-xs font-medium text-fg-muted mb-2 block">Ingredients</label>
                <motion.button
                  onClick={() => setNewItemOpen(true)}
                  whileTap={tap}
                  className="flex items-center gap-2 w-full mb-2 px-4 py-2.5 rounded-xl border border-dashed border-border-strong text-fg-muted text-sm font-medium"
                >
                  <Plus size={16} />
                  New item
                </motion.button>
                {groceryItems.length === 0 ? (
                  <p className="text-sm text-fg-faint mb-5">
                    No foods yet — add your first one above, then it's reusable everywhere.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2 mb-3">
                    {groceryItems.length > 6 && (
                      <div className="flex items-center gap-2 bg-surface-alt rounded-xl px-3 py-2">
                        <Search size={15} className="text-fg-faint shrink-0" />
                        <input
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search items…"
                          className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder-fg-faint focus:outline-none"
                        />
                      </div>
                    )}
                    {shownItems.length === 0 && (
                      <p className="text-sm text-fg-faint py-2">No items match "{query}".</p>
                    )}
                    {shownItems.map((item) => {
                      const cat = FOOD_CATEGORIES[item.category];
                      const Icon = cat.icon ?? FALLBACK_FOOD_ICON;
                      const selected = chosen.has(item.id);
                      const srv = chosen.get(item.id) ?? 1;
                      return (
                        <div
                          key={item.id}
                          className={`flex items-center gap-3 p-2.5 pr-3 rounded-2xl ${selected ? "bg-surface-inverse" : "bg-surface-alt"}`}
                        >
                          <motion.button
                            onClick={() => toggleItem(item.id)}
                            whileTap={tap}
                            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                          >
                            <span
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
                              style={{ backgroundColor: cat.color }}
                            >
                              {selected ? <Check size={15} strokeWidth={3} /> : <Icon size={14} />}
                            </span>
                            <span className="min-w-0">
                              <span
                                className={`block font-medium leading-tight truncate ${selected ? "text-fg-inverse" : "text-fg"}`}
                              >
                                {item.name}
                              </span>
                              <span
                                className={`block text-xs mt-0.5 ${selected ? "text-fg-muted-inverse" : "text-fg-faint"}`}
                              >
                                {selected
                                  ? `${formatAmount(item, srv)} · ${lineNutrition(item, srv).calories} kcal`
                                  : `${item.nutrition.calories} kcal per ${formatAmount(item, 1)}`}
                              </span>
                            </span>
                          </motion.button>
                          {selected && (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <motion.button
                                onClick={() => bumpServings(item.id, -0.25)}
                                whileTap={tap}
                                className="w-7 h-7 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
                                aria-label="Less"
                              >
                                <Minus size={14} />
                              </motion.button>
                              <span className="w-9 text-center text-sm font-medium text-fg-inverse">
                                ×{srv}
                              </span>
                              <motion.button
                                onClick={() => bumpServings(item.id, 0.25)}
                                whileTap={tap}
                                className="w-7 h-7 rounded-full bg-surface-raised text-fg-muted flex items-center justify-center"
                                aria-label="More"
                              >
                                <Plus size={14} />
                              </motion.button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {ingredients.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-6">
                    <NutriChip label={`${total.calories} kcal total`} />
                    <NutriChip label={`${total.protein}g protein`} />
                    <NutriChip label={`${total.fat}g fat`} />
                    <NutriChip label={`${total.carbs}g carbs`} />
                  </div>
                )}

                {/* Steps */}
                <label className="text-xs font-medium text-fg-muted mb-2 block">Steps</label>
                <div className="flex flex-col gap-2">
                  <AnimatePresence initial={false}>
                    {steps.map((step, i) => (
                      <motion.div
                        key={i}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={spring.snappy}
                        className="flex items-start gap-2 bg-surface-raised rounded-2xl p-2.5"
                      >
                        <span
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5"
                          style={{ backgroundColor: color, color: onColor }}
                        >
                          {i + 1}
                        </span>
                        <textarea
                          value={step}
                          onChange={(e) => setStep(i, e.target.value)}
                          placeholder="Describe this step…"
                          rows={2}
                          className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder-fg-faint focus:outline-none resize-none pt-1"
                        />
                        <motion.button
                          onClick={() => removeStep(i)}
                          whileTap={tap}
                          className="w-7 h-7 rounded-full text-fg-faint hover:text-fg flex items-center justify-center shrink-0"
                          aria-label="Remove step"
                        >
                          <X size={16} />
                        </motion.button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  <motion.button
                    onClick={addStep}
                    whileTap={tap}
                    className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-strong py-3 text-sm font-medium text-fg-muted"
                  >
                    <Plus size={16} />
                    Add step
                  </motion.button>
                </div>

                <motion.button
                  onClick={handleSave}
                  whileTap={canSave ? tap : undefined}
                  disabled={!canSave}
                  className="w-full rounded-2xl py-3.5 font-medium mt-6 disabled:opacity-40"
                  style={{ backgroundColor: color, color: onColor }}
                >
                  {isEditing ? "Save recipe" : "Create recipe"}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create a food inline and auto-add it as an ingredient. */}
      <AddGroceryItemSheet
        isOpen={newItemOpen}
        onClose={() => setNewItemOpen(false)}
        onCreated={(id) => toggleItem(id)}
      />
    </>
  );
}

function NutriChip({ label }: { label: string }) {
  return (
    <span className="text-xs font-medium text-fg-muted bg-surface-raised rounded-full px-2.5 py-1">
      {label}
    </span>
  );
}
