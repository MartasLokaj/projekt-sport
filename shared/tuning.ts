// All tuning values live in this one file so they are easy to tweak.
// Later: ball friction, camera speeds, ...

/** Which gyroscope axis measures the swing. 'auto' picks the axis that moves most in the backswing. */
export type SwingAxis = 'auto' | 'alpha' | 'beta' | 'gamma';

export const TUNING = {
  network: {
    /** How long a page waits before trying to reconnect (milliseconds). */
    reconnectDelayMs: 1500,
    /**
     * How often the server checks that each phone is still there (milliseconds).
     * A phone that misses one check is marked as disconnected.
     */
    heartbeatIntervalMs: 3000,
    /** The server ignores a second stroke from the same phone within this time (milliseconds). */
    minStrokeIntervalMs: 800,
  },

  aim: {
    /** How far the aim turns per pixel of finger drag (degrees). */
    degreesPerPixel: 0.35,
    /** Minimum time between aim updates sent by the phone (milliseconds). 50 = 20 per second. */
    sendIntervalMs: 50,
  },

  // Swing speeds are gyroscope rotation rates in degrees per second.
  // The big screen shows the measured peak after every swing, which helps to pick these numbers.
  // Later these become per-player settings (handedness, sensitivity, Phase 2b).
  swing: {
    axis: 'auto' as SwingAxis,
    /** Only used when axis is not 'auto': +1 or -1, which direction counts as forward. */
    forwardSign: 1 as 1 | -1,
    /** Rotation slower than this is ignored as hand shake. */
    startThreshold: 40,
    /** A forward swing must peak above this to count as a stroke (the deadzone). */
    minPeakRate: 80,
    /** Peak rate that gives 100 % power. Faster swings are clamped to 100 %. */
    maxPeakRate: 700,
    /** Shape of the power curve: 1 = straight line, below 1 = gentle swings give a bit more power. */
    curveExponent: 0.8,
    /** The stroke fires when the forward speed drops below this part of its peak. */
    releaseFraction: 0.5,
    /** How long to wait for the first motion sensor reading before using touch controls (milliseconds). */
    sensorProbeMs: 1000,
  },

  slingshot: {
    /** Pulls shorter than this are ignored (pixels). */
    minPullPx: 20,
    /** Pull length that gives 100 % power (pixels). */
    maxPullPx: 260,
    curveExponent: 0.8,
  },
} as const;
