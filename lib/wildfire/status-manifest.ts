export type WildfireSourceHealth = "healthy" | "retrying" | "degraded";

export type WildfireSourceStatus = Readonly<{
  id: string;
  status: WildfireSourceHealth;
  stale: boolean;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  nextRetryAt?: string;
  lastGoodSnapshot?: string;
  error?: string;
}>;

/** The pure refresh contract written to `current-status.json`. */
export type WildfireCurrentStatusManifest = Readonly<{
  version: string;
  refreshedAt: string;
  sources: readonly WildfireSourceStatus[];
}>;
