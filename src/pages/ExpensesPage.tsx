import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarPlus, Check, Minus, Pencil, Plus, ShoppingCart, X } from "lucide-react";
import { useShallow } from "zustand/shallow";

import AddExpenseSheet from "@/components/expenses/AddExpenseSheet";
import AddGroceryItemSheet from "@/components/expenses/AddGroceryItemSheet";
import CatalogPickerSheet from "@/components/expenses/CatalogPickerSheet";
import { CATEGORIES } from "@/lib/categories";
import { todayISODate } from "@/lib/date";
import { FALLBACK_FOOD_ICON, FOOD_CATEGORIES } from "@/lib/foodCategories";
import { formatAmount, indexItems, lineCost, listTotals } from "@/lib/grocery";
import { press, spring, tap } from "@/lib/motion";
import { useExpenseStore } from "@/store/expenseStore";
import { useGroceryStore } from "@/store/groceryStore";
import { useShoppingListStore } from "@/store/shoppingListStore";
import { useTaskStore } from "@/store/taskStore";
import type { Expense } from "@/types/expense";
import type { GroceryItem } from "@/types/grocery";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

export default function ExpensesPage() {
  const expenses = useExpenseStore((s) => s.expenses);
  const monthlyBudget = useExpenseStore((s) => s.monthlyBudget);
  const setMonthlyBudget = useExpenseStore((s) => s.setMonthlyBudget);
  const addExpense = useExpenseStore((s) => s.addExpense);

  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const [
    lists,
    activeListId,
    createList,
    setLineQty,
    removeLine,
    toggleLine,
    setListTask,
    markDone,
  ] = useShoppingListStore(
    useShallow((state) => [
      state.lists,
      state.activeListId,
      state.createList,
      state.setLineQty,
      state.removeLine,
      state.toggleLine,
      state.setListTask,
      state.markDone,
    ])
  );

  const addTask = useTaskStore((s) => s.addTask);

  const [editGrocery, setEditGrocery] = useState<GroceryItem | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [addExpenseOpen, setAddExpenseOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState("");

  const items = indexItems(groceryItems);
  const activeList = lists.find((l) => l.id === activeListId) ?? null;

  // ---- Budget + spend (this month) ----
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthExpenses = expenses
    .filter((e) => e.date.startsWith(monthPrefix))
    .sort((a, b) => b.date.localeCompare(a.date));
  const spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

  const hasBudget = monthlyBudget > 0;
  const ratio = hasBudget ? spent / monthlyBudget : 0;
  const barColor = !hasBudget
    ? "#4b5563"
    : ratio < 0.75
      ? "#34d399"
      : ratio < 1
        ? "#fbbf24"
        : "#f87171";

  // ---- Active shopping list (the current trip) ----
  const allTotals = activeList
    ? listTotals(activeList, items)
    : {
        count: 0,
        cost: 0,
        nutrition: { calories: 0, protein: 0, fat: 0, carbs: 0, sugar: 0, fiber: 0 },
      };
  const checkedTotals = activeList ? listTotals(activeList, items, true) : allTotals;
  const checkedCount = activeList ? activeList.lines.filter((l) => l.checked).length : 0;

  function startEditBudget() {
    setBudgetDraft(monthlyBudget ? String(monthlyBudget) : "");
    setEditingBudget(true);
  }

  function saveBudget() {
    const value = parseFloat(budgetDraft);
    setMonthlyBudget(isFinite(value) ? value : 0);
    setEditingBudget(false);
  }

  function startList() {
    createList({ title: "Shopping list", date: todayISODate() });
  }

  function scheduleRun() {
    if (!activeList || activeList.taskId) return;
    const taskId = addTask({
      title: activeList.title || "Grocery run",
      startMinutes: 17 * 60,
      durationMinutes: 30,
      color: "#fbbf24",
      icon: "shopping",
      date: activeList.date,
      shoppingListId: activeList.id,
    });
    setListTask(activeList.id, taskId);
  }

  function logTrip() {
    if (!activeList || checkedCount === 0) return;
    const expenseId = addExpense({
      amount: checkedTotals.cost,
      note: `Groceries (${checkedCount} item${checkedCount > 1 ? "s" : ""})`,
      category: "food",
      date: todayISODate(),
    });
    markDone(activeList.id, expenseId);
    createList({ title: "Shopping list", date: todayISODate() });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- Budget ---------- */}
      <div className="rounded-2xl bg-surface-feature text-white p-5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            Spent this month
          </p>
          {!editingBudget && (
            <motion.button
              onClick={startEditBudget}
              whileTap={tap}
              className="flex items-center gap-1 text-xs text-gray-400"
            >
              <Pencil size={12} />
              Budget
            </motion.button>
          )}
        </div>

        {editingBudget ? (
          <div className="mt-3">
            <label className="text-xs text-gray-400 mb-1 block">Monthly budget</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="w-full bg-surface-feature-alt text-white rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-500"
                />
              </div>
              <motion.button
                onClick={saveBudget}
                whileTap={tap}
                className="px-3 rounded-xl bg-white text-gray-900"
              >
                <Check size={18} />
              </motion.button>
              <motion.button
                onClick={() => setEditingBudget(false)}
                whileTap={tap}
                className="px-3 rounded-xl bg-surface-feature-alt text-gray-300"
              >
                <X size={18} />
              </motion.button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-3xl font-bold mt-1">
              {money(spent)}
              {hasBudget && (
                <span className="text-base font-medium text-gray-500">
                  {" "}
                  / {money(monthlyBudget)}
                </span>
              )}
            </p>

            {hasBudget ? (
              <>
                <div className="mt-4 h-2 rounded-full bg-surface-feature-alt overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: barColor }}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(ratio, 1) * 100}%` }}
                    transition={spring.gentle}
                  />
                </div>
                <p className="text-sm text-gray-400 mt-2">
                  {spent > monthlyBudget
                    ? `${money(spent - monthlyBudget)} over budget`
                    : `${money(monthlyBudget - spent)} left`}
                </p>
              </>
            ) : (
              <motion.button
                onClick={startEditBudget}
                whileTap={tap}
                className="mt-3 text-sm text-gray-300 underline underline-offset-2"
              >
                Set a monthly budget
              </motion.button>
            )}
          </>
        )}
      </div>

      {/* ---------- Shopping list (current trip) ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold text-fg">
            {activeList ? activeList.title : "Shopping list"}
          </h2>
          {activeList && (
            <span className="text-sm text-fg-faint">
              {allTotals.count} item{allTotals.count === 1 ? "" : "s"} · {money(allTotals.cost)}
            </span>
          )}
        </div>

        {!activeList ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
              <ShoppingCart size={24} className="text-fg-faint" />
            </div>
            <p className="text-base font-medium text-fg">No active list</p>
            <motion.button
              onClick={startList}
              whileTap={tap}
              className="mt-1 bg-surface-inverse text-fg-inverse text-sm font-medium rounded-full px-4 py-2"
            >
              Start a list
            </motion.button>
          </div>
        ) : (
          <>
            {/* Add-from-catalog + schedule row */}
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setPickerOpen(true)}
                whileTap={tap}
                className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-surface-raised text-fg-muted text-sm font-medium"
              >
                <Plus size={16} />
                Add items
              </motion.button>
              {activeList.taskId ? (
                <span className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-alt text-fg-faint text-sm">
                  <CalendarPlus size={15} />
                  Scheduled
                </span>
              ) : (
                <motion.button
                  onClick={scheduleRun}
                  whileTap={tap}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-surface-raised text-fg-muted text-sm font-medium"
                >
                  <CalendarPlus size={15} />
                  Schedule
                </motion.button>
              )}
            </div>

            {/* Checked-trip summary */}
            <AnimatePresence>
              {checkedCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={spring.snappy}
                  className="rounded-2xl border border-border-strong p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-fg-muted">
                      {checkedCount} in cart ·{" "}
                      <span className="font-semibold text-fg">{money(checkedTotals.cost)}</span>
                    </p>
                    <motion.button
                      onClick={logTrip}
                      whileTap={tap}
                      className="flex items-center gap-1.5 bg-surface-inverse text-fg-inverse text-sm font-medium rounded-full px-3.5 py-1.5"
                    >
                      <ShoppingCart size={14} />
                      Log trip
                    </motion.button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <NutriChip label={`${checkedTotals.nutrition.calories} kcal`} />
                    <NutriChip label={`${checkedTotals.nutrition.protein}g protein`} />
                    <NutriChip label={`${checkedTotals.nutrition.fat}g fat`} />
                    <NutriChip label={`${checkedTotals.nutrition.sugar}g sugar`} />
                    <NutriChip label={`${checkedTotals.nutrition.fiber}g fiber`} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {activeList.lines.length === 0 ? (
              <p className="text-sm text-fg-faint px-1 py-6 text-center">
                Empty list. Tap "Add items" to pull from the food and products you've saved.
              </p>
            ) : (
              activeList.lines.map((line) => {
                const item = items[line.itemId];
                if (!item) {
                  return (
                    <div
                      key={line.itemId}
                      className="flex items-center gap-3 p-3 pr-4 rounded-2xl bg-surface-alt"
                    >
                      <span className="flex-1 text-sm text-fg-faint">
                        Item no longer in your catalog
                      </span>
                      <motion.button
                        onClick={() => removeLine(activeList.id, line.itemId)}
                        whileTap={tap}
                        className="text-fg-faint"
                      >
                        <X size={16} />
                      </motion.button>
                    </div>
                  );
                }
                const cat = FOOD_CATEGORIES[item.category];
                const Icon = cat.icon ?? FALLBACK_FOOD_ICON;
                return (
                  <div
                    key={line.itemId}
                    className="flex items-center gap-3 p-3 pr-4 rounded-2xl bg-surface-alt"
                  >
                    {/* Tick off during the trip */}
                    <motion.button
                      onClick={() => toggleLine(activeList.id, line.itemId)}
                      whileTap={tap}
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors"
                      style={{
                        backgroundColor: line.checked ? cat.color : "transparent",
                        borderColor: line.checked ? cat.color : "var(--border-input)",
                      }}
                      aria-label={line.checked ? "Uncheck" : "Check"}
                    >
                      <AnimatePresence>
                        {line.checked && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            exit={{ scale: 0 }}
                            transition={spring.pop}
                            className="text-white"
                          >
                            <Check size={15} strokeWidth={3} />
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>

                    {/* Tap to edit the catalog item */}
                    <motion.button
                      onClick={() => setEditGrocery(item)}
                      whileTap={press}
                      transition={spring.snappy}
                      className="flex-1 min-w-0 text-left"
                    >
                      <p className="font-semibold text-fg leading-tight truncate">{item.name}</p>
                      <p className="text-xs text-fg-faint mt-0.5 flex items-center gap-1.5">
                        <span
                          className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white shrink-0"
                          style={{ backgroundColor: cat.color }}
                        >
                          <Icon size={9} />
                        </span>
                        {formatAmount(item, line.qty)} · {money(lineCost(item, line.qty))}
                      </p>
                    </motion.button>

                    {/* Quantity stepper */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <motion.button
                        onClick={() => setLineQty(activeList.id, line.itemId, line.qty - 1)}
                        whileTap={tap}
                        className="w-7 h-7 rounded-full bg-surface-subtle text-fg-muted flex items-center justify-center"
                        aria-label="Less"
                      >
                        <Minus size={14} />
                      </motion.button>
                      <span className="w-6 text-center text-sm font-medium text-fg">
                        ×{line.qty}
                      </span>
                      <motion.button
                        onClick={() => setLineQty(activeList.id, line.itemId, line.qty + 1)}
                        whileTap={tap}
                        className="w-7 h-7 rounded-full bg-surface-subtle text-fg-muted flex items-center justify-center"
                        aria-label="More"
                      >
                        <Plus size={14} />
                      </motion.button>
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {/* ---------- This month's expenses ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold text-fg">This month</h2>
          <motion.button
            onClick={() => setAddExpenseOpen(true)}
            whileTap={tap}
            className="flex items-center gap-1 text-sm text-fg-muted"
          >
            <Plus size={15} />
            Add expense
          </motion.button>
        </div>

        {monthExpenses.length === 0 ? (
          <p className="text-sm text-fg-faint px-1">
            No expenses logged yet. Log a grocery trip above or add one here.
          </p>
        ) : (
          monthExpenses.map((expense) => {
            const cat = CATEGORIES[expense.category];
            const Icon = cat.icon;
            return (
              <motion.button
                key={expense.id}
                onClick={() => setEditExpense(expense)}
                whileTap={press}
                transition={spring.snappy}
                className="flex items-center gap-3 p-3 pr-4 rounded-2xl bg-surface-alt text-left w-full"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  <Icon size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-fg leading-tight truncate">{expense.note}</p>
                  <p className="text-xs text-fg-faint mt-0.5">{cat.label}</p>
                </div>
                <p className="font-semibold text-fg shrink-0">{money(expense.amount)}</p>
              </motion.button>
            );
          })
        )}
      </div>

      {/* Sheets */}
      <CatalogPickerSheet
        isOpen={pickerOpen}
        listId={activeListId}
        onClose={() => setPickerOpen(false)}
        onNewItem={() => setAddItemOpen(true)}
      />
      <AddGroceryItemSheet
        isOpen={addItemOpen || !!editGrocery}
        editItem={editGrocery}
        onClose={() => {
          setAddItemOpen(false);
          setEditGrocery(null);
        }}
      />
      <AddExpenseSheet
        isOpen={addExpenseOpen || !!editExpense}
        editExpense={editExpense}
        onClose={() => {
          setAddExpenseOpen(false);
          setEditExpense(null);
        }}
      />
    </div>
  );
}

function NutriChip({ label }: { label: string }) {
  return (
    <span className="text-xs font-medium text-fg-muted bg-surface-raised rounded-full px-2.5 py-1">
      {label}
    </span>
  );
}
