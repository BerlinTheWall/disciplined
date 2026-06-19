import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, X } from "lucide-react";
import { useGroceryStore } from "../../store/groceryStore";
import { useShoppingListStore } from "../../store/shoppingListStore";
import { FOOD_CATEGORIES, FALLBACK_FOOD_ICON } from "../../lib/foodCategories";
import { formatUnit } from "../../lib/grocery";
import { spring, tap } from "../../lib/motion";

function money(n: number) {
  return `$${n.toFixed(2)}`;
}

interface CatalogPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  listId: string | null;
  onNewItem: () => void;
}

// Picks catalog items into a shopping list. Membership is a toggle: tapping an
// item adds a line (qty 1) or removes it. Quantities are tweaked back on the
// list itself.
export default function CatalogPickerSheet({
  isOpen,
  onClose,
  listId,
  onNewItem,
}: CatalogPickerSheetProps) {
  const groceryItems = useGroceryStore((s) => s.groceryItems);
  const lists = useShoppingListStore((s) => s.lists);
  const addLine = useShoppingListStore((s) => s.addLine);
  const removeLine = useShoppingListStore((s) => s.removeLine);

  const list = lists.find((l) => l.id === listId) ?? null;
  const inList = new Set(list?.lines.map((l) => l.itemId));

  function toggle(itemId: string) {
    if (!listId) return;
    if (inList.has(itemId)) removeLine(listId, itemId);
    else addLine(listId, itemId, 1);
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
            className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl z-50 p-5 pb-8 shadow-xl max-h-[88vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.snappy}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Add from your items</h2>
              <motion.button
                onClick={onClose}
                whileTap={tap}
                className="p-2 -m-2 text-gray-400"
              >
                <X size={22} />
              </motion.button>
            </div>

            <motion.button
              onClick={onNewItem}
              whileTap={tap}
              className="flex items-center gap-2 w-full mb-4 px-4 py-3 rounded-xl border border-dashed border-gray-300 text-gray-600"
            >
              <Plus size={16} />
              New item
            </motion.button>

            <div className="flex flex-col gap-2">
              {groceryItems.length === 0 ? (
                <p className="text-sm text-gray-400 px-1 py-6 text-center">
                  No items yet. Add your first one above.
                </p>
              ) : (
                groceryItems.map((item) => {
                  const cat = FOOD_CATEGORIES[item.category];
                  const Icon = cat.icon ?? FALLBACK_FOOD_ICON;
                  const selected = inList.has(item.id);
                  return (
                    <motion.button
                      key={item.id}
                      onClick={() => toggle(item.id)}
                      whileTap={tap}
                      className={`flex items-center gap-3 p-3 pr-4 rounded-2xl text-left ${
                        selected ? "bg-gray-900 text-white" : "bg-gray-50"
                      }`}
                    >
                      <span
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
                        style={{ backgroundColor: cat.color }}
                      >
                        {selected ? (
                          <Check size={15} strokeWidth={3} />
                        ) : (
                          <Icon size={14} />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`font-semibold leading-tight truncate ${
                            selected ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {item.name}
                        </p>
                        <p
                          className={`text-xs mt-0.5 ${
                            selected ? "text-gray-300" : "text-gray-400"
                          }`}
                        >
                          {formatUnit(item.quantity, item.unit)} ·{" "}
                          {item.nutrition.calories} kcal
                        </p>
                      </div>
                      <span
                        className={`font-semibold shrink-0 ${
                          selected ? "text-white" : "text-gray-900"
                        }`}
                      >
                        {money(item.price)}
                      </span>
                    </motion.button>
                  );
                })
              )}
            </div>

            <motion.button
              onClick={onClose}
              whileTap={tap}
              className="w-full mt-5 bg-gray-900 text-white rounded-xl py-3.5 font-medium"
            >
              Done
            </motion.button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}