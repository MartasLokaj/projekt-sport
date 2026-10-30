// All tuning values live in this one file so they are easy to tweak.
// Later: swing power curve, ball friction, camera speeds, ...

export const TUNING = {
  network: {
    /** How long a page waits before trying to reconnect (milliseconds). */
    reconnectDelayMs: 2000,
  },
  demoCube: {
    /** Rotation speed of the Phase 0 test cube (radians per second). */
    spinSpeed: 0.8,
  },
} as const;
