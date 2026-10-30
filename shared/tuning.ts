// All tuning values live in this one file so they are easy to tweak.
// Distances are in metres-ish game units (the ball is 0.2 wide), times in seconds unless the name says otherwise.

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

  // How "HOLD & SWING" turns a real swing into power. Angles in degrees, speeds in degrees per second.
  // The big screen shows the measured backswing and speed after every swing, which helps to pick these numbers.
  // Later sensitivity becomes a per-player setting (Phase 2b). Left and right hands already work the same.
  swing: {
    /** The phone must turn this far from the start point before it counts as a swing (ignores hand shake). */
    startAngle: 3,
    /** Turning back towards the start point faster than this starts the forward swing. */
    reverseSpeed: 30,
    /** Backswings shorter than this do not hit (the deadzone). */
    minBackswing: 8,
    /** Backswing that gives the full backswing share of the power. */
    maxBackswing: 60,
    /** Speed at the start point that gives the full speed share of the power. */
    maxSpeed: 500,
    /** How much of the power comes from the backswing length (0..1). The rest comes from the speed. */
    backswingWeight: 0.6,
    /** Shape of the power curve: 1 = straight line, below 1 = gentle swings give a bit more power. */
    curveExponent: 1,
    /** Multiplies the final power. 1 = normal, 1.2 = 20 % stronger. */
    sensitivity: 1,
    /** How long to wait for the first motion sensor reading before using touch controls (milliseconds). */
    sensorProbeMs: 1000,
  },

  ball: {
    radius: 0.1,
    /** Ball speed for a 0 % and a 100 % hit (units per second). */
    minShotSpeed: 0.3,
    maxShotSpeed: 9,
    /** Shape of power -> speed. 0.5 makes the rolling distance grow evenly with power. */
    shotCurveExponent: 0.5,
    /** How strongly the grass slows the ball (units per second, every second). Bigger = shorter rolls. */
    rollingResistance: 2.2,
    /** Extra slow-down that grows with speed, a bit like air. */
    linearDamping: 0.1,
    angularDamping: 0.3,
    /** How bouncy the ball is (combined with the wall bounce). */
    bounce: 0.4,
    /** The ball counts as stopped below this speed... */
    restSpeed: 0.06,
    /** ...for this long (milliseconds). */
    restTimeMs: 400,
  },

  course: {
    floorColour: '#a9b4bc',
    wallColour: '#6f7d88',
    floorThickness: 0.2,
    wallHeight: 0.25,
    floorFriction: 0.6,
    wallFriction: 0.1,
    /** How bouncy the walls are (0 = dead, 1 = perfect bounce). */
    wallBounce: 0.65,
    /** Size of the square opening of the cup. The ball is 0.2 wide. */
    cupGap: 0.3,
    cupDepth: 0.3,
  },

  physics: {
    gravity: 9.81,
    /** Physics steps per second. More = more accurate, a little slower. */
    stepsPerSecond: 120,
    /** A ball below this height has left the course (out of bounds). */
    outOfBoundsY: -1,
  },

  camera: {
    /** While aiming: distance behind the ball and height above it. */
    aimDistance: 3.2,
    aimHeight: 1.7,
    /** While the ball rolls: distance and height. */
    followDistance: 3.6,
    followHeight: 2.4,
    /** How quickly the camera catches up (bigger = snappier). */
    smoothing: 3,
  },

  practice: {
    /** How far ahead the practice swing shows the ball's path (seconds of rolling). Lower = harder. */
    previewSeconds: 6,
    /** Distance between the dots of the predicted path. */
    dotSpacing: 0.18,
  },

  aimLine: {
    length: 2.2,
    dots: 12,
    /** Arrow keys on the Mac turn the aim this fast (degrees per second). */
    keyboardDegreesPerSecond: 70,
    /** Holding Space on the Mac charges a hit from 0 to 100 % in this time (seconds). */
    keyboardChargeTime: 1.5,
  },

  slingshot: {
    /** Pulls shorter than this are ignored (pixels). */
    minPullPx: 20,
    /** Pull length that gives 100 % power (pixels). */
    maxPullPx: 260,
    curveExponent: 0.8,
  },
} as const;
