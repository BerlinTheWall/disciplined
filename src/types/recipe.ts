import type { MealComponent } from "./meal";

// A recipe is a reusable "how to make it": a set of ingredients (referencing the
// same food catalog as meals/shopping, scaled by servings) plus ordered steps.
// It links two ways:
//  - a schedule Task (cooking / meal prep) links a recipe so you know what to make;
//  - logging a Meal can pull a recipe in, copying its ingredients as the meal's
//    components so nutrition rolls up automatically.
// Ingredients share MealComponent's shape ({ itemId, servings }) precisely so a
// recipe can drop straight into a meal.
export type RecipeIngredient = MealComponent;

export interface Recipe {
  id: string;
  name: string;
  color: string;
  servings: number; // how many servings the full recipe yields
  timeMin?: number; // total time to make, minutes
  description?: string;
  ingredients: RecipeIngredient[];
  steps: string[];
}
