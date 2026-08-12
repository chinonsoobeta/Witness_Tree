export const SUBSCRIPTION_EVENT_CLASSES = [
  "fire",
  "official-record",
  "unmatched-detected-change",
  "annual-data-release",
  "correction",
  "coverage-grade-change",
] as const;

export type SubscriptionEventClass = (typeof SUBSCRIPTION_EVENT_CLASSES)[number];
export type SubscriptionStatus = "active" | "paused" | "unsubscribed";

/** Private record. Do not return this type from public views or logs. */
export type Subscription = Readonly<{
  id: string;
  emailAddress: string;
  normalizedEmail: string;
  placeId: string;
  eventClass: SubscriptionEventClass;
  status: SubscriptionStatus;
}>;

export type SubscriptionInput = Readonly<{
  id: string;
  emailAddress: string;
  placeId: string;
  eventClass: SubscriptionEventClass;
}>;

export type PublicSubscriptionSummary = Readonly<{
  id: string;
  placeId: string;
  eventClass: SubscriptionEventClass;
  status: SubscriptionStatus;
}>;

export function normalizeEmail(emailAddress: string): string {
  const normalized = emailAddress.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid email address is required.");
  return normalized;
}

export function createSubscription(input: SubscriptionInput): Subscription {
  if (!input.id.trim()) throw new Error("A subscription id is required.");
  if (!input.placeId.trim()) throw new Error("A place id is required.");
  if (!SUBSCRIPTION_EVENT_CLASSES.includes(input.eventClass)) throw new Error("A supported event class is required.");
  return Object.freeze({
    id: input.id,
    emailAddress: input.emailAddress.trim(),
    normalizedEmail: normalizeEmail(input.emailAddress),
    placeId: input.placeId.trim(),
    eventClass: input.eventClass,
    status: "active",
  });
}

export function addSubscription(
  subscriptions: readonly Subscription[],
  input: SubscriptionInput,
): readonly Subscription[] {
  const subscription = createSubscription(input);
  if (subscriptions.some((existing) =>
    existing.normalizedEmail === subscription.normalizedEmail
    && existing.placeId === subscription.placeId
    && existing.eventClass === subscription.eventClass
  )) {
    throw new Error("A subscription already exists for this email, place, and event class.");
  }
  return [...subscriptions, subscription];
}

export function setSubscriptionStatus(
  subscription: Subscription,
  status: SubscriptionStatus,
): Subscription {
  return Object.freeze({ ...subscription, status });
}

export function pauseSubscription(subscription: Subscription): Subscription {
  return setSubscriptionStatus(subscription, "paused");
}

export function unsubscribe(subscription: Subscription): Subscription {
  return setSubscriptionStatus(subscription, "unsubscribed");
}

export function publicSubscriptionSummary(subscription: Subscription): PublicSubscriptionSummary {
  return Object.freeze({
    id: subscription.id,
    placeId: subscription.placeId,
    eventClass: subscription.eventClass,
    status: subscription.status,
  });
}
