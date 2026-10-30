// All tuning values live in this one file so they are easy to tweak.
// Later: swing power curve, ball friction, camera speeds, ...

export const TUNING = {
  network: {
    /** How long a page waits before trying to reconnect (milliseconds). */
    reconnectDelayMs: 1500,
    /**
     * How often the server checks that each phone is still there (milliseconds).
     * A phone that misses one check is marked as disconnected.
     */
    heartbeatIntervalMs: 3000,
  },
} as const;
