import type { Reported } from "../domain/reported";
import {
  publicSubscriptionSummary,
  type PublicSubscriptionSummary,
  type Subscription,
  type SubscriptionEventClass,
}
// @ts-expect-error -- Node's TypeScript runner requires explicit local extensions.
from "./subscriptions.ts";

export type AlertChange = Readonly<{
  id: string;
  placeId: string;
  eventClass: SubscriptionEventClass;
  observedAt: string;
  reported: Reported;
}>;

/** A privacy-safe group of changes. It contains no delivery address or sender behaviour. */
export type Digest = Readonly<{
  subscription: PublicSubscriptionSummary;
  changes: readonly AlertChange[];
}>;

export function buildDigest(subscription: Subscription, changes: readonly AlertChange[]): Digest | null {
  if (subscription.status !== "active") return null;
  const groupedChanges = changes.filter((change) =>
    change.placeId === subscription.placeId && change.eventClass === subscription.eventClass,
  );
  if (groupedChanges.length === 0) return null;
  return Object.freeze({
    subscription: publicSubscriptionSummary(subscription),
    changes: groupedChanges,
  });
}

export function buildDigests(
  subscriptions: readonly Subscription[],
  changes: readonly AlertChange[],
): readonly Digest[] {
  return subscriptions
    .map((subscription) => buildDigest(subscription, changes))
    .filter((digest): digest is Digest => digest !== null);
}
