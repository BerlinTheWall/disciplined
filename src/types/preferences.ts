// Lightweight eating preferences used to personalise recipe suggestions. Kept
// deliberately simple: everything matches against a recipe's free-form `tags`.
export interface Preferences {
  // Tags a recipe must NOT carry to be suggested (e.g. "meat", "dairy").
  avoidTags: string[];
  // Tags that boost a recipe's rank when present (e.g. "high-protein", "quick").
  likedTags: string[];
  // Hide recipes that take longer than this to cook. Undefined = no limit.
  maxCookMinutes?: number;
}
