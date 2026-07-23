import { useEffect, useState } from "react";
import { motion } from "framer-motion";

import FoodPage from "./FoodPage";
import MealsPage from "./MealsPage";
import RecipesPage from "./RecipesPage";
import { spring } from "@/lib/motion";
import { useRecipeFocusStore } from "@/store/recipeFocusStore";

// One hub for the three nutrition sections. A segmented control switches
// between Meals, Recipes and Food; each keeps its own page component. Opening
// a recipe from elsewhere (a linked task) jumps to the Recipes tab, where
// RecipesPage consumes the pending id.
type Tab = "meals" | "recipes" | "food";

const TABS: { key: Tab; label: string }[] = [
  { key: "meals", label: "Meals" },
  { key: "recipes", label: "Recipes" },
  { key: "food", label: "Pantry" },
];

export default function KitchenPage() {
  // Start on Recipes if we arrived here to open a specific recipe...
  const [tab, setTab] = useState<Tab>(() =>
    useRecipeFocusStore.getState().pendingRecipeId ? "recipes" : "meals"
  );
  // ...and switch to it if a recipe is requested while already here.
  useEffect(
    () =>
      useRecipeFocusStore.subscribe((s, prev) => {
        if (s.pendingRecipeId && s.pendingRecipeId !== prev.pendingRecipeId) setTab("recipes");
      }),
    []
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center bg-surface-raised rounded-xl p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="relative flex-1 h-9 rounded-lg text-sm font-medium"
          >
            {tab === t.key && (
              <motion.span
                layoutId="kitchenTab"
                transition={spring.snappy}
                className="absolute inset-0 bg-surface rounded-lg shadow-sm"
              />
            )}
            <span className={`relative z-10 ${tab === t.key ? "text-fg" : "text-fg-muted"}`}>
              {t.label}
            </span>
          </button>
        ))}
      </div>

      {tab === "meals" && <MealsPage />}
      {tab === "recipes" && <RecipesPage />}
      {tab === "food" && <FoodPage />}
    </div>
  );
}
