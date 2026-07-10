/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronDown, ChevronUp, Wand2, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import { useAutoFocus } from "@/hooks/useAutoFocus";
import {
  FALLBACK_FOOD_ICON,
  FOOD_CATEGORIES,
  FOOD_CATEGORY_KEYS,
  type FoodCategoryKey,
} from "@/lib/foodCategories";
import { spring, tap } from "@/lib/motion";
import {
  emptyNutrition,
  estimateNutrition,
  NUTRITION_FIELDS,
  suggestCategory,
  UNITS,
  type Nutrition,
  type Unit,
} from "@/lib/nutritions";
import { useGroceryStore } from "@/store/groceryStore";
import type { GroceryItem } from "@/types/grocery";
import BottomSheet from "../BottomSheet";
import Collapse from "../Collapse";
import { useConfirm } from "../ConfirmDialog";

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
  const [stock, setStock] = useState("100");
  const [price, setPrice] = useState("");
  const [nutrition, setNutrition] = useState<Nutrition>(emptyNutrition());
  const [auto, setAuto] = useState(true);
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
      setStock(String(editItem.stock));
      setPrice(String(editItem.price));
      setNutrition(editItem.nutrition);
      setAuto(editItem.autoNutrition);
    } else {
      setName("");
      setCategory("protein");
      setCategoryTouched(false);
      setQuantity("100");
      setUnit("g");
      setStock("100");
      setPrice("");
      setNutrition(emptyNutrition());
      setAuto(true);
    }
  }, [editItem]);

  const qtyNum = parseFloat(quantity);

  useEffect(() => {
    if (!auto) return;
    setNutrition(estimateNutrition(name, category, qtyNum, unit));
  }, [auto, name, category, qtyNum, unit]);

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

  function setNutritionField(key: keyof Nutrition, raw: string) {
    const value = parseFloat(raw);
    setNutrition((prev) => ({ ...prev, [key]: isFinite(value) ? value : 0 }));
    setAuto(false);
  }

  function reEstimate() {
    setAuto(true);
  }

  async function handleSubmit() {
    if (!isFinite(qtyNum) || qtyNum <= 0) return;
    const priceNum = parseFloat(price);

    const stockNum = parseFloat(stock);

    const payload = {
      name: name.trim() || FOOD_CATEGORIES[category].label,
      category,
      price: isFinite(priceNum) ? Math.round(priceNum * 100) / 100 : 0,
      quantity: qtyNum,
      unit,
      stock: isFinite(stockNum) && stockNum > 0 ? stockNum : 0,
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

      {/* Category */}
      <label className="text-sm text-fg-muted mb-2 block">Category</label>
      <div className="flex gap-2 flex-wrap mb-4">
        {FOOD_CATEGORY_KEYS.map((key) => {
          const { icon, label, color } = FOOD_CATEGORIES[key];
          const Icon = icon ?? FALLBACK_FOOD_ICON;
          const selected = category === key;
          return (
            <motion.button
              key={key}
              onClick={() => pickCategory(key)}
              whileTap={tap}
              className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-sm font-medium ${
                selected ? "bg-surface-inverse text-fg-inverse" : "bg-surface-raised text-fg-muted"
              }`}
            >
              <span
                className="w-6 h-6 rounded-full flex items-center justify-center text-white shrink-0"
                style={{ backgroundColor: color }}
              >
                <Icon size={13} />
              </span>
              {label}
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
          {/* In stock */}
          <label className="text-sm text-fg-muted mb-1 block">
            In stock <span className="text-fg-faint">(how much you have now)</span>
          </label>
          <div className="relative mb-4">
            <input
              type="number"
              inputMode="decimal"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              placeholder="0"
              className="w-full text-base border border-border-input rounded-xl px-4 py-3 pr-12 focus:outline-none focus:border-border-focus"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-fg-faint">
              {unit}
            </span>
          </div>

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
