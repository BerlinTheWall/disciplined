// A shopping list is one trip. Each line references a catalog item by id with a
// quantity multiplier (multiples of that item's reference amount), plus a
// per-trip `checked` flag — this is where `checked` belongs now, on the trip
// rather than on the catalog item.
//
// Completing a trip mints an Expense (from the checked lines' cost) and records
// its id here for provenance. A list may also belong to a scheduled grocery
// task via `taskId`.
export interface ShoppingListLine {
  itemId: string;
  qty: number; // multiples of the catalog item's reference amount
  checked: boolean; // ticked off during the trip
}

export type ShoppingListStatus = "planned" | "done";

export interface ShoppingList {
  id: string;
  title: string;
  date: string; // ISO date the trip is planned/created
  status: ShoppingListStatus;
  lines: ShoppingListLine[];
  taskId?: string; // the scheduled grocery task this list belongs to
  expenseId?: string; // the expense created when the trip was logged
}
