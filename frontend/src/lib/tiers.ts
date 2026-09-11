import type { AuthUser, SubscriptionTier } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

// Client-side mirror of backend/app/tiers.py. Server-backed features are
// gated there; this is for device-local features the backend never sees
// (task presets), where the UI is the only place a gate can live.
const TIER_RANK: Record<SubscriptionTier, number> = { free: 0, plus: 1, pro: 2 };

// Fails closed: no user, a missing tier (a user cached before the field
// existed, until refreshUser runs), or an unrecognised value all rank as free.
export function hasTier(user: AuthUser | null, minimum: SubscriptionTier): boolean {
  const rank = TIER_RANK[user?.subscriptionTier as SubscriptionTier] ?? 0;
  return rank >= TIER_RANK[minimum];
}

export function useHasTier(minimum: SubscriptionTier): boolean {
  return useAuthStore((s) => hasTier(s.user, minimum));
}
