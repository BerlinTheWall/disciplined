/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Wand2, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import BarcodeLookup from "./BarcodeLookup";
import { useAutoFocus } from "@/hooks/useAutoFocus";
import {
  FALLBACK_FOOD_ICON,
  FOOD_CATEGORIES,
  FOOD_CATEGORY_KEYS,
  type FoodCategoryKey,
} from "@/lib/foodCategories";
import { formatUnit, scaleNutrition } from "@/lib/grocery";
import { spring, tap } from "@/lib/motion";
import {
  amountInBase,
  emptyNutrition,
  estimateNutrition,
  NUTRITION_FIELDS,
  suggestCategory,
  UNITS,
  type Nutrition,
  type Unit,
} from "@/lib/nutritions";
import type { ScannedProduct } from "@/lib/openFoodFacts";
import { useGroceryStore } from "@/store/groceryStore";
import type { GroceryItem } from "@/types/grocery";
import BottomSheet from "../BottomSheet";
import Collapse from "../Collapse";
import { useConfirm } from "../ConfirmDialog";

const round2 = (n: number) => Math.round(n * 100) / 100;

// How many reference amounts (packs) a stock figure comes to.
function toPacks(stockInUnit: number, quantity: number): number {
  return quantity > 0 ? round2(stockInUnit / quantity) : 0;
}

interface AddGroceryItemSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editItem?: GroceryItem | null;
  // Called with the new item's id after a fresh item is created — lets a caller
  // (e.g. the meal/recipe picker) immediately select what was just added.
  onCreated?: (id: string) => void;
}

export default function AddGroceryItemSheet({
  isOpen,
  onClose,
  editItem,
  onCreated,
}: AddGroceryItemSheetProps) {
  const [addGroceryItem, updateGroceryItem, deleteGroceryItem] = useGroceryStore(
    useShallow((state) => [state.addGroceryItem, state.updateGroceryItem, state.deleteGroceryItem])
  );
  const confirm = useConfirm();

  const isEditing = !!editItem;
  const nameRef = useRef<HTMLInputElement>(null);
  useAutoFocus(nameRef, isOpen);

  const [name, setName] = useState("");
  const [category, setCategory] = useState<FoodCategoryKey>("protein");
  const [categoryTouched, setCategoryTouched] = useState(false);
  const [quantity, setQuantity] = useState("100");
  const [unit, setUnit] = useState<Unit>("g");
  // Stock is stored in `unit`, but entered either as a count of packs (the
  // usual case — "three bottles") or as the raw amount. `stock` holds whatever
  // the current mode means; handleSubmit converts it back.
  const [stock, setStock] = useState("1");
  const [stockMode, setStockMode] = useState<"packs" | "unit">("packs");
  const [price, setPrice] = useState("");
  const [nutrition, setNutrition] = useState<Nutrition>(emptyNutrition());
  const [auto, setAuto] = useState(true);
  // The scanned label's per-100 g figures. While it's set, the nutrition below
  // is the label's — so it must be re-scaled whenever the amount changes, or
  // correcting a wrong package size would leave the calories behind. Cleared
  // the moment the user takes the values over by hand.
  const [scanBasis, setScanBasis] = useState<Nutrition | null>(null);
  // Price / stock / nutrition are tucked away by default so a quick add is just
  // name + amount; editing an existing item opens them expanded.
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    setShowDetails(!!editItem);
    if (editItem) {
      setName(editItem.name);
      setCategory(editItem.category);
      setCategoryTouched(true);
      setQuantity(String(editItem.quantity));
      setUnit(editItem.unit);
      // A whole number of packs reads naturally as a count; a part-pack amount
      // (750 g of a 100 g reference) is clearer as the raw number.
      const packs = toPacks(editItem.stock, editItem.quantity);
      const asPacks = Number.isInteger(packs);
      setStockMode(asPacks ? "packs" : "unit");
      setStock(String(asPacks ? packs : editItem.stock));
      setPrice(String(editItem.price));
      setNutrition(editItem.nutrition);
      setAuto(editItem.autoNutrition);
      setScanBasis(null);
    } else {
      setName("");
      setCategory("protein");
      setCategoryTouched(false);
      setQuantity("100");
      setUnit("g");
      setStock("1");
      setStockMode("packs");
      setPrice("");
      setNutrition(emptyNutrition());
      setAuto(true);
      setScanBasis(null);
    }
  }, [editItem]);

  const qtyNum = parseFloat(quantity);

  useEffect(() => {
    if (!auto) return;
    setNutrition(estimateNutrition(name, category, qtyNum, unit));
  }, [auto, name, category, qtyNum, unit]);

  // Scanned values are "per the amount above" — so correcting a wrong package
  // size (or switching g to kg) has to carry the label's numbers with it.
  useEffect(() => {
    if (auto || !scanBasis) return;
    const base = amountInBase(qtyNum, unit);
    if (base === null) return; // counted units imply no weight to scale by
    setNutrition(scaleNutrition(scanBasis, base / 100));
  }, [auto, scanBasis, qtyNum, unit]);

  // The typed stock, resolved to the amount actually stored (always in `unit`).
  const stockValue = parseFloat(stock);
  const stockInUnit = stockMode === "packs" ? round2(stockValue * qtyNum) : round2(stockValue);

  // Spells the conversion out, so a count never hides what it means.
  const stockHint = !isFinite(stockInUnit)
    ? "Set how much you have on hand."
    : stockInUnit <= 0
      ? "Out of stock."
      : stockMode === "packs"
        ? `= ${formatUnit(stockInUnit, unit)} in stock`
        : `= ${round2(toPacks(stockInUnit, qtyNum))} × ${formatUnit(qtyNum, unit)}`;

  // Switching the mode keeps the amount you have — only how it's written changes.
  function switchStockMode(next: "packs" | "unit") {
    if (next === stockMode) return;
    const value = parseFloat(stock);
    if (isFinite(value) && isFinite(qtyNum) && qtyNum > 0) {
      setStock(String(next === "packs" ? round2(value / qtyNum) : round2(value * qtyNum)));
    }
    setStockMode(next);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!categoryTouched) {
      const guess = suggestCategory(value);
      if (guess) setCategory(guess);
    }
  }

  function pickCategory(key: FoodCategoryKey) {
    setCategory(key);
    setCategoryTouched(true);
  }

  // A barcode matched on Open Food Facts: prefill the form with the product.
  // Label data beats the estimator, so auto turns off — unless the database had
  // no nutrition, in which case the estimator stays in charge and re-runs
  // against the scanned name/category/amount. Quantity and unit are always the
  // basis the nutrition was scaled to, so the two can't drift apart.
  function applyScannedProduct(product: ScannedProduct) {
    if (product.name) setName(product.name);
    if (product.category) {
      setCategory(product.category);
      setCategoryTouched(true);
    }
    setQuantity(String(product.quantity));
    setUnit(product.unit);
    // A fresh scan means one package just came home — counted, not weighed. For
    // a pack of pieces the amount above is ONE of them (one bun), so the pack of
    // 8 is 8 in stock; for anything else it's simply the one package.
    if (!isEditing) {
      setStockMode("packs");
      setStock(String(product.pieces ?? 1));
    }
    if (product.nutrition) {
      setNutrition(product.nutrition);
      setScanBasis(product.nutritionPer100);
      setAuto(false);
    } else {
      setScanBasis(null);
      setAuto(true);
    }
    setShowDetails(true);
  }

  function setNutritionField(key: keyof Nutrition, raw: string) {
    const value = parseFloat(raw);
    setNutrition((prev) => ({ ...prev, [key]: isFinite(value) ? value : 0 }));
    // Hand-entered values are the user's own; stop re-scaling them from the label.
    setScanBasis(null);
    setAuto(false);
  }

  function reEstimate() {
    setScanBasis(null);
    setAuto(true);
  }

  async function handleSubmit() {
    if (!isFinite(qtyNum) || qtyNum <= 0) return;
    const priceNum = parseFloat(price);

    const payload = {
      name: name.trim() || FOOD_CATEGORIES[category].label,
      category,
      price: isFinite(priceNum) ? Math.round(priceNum * 100) / 100 : 0,
      quantity: qtyNum,
      unit,
      // Always the amount in `unit`, whichever way it was typed.
      stock: isFinite(stockInUnit) && stockInUnit > 0 ? stockInUnit : 0,
      nutrition,
      autoNutrition: auto,
    };

    if (isEditing) {
      const ok = await confirm({
        title: "Save changes?",
        message: `Update "${payload.name}" with your edits.`,
        confirmLabel: "Save",
      });
      if (!ok) return;
      updateGroceryItem(editItem!.id, payload);
    } else {
      const id = addGroceryItem(payload);
      onCreated?.(id);
    }
    onClose();
  }

  async function handleDelete() {
    if (!editItem) return;
    const ok = await confirm({
      title: "Delete item?",
      message: `"${editItem.name}" will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    deleteGroceryItem(editItem.id);
    onClose();
  }

  const canSave = isFinite(qtyNum) && qtyNum > 0 && name.trim().length > 0;

  return (
    <BottomSheet
      isOpen={isOpen}
      onClose={onClose}
      className="bg-surface p-5 pb-8 max-h-[88vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-fg">{isEditing ? "Edit item" : "New item"}</h2>
        <motion.button onClick={onClose} whileTap={tap} className="p-2 -m-2 text-fg-faint">
          <X size={22} />
        </motion.button>
      </div>

      {/* Name */}
      <label className="text-sm text-fg-muted mb-1 block">Item</label>
      <input
        ref={nameRef}
        type="text"
        value={name}
        onChange={(e) => handleNameChange(e.target.value)}
        placeholder="e.g. Chicken breast"
        className="w-full text-base border border-border-input rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-border-focus"
      />

      {/* Barcode → Open Food Facts prefill. Keyed to the open/edit cycle so a
          reopened sheet starts with a clean field and status. */}
      <BarcodeLookup key={`${isOpen}-${editItem?.id ?? "new"}`} onProduct={applyScannedProduct} />

      {/* Category — one row of colored icons rather than nine wrapped chips.
          The name of the selected one rides on the label, so nothing is lost. */}
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm text-fg-muted">Category</label>
        <span className="text-sm font-medium text-fg pr-1">{FOOD_CATEGORIES[category].label}</span>
      </div>
      <div className="flex gap-1.5 mb-4 overflow-x-auto p-0.5" style={{ scrollbarWidth: "none" }}>
        {FOOD_CATEGORY_KEYS.map((key) => {
          const { icon, label, color } = FOOD_CATEGORIES[key];
          const Icon = icon ?? FALLBACK_FOOD_ICON;
          const selected = category === key;
          return (
            <motion.button
              key={key}
              onClick={() => pickCategory(key)}
              whileTap={tap}
              title={label}
              aria-label={label}
              aria-pressed={selected}
              animate={{ scale: selected ? 1 : 0.92 }}
              transition={spring.snappy}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{
                backgroundColor: selected ? color : "var(--surface-raised)",
                color: selected ? "#fff" : color,
                boxShadow: selected ? "0 0 0 2px var(--fg)" : undefined,
              }}
            >
              <Icon size={16} />
            </motion.button>
          );
        })}
      </div>

      {/* Quantity + unit */}
      <label className="text-sm text-fg-muted mb-1 block">Amount</label>
      <div className="flex gap-2 mb-4">
        <input
          type="number"
          inputMode="decimal"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="0"
          className="flex-1 min-w-0 text-base border border-border-input rounded-xl px-4 py-3 focus:outline-none focus:border-border-focus"
        />
        <div className="flex bg-surface-raised rounded-xl p-1">
          {UNITS.map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className="relative px-2.5 py-1.5 rounded-lg text-sm font-medium"
            >
              {unit === u && (
                <motion.div
                  layoutId="unitToggle"
                  transition={spring.snappy}
                  className="absolute inset-0 bg-surface rounded-lg shadow-sm"
                />
              )}
              <span className={`relative z-10 ${unit === u ? "text-fg" : "text-fg-muted"}`}>
                {u}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Toggle for the optional details — keeps a quick add to name + amount */}
      <motion.button
        onClick={() => setShowDetails((v) => !v)}
        whileTap={tap}
        className="flex items-center gap-1.5 mb-4 text-sm font-medium text-fg-muted"
      >
        {showDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {showDetails ? "Fewer details" : "Price, stock & nutrition"}
      </motion.button>

      <Collapse open={showDetails}>
        <>
          {/* In stock — counted in packs by default ("3 bottles of it"), since
              that's how you actually hold it. The raw amount stays one tap away
              for anything loose, like 750 g of chicken. */}
          <label className="text-sm text-fg-muted mb-1 block">
            In stock <span className="text-fg-faint">(how much you have now)</span>
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <input
                type="number"
                inputMode="decimal"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                className="w-full text-base border border-border-input rounded-xl px-4 py-3 pr-10 focus:outline-none focus:border-border-focus"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-faint">
                {stockMode === "packs" ? "×" : unit}
              </span>
            </div>
            <div className="flex bg-surface-raised rounded-xl p-1">
              {(["packs", "unit"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => switchStockMode(m)}
                  className="relative px-3 py-1.5 rounded-lg text-sm font-medium"
                >
                  {stockMode === m && (
                    <motion.div
                      layoutId="stockModeToggle"
                      transition={spring.snappy}
                      className="absolute inset-0 bg-surface rounded-lg shadow-sm"
                    />
                  )}
                  <span
                    className={`relative z-10 ${stockMode === m ? "text-fg" : "text-fg-muted"}`}
                  >
                    {m === "packs" ? "packs" : unit}
                  </span>
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-fg-faint mt-1.5 mb-4">{stockHint}</p>

          {/* Price */}
          <label className="text-sm text-fg-muted mb-1 block">Price</label>
          <div className="relative mb-5">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-fg-faint">
              $
            </span>
            <input
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              className="w-full text-base border border-border-input rounded-xl pl-8 pr-4 py-3 focus:outline-none focus:border-border-focus"
            />
          </div>

          {/* Nutrition */}
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-fg-muted">
              Nutrition <span className="text-fg-faint">(for this amount)</span>
            </label>
            <motion.button
              onClick={reEstimate}
              whileTap={tap}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                auto ? "bg-surface-inverse text-fg-inverse" : "bg-surface-raised text-fg-muted"
              }`}
            >
              <Wand2 size={12} />
              {auto ? "Estimated" : "Re-estimate"}
            </motion.button>
          </div>
          <p className="text-xs text-fg-faint mb-3">
            {auto
              ? "Auto-estimated from the item and amount. Edit any value to override."
              : "Manually set. Tap Re-estimate to recalculate from the amount."}
          </p>
          <div className="grid grid-cols-3 gap-2 mb-6">
            {NUTRITION_FIELDS.map(({ key, label, unit: u }) => (
              <div key={key}>
                <label className="text-[11px] text-fg-faint mb-1 block">{label}</label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={nutrition[key]}
                    onChange={(e) => setNutritionField(key, e.target.value)}
                    className="w-full text-sm border border-border-input rounded-lg pl-2.5 pr-7 py-2 focus:outline-none focus:border-border-focus"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-fg-faint">
                    {u}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      </Collapse>

      <motion.button
        onClick={handleSubmit}
        whileTap={tap}
        disabled={!canSave}
        className="w-full bg-surface-inverse text-fg-inverse rounded-xl py-3.5 font-medium disabled:opacity-40"
      >
        {isEditing ? "Save changes" : "Add item"}
      </motion.button>

      {isEditing && (
        <motion.button
          onClick={handleDelete}
          whileTap={tap}
          className="w-full mt-3 py-3.5 rounded-xl text-red-500 font-medium bg-red-50"
        >
          Remove item
        </motion.button>
      )}
    </BottomSheet>
  );
}
