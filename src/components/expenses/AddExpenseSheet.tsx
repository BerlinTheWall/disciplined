/* eslint-disable react-hooks/set-state-in-effect */
/* eslint-disable react-hooks/immutability */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useExpenseStore } from "../../store/expenseStore";
import { CATEGORIES, CATEGORY_KEYS, type CategoryKey } from "../../lib/categories";
import { todayISODate } from "../../lib/date";
import { spring, tap } from "../../lib/motion";
import { useScrollLock } from "../../hooks/useScrollLock";
import { useAutoFocus } from "../../hooks/useAutoFocus";
import { useConfirm } from "../ConfirmDialog";
import type { Expense } from "../../types/expense";

interface AddExpenseSheetProps {
  isOpen: boolean;
  onClose: () => void;
  editExpense?: Expense | null;
}

export default function AddExpenseSheet({
  isOpen,
  onClose,
  editExpense,
}: AddExpenseSheetProps) {
  const addExpense = useExpenseStore((s) => s.addExpense);
  const updateExpense = useExpenseStore((s) => s.updateExpense);
  const deleteExpense = useExpenseStore((s) => s.deleteExpense);
  const confirm = useConfirm();

  const isEditing = !!editExpense;
  useScrollLock(isOpen);
  const amountRef = useRef<HTMLInputElement>(null);
  useAutoFocus(amountRef, isOpen);

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<CategoryKey>("food");
  const [date, setDate] = useState(todayISODate());

  useEffect(() => {
    if (editExpense) {
      setAmount(String(editExpense.amount));
      setNote(editExpense.note);
      setCategory(editExpense.category);
      setDate(editExpense.date);
    } else {
      resetForm();
    }
  }, [editExpense]);

  function resetForm() {
    setAmount("");
    setNote("");
    setCategory("food");
    setDate(todayISODate());
  }

  async function handleSubmit() {
    const value = parseFloat(amount);
    if (!isFinite(value) || value <= 0) return;

    const payload = {
      amount: Math.round(value * 100) / 100,
      note: note.trim() || CATEGORIES[category].label,
      category,
      date,
    };

    if (isEditing) {
      const ok = await confirm({
        title: "Save changes?",
        message: "Update this expense with your edits.",
        confirmLabel: "Save",
      });
      if (!ok) return;
      updateExpense(editExpense!.id, payload);
    } else {
      addExpense(payload);
    }
    onClose();
  }

  async function handleDelete() {
    if (!editExpense) return;
    const ok = await confirm({
      title: "Delete expense?",
      message: `"${editExpense.note}" will be permanently removed.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    deleteExpense(editExpense.id);
    onClose();
  }

  const canSave = isFinite(parseFloat(amount)) && parseFloat(amount) > 0;

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
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-2xl z-50 p-5 pb-8 shadow-xl max-h-[85vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-fg">
                {isEditing ? "Edit expense" : "New expense"}
              </h2>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="p-2 -m-2 text-fg-faint"
              >
                <X size={22} />
              </motion.button>
            </div>

            {/* Amount */}
            <label className="text-sm text-fg-muted mb-1 block">Amount</label>
            <div className="relative mb-4">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base text-fg-faint">
                $
              </span>
              <input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full text-base border border-border-input rounded-xl pl-8 pr-4 py-3 focus:outline-none focus:border-border-focus"
              />
            </div>

            {/* Note */}
            <label className="text-sm text-fg-muted mb-1 block">Note</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What was it for?"
              className="w-full text-base border border-border-input rounded-xl px-4 py-3 mb-4 focus:outline-none focus:border-border-focus"
            />

            {/* Category */}
            <label className="text-sm text-fg-muted mb-2 block">Category</label>
            <div className="flex gap-2 flex-wrap mb-4">
              {CATEGORY_KEYS.map((key) => {
                const { icon: Icon, label, color } = CATEGORIES[key];
                const selected = category === key;
                return (
                  <motion.button
                    key={key}
                    onClick={() => setCategory(key)}
                    whileTap={tap}
                    className={`flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-full text-sm font-medium ${
                      selected
                        ? "bg-surface-inverse text-fg-inverse"
                        : "bg-surface-raised text-fg-muted"
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

            {/* Date */}
            <label className="text-sm text-fg-muted mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-base border border-border-input rounded-xl px-4 py-3 mb-6 focus:outline-none focus:border-border-focus"
            />

            <motion.button
              onClick={handleSubmit}
              whileTap={tap}
              disabled={!canSave}
              className="w-full bg-surface-inverse text-fg-inverse rounded-xl py-3.5 font-medium disabled:opacity-40"
            >
              {isEditing ? "Save changes" : "Add expense"}
            </motion.button>

            {isEditing && (
              <motion.button
                onClick={handleDelete}
                whileTap={tap}
                className="w-full mt-3 py-3.5 rounded-xl text-red-500 font-medium bg-red-50"
              >
                Delete expense
              </motion.button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
