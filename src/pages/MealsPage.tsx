import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, UtensilsCrossed } from 'lucide-react'
import { useMealStore } from '../store/mealStore'
import { useGroceryStore } from '../store/groceryStore'
import { indexItems, mealNutrition, dayNutrition } from '../lib/grocery'
import { todayISODate } from '../lib/date'
import { spring, tap, press } from '../lib/motion'
import AddMealSheet from '../components/meals/AddMealSheet'
import type { Meal, MealType } from '../types/meal'

const TYPE_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

const TYPE_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack']

export default function MealsPage() {
  const meals = useMealStore((s) => s.meals)
  const groceryItems = useGroceryStore((s) => s.groceryItems)

  const [editMeal, setEditMeal] = useState<Meal | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const items = indexItems(groceryItems)
  const today = todayISODate()

  const todaysMeals = meals
    .filter((m) => m.date === today)
    .sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type))

  const total = dayNutrition(todaysMeals, items)

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- Today's diet ---------- */}
      <div className="rounded-2xl bg-gray-900 text-white p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
          Eaten today
        </p>
        <p className="text-3xl font-bold mt-1">
          {total.calories}
          <span className="text-base font-medium text-gray-500"> kcal</span>
        </p>
        <div className="flex gap-2 mt-4">
          <Macro label="Protein" value={`${total.protein}g`} />
          <Macro label="Fat" value={`${total.fat}g`} />
          <Macro label="Carbs" value={`${total.carbs}g`} />
        </div>
      </div>

      {/* ---------- Meals ---------- */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-base font-semibold text-gray-900">Today's meals</h2>
          <motion.button
            onClick={() => setAddOpen(true)}
            whileTap={tap}
            className="flex items-center gap-1 text-sm text-gray-500"
          >
            <Plus size={15} />
            Log meal
          </motion.button>
        </div>

        {todaysMeals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <UtensilsCrossed size={24} className="text-gray-400" />
            </div>
            <p className="text-base font-medium text-gray-900">
              Nothing logged today
            </p>
            <p className="text-sm text-gray-400 text-center">
              Build a meal from the food you’ve saved to track your diet.
            </p>
          </div>
        ) : (
          todaysMeals.map((meal) => {
            const n = mealNutrition(meal, items)
            const parts = meal.components
              .map((c) => items[c.itemId]?.name)
              .filter(Boolean)
              .join(', ')
            return (
              <motion.button
                key={meal.id}
                onClick={() => setEditMeal(meal)}
                whileTap={press}
                transition={spring.snappy}
                className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50 text-left w-full"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 leading-tight truncate">
                      {meal.name}
                    </p>
                    <span className="text-[11px] font-medium text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 shrink-0">
                      {TYPE_LABELS[meal.type]}
                    </span>
                  </div>
                  {parts && (
                    <p className="text-xs text-gray-400 mt-1 truncate">{parts}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-1.5">
                    {n.protein}g protein · {n.fat}g fat · {n.carbs}g carbs
                  </p>
                </div>
                <p className="font-semibold text-gray-900 shrink-0">
                  {n.calories}
                  <span className="text-xs font-medium text-gray-400"> kcal</span>
                </p>
              </motion.button>
            )
          })
        )}
      </div>

      <AddMealSheet
        isOpen={addOpen || !!editMeal}
        editMeal={editMeal}
        onClose={() => {
          setAddOpen(false)
          setEditMeal(null)
        }}
      />
    </div>
  )
}

function Macro({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-xl bg-gray-800 px-3 py-2">
      <p className="text-[11px] text-gray-400">{label}</p>
      <p className="text-sm font-semibold mt-0.5">{value}</p>
    </div>
  )
}