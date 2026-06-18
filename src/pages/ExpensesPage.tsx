import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Pencil, Plus, ShoppingCart, X } from 'lucide-react'
import { useExpenseStore } from '../store/expenseStore'
import { useGroceryStore } from '../store/groceryStore'
import { CATEGORIES } from '../lib/categories'
import { FOOD_CATEGORIES, FALLBACK_FOOD_ICON } from '../lib/foodCategories'
import { addNutrition, emptyNutrition } from '../lib/nutritions'
import { todayISODate } from '../lib/date'
import { spring, tap, press } from '../lib/motion'
import AddGroceryItemSheet from '../components/expenses/AddGroceryItemSheet'
import AddExpenseSheet from '../components/expenses/AddExpenseSheet'
import type { GroceryItem } from '../types/grocery'
import type { Expense } from '../types/expense'

function money(n: number) {
  return `$${n.toFixed(2)}`
}

function amountLabel(item: GroceryItem) {
  if (item.unit === 'unit') {
    return `${item.quantity} ${item.quantity === 1 ? 'pc' : 'pcs'}`
  }
  return `${item.quantity} ${item.unit}`
}

export default function ExpensesPage() {
  const expenses = useExpenseStore((s) => s.expenses)
  const monthlyBudget = useExpenseStore((s) => s.monthlyBudget)
  const setMonthlyBudget = useExpenseStore((s) => s.setMonthlyBudget)
  const addExpense = useExpenseStore((s) => s.addExpense)

  const groceryItems = useGroceryStore((s) => s.groceryItems)
  const toggleChecked = useGroceryStore((s) => s.toggleChecked)
  const clearChecked = useGroceryStore((s) => s.clearChecked)

  const [editGrocery, setEditGrocery] = useState<GroceryItem | null>(null)
  const [editExpense, setEditExpense] = useState<Expense | null>(null)
  const [addExpenseOpen, setAddExpenseOpen] = useState(false)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')

  // ---- Budget + spend (this month) ----
  const now = new Date()
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthExpenses = expenses
    .filter((e) => e.date.startsWith(monthPrefix))
    .sort((a, b) => b.date.localeCompare(a.date))
  const spent = monthExpenses.reduce((sum, e) => sum + e.amount, 0)

  const hasBudget = monthlyBudget > 0
  const ratio = hasBudget ? spent / monthlyBudget : 0
  const barColor = !hasBudget
    ? '#4b5563'
    : ratio < 0.75
      ? '#34d399'
      : ratio < 1
        ? '#fbbf24'
        : '#f87171'

  // ---- Grocery checklist ----
  const checked = groceryItems.filter((g) => g.checked)
  const checkedCost = checked.reduce((sum, g) => sum + g.price, 0)
  const checkedNutrition = checked.reduce(
    (acc, g) => addNutrition(acc, g.nutrition),
    emptyNutrition(),
  )

  function startEditBudget() {
    setBudgetDraft(monthlyBudget ? String(monthlyBudget) : '')
    setEditingBudget(true)
  }

  function saveBudget() {
    const value = parseFloat(budgetDraft)
    setMonthlyBudget(isFinite(value) ? value : 0)
    setEditingBudget(false)
  }

  function logTrip() {
    if (checked.length === 0) return
    addExpense({
      amount: Math.round(checkedCost * 100) / 100,
      note: `Groceries (${checked.length} item${checked.length > 1 ? 's' : ''})`,
      category: 'food',
      date: todayISODate(),
    })
    clearChecked()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- Budget ---------- */}
      <div className="rounded-2xl bg-gray-900 text-white p-5">
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
            <label className="text-xs text-gray-400 mb-1 block">
              Monthly budget
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  placeholder="0"
                  autoFocus
                  className="w-full bg-gray-800 text-white rounded-xl pl-7 pr-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-gray-500"
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
                className="px-3 rounded-xl bg-gray-800 text-gray-300"
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
                  {' '}
                  / {money(monthlyBudget)}
                </span>
              )}
            </p>

            {hasBudget ? (
              <>
                <div className="mt-4 h-2 rounded-full bg-gray-800 overflow-hidden">
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

      {/* ---------- Grocery list ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold text-gray-900">Grocery list</h2>
          <span className="text-sm text-gray-400">
            {groceryItems.length} item{groceryItems.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Checked-trip summary */}
        <AnimatePresence>
          {checked.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={spring.snappy}
              className="rounded-2xl border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-gray-500">
                  {checked.length} selected ·{' '}
                  <span className="font-semibold text-gray-900">
                    {money(checkedCost)}
                  </span>
                </p>
                <motion.button
                  onClick={logTrip}
                  whileTap={tap}
                  className="flex items-center gap-1.5 bg-gray-900 text-white text-sm font-medium rounded-full px-3.5 py-1.5"
                >
                  <ShoppingCart size={14} />
                  Log trip
                </motion.button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <NutriChip label={`${checkedNutrition.calories} kcal`} />
                <NutriChip label={`${checkedNutrition.protein}g protein`} />
                <NutriChip label={`${checkedNutrition.fat}g fat`} />
                <NutriChip label={`${checkedNutrition.sugar}g sugar`} />
                <NutriChip label={`${checkedNutrition.fiber}g fiber`} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {groceryItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <ShoppingCart size={24} className="text-gray-400" />
            </div>
            <p className="text-base font-medium text-gray-900">
              No grocery items yet
            </p>
            <p className="text-sm text-gray-400 text-center">
              Tap the + button to build your shopping list.
            </p>
          </div>
        ) : (
          groceryItems.map((item) => {
            const cat = FOOD_CATEGORIES[item.category]
            const Icon = cat.icon ?? FALLBACK_FOOD_ICON
            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 pr-4 rounded-2xl bg-gray-50"
              >
                {/* Checkbox */}
                <motion.button
                  onClick={() => toggleChecked(item.id)}
                  whileTap={tap}
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors"
                  style={{
                    backgroundColor: item.checked ? cat.color : 'transparent',
                    borderColor: item.checked ? cat.color : '#d1d5db',
                  }}
                  aria-label={item.checked ? 'Uncheck' : 'Check'}
                >
                  <AnimatePresence>
                    {item.checked && (
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

                {/* Tap to edit */}
                <motion.button
                  onClick={() => setEditGrocery(item)}
                  whileTap={press}
                  transition={spring.snappy}
                  className="flex-1 min-w-0 text-left"
                >
                  <p className="font-semibold text-gray-900 leading-tight truncate">
                    {item.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-white shrink-0"
                      style={{ backgroundColor: cat.color }}
                    >
                      <Icon size={9} />
                    </span>
                    {amountLabel(item)} · {item.nutrition.calories} kcal ·{' '}
                    {item.nutrition.protein}g protein
                  </p>
                </motion.button>

                <p className="font-semibold text-gray-900 shrink-0">
                  {money(item.price)}
                </p>
              </div>
            )
          })
        )}
      </div>

      {/* ---------- This month's expenses ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold text-gray-900">This month</h2>
          <motion.button
            onClick={() => setAddExpenseOpen(true)}
            whileTap={tap}
            className="flex items-center gap-1 text-sm text-gray-500"
          >
            <Plus size={15} />
            Add expense
          </motion.button>
        </div>

        {monthExpenses.length === 0 ? (
          <p className="text-sm text-gray-400 px-1">
            No expenses logged yet. Log a grocery trip above or add one here.
          </p>
        ) : (
          monthExpenses.map((expense) => {
            const cat = CATEGORIES[expense.category]
            const Icon = cat.icon
            return (
              <motion.button
                key={expense.id}
                onClick={() => setEditExpense(expense)}
                whileTap={press}
                transition={spring.snappy}
                className="flex items-center gap-3 p-3 pr-4 rounded-2xl bg-gray-50 text-left w-full"
              >
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  <Icon size={16} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 leading-tight truncate">
                    {expense.note}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{cat.label}</p>
                </div>
                <p className="font-semibold text-gray-900 shrink-0">
                  {money(expense.amount)}
                </p>
              </motion.button>
            )
          })
        )}
      </div>

      {/* Sheets — edit grocery, add/edit one-off expense */}
      <AddGroceryItemSheet
        isOpen={!!editGrocery}
        editItem={editGrocery}
        onClose={() => setEditGrocery(null)}
      />
      <AddExpenseSheet
        isOpen={addExpenseOpen || !!editExpense}
        editExpense={editExpense}
        onClose={() => {
          setAddExpenseOpen(false)
          setEditExpense(null)
        }}
      />
    </div>
  )
}

function NutriChip({ label }: { label: string }) {
  return (
    <span className="text-xs font-medium text-gray-600 bg-gray-100 rounded-full px-2.5 py-1">
      {label}
    </span>
  )
}