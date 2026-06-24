import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Minus, Package } from 'lucide-react'
import { useGroceryStore } from '../store/groceryStore'
import { FOOD_CATEGORIES, FALLBACK_FOOD_ICON } from '../lib/foodCategories'
import { formatUnit } from '../lib/grocery'
import { spring, tap, press } from '../lib/motion'
import AddGroceryItemSheet from '../components/expenses/AddGroceryItemSheet'
import type { GroceryItem } from '../types/grocery'

function money(n: number) {
  return `$${n.toFixed(2)}`
}

export default function FoodPage() {
  const groceryItems = useGroceryStore((s) => s.groceryItems)
  const adjustStock = useGroceryStore((s) => s.adjustStock)

  const [editItem, setEditItem] = useState<GroceryItem | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  // Sort by category (catalog order), then name, so similar things sit together.
  const catOrder = Object.keys(FOOD_CATEGORIES)
  const items = [...groceryItems].sort((a, b) => {
    const c = catOrder.indexOf(a.category) - catOrder.indexOf(b.category)
    return c !== 0 ? c : a.name.localeCompare(b.name)
  })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-base font-semibold text-fg">Everything you have</h2>
        <motion.button
          onClick={() => setAddOpen(true)}
          whileTap={tap}
          className="flex items-center gap-1 text-sm text-fg-muted"
        >
          <Plus size={15} />
          Add item
        </motion.button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-14 h-14 rounded-full bg-surface-raised flex items-center justify-center">
            <Package size={24} className="text-fg-faint" />
          </div>
          <p className="text-base font-medium text-fg">Nothing here yet</p>
          <p className="text-sm text-fg-faint text-center">
            Add the food and products you have, with their details. Meals and recipes
            are built from this list.
          </p>
        </div>
      ) : (
        items.map((item) => {
          const cat = FOOD_CATEGORIES[item.category]
          const Icon = cat.icon ?? FALLBACK_FOOD_ICON
          const out = item.stock <= 0
          return (
            <div key={item.id} className="flex items-center gap-3 p-3 pr-3 rounded-2xl bg-surface-alt">
              {/* Tap to edit full details */}
              <motion.button
                onClick={() => setEditItem(item)}
                whileTap={press}
                transition={spring.snappy}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <span
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0"
                  style={{ backgroundColor: cat.color }}
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-fg leading-tight truncate">{item.name}</p>
                  <p className="text-xs text-fg-faint mt-0.5">
                    {formatUnit(item.quantity, item.unit)} · {money(item.price)} ·{' '}
                    {item.nutrition.calories} kcal
                  </p>
                </div>
              </motion.button>

              {/* Stock stepper — adjusts by one reference amount */}
              <div className="flex items-center gap-1.5 shrink-0">
                <motion.button
                  onClick={() => adjustStock(item.id, -item.quantity)}
                  whileTap={tap}
                  className="w-7 h-7 rounded-full bg-surface-subtle text-fg-muted flex items-center justify-center"
                  aria-label="Less stock"
                >
                  <Minus size={14} />
                </motion.button>
                <span
                  className={`min-w-16 text-center text-xs font-medium tabular-nums ${out ? 'text-red-500' : 'text-fg'}`}
                >
                  {out ? 'Out' : formatUnit(Math.round(item.stock * 10) / 10, item.unit)}
                </span>
                <motion.button
                  onClick={() => adjustStock(item.id, item.quantity)}
                  whileTap={tap}
                  className="w-7 h-7 rounded-full bg-surface-subtle text-fg-muted flex items-center justify-center"
                  aria-label="More stock"
                >
                  <Plus size={14} />
                </motion.button>
              </div>
            </div>
          )
        })
      )}

      <AddGroceryItemSheet
        isOpen={addOpen || !!editItem}
        editItem={editItem}
        onClose={() => {
          setAddOpen(false)
          setEditItem(null)
        }}
      />
    </div>
  )
}
