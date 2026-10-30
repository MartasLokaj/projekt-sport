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

  // How a swing of the phone turns into power. Angles in degrees, speeds in degrees per second.
  // The big screen shows the measured numbers after every swing, which helps to pick these values.
  // Later sensitivity becomes a per-player setting (Phase 2b). Left and right hands already work the same.
  swing: {
    /** After the tap, the phone must be this still (turning slower than this)... */
    stillRate: 20,
    /** ...for this long before the start point locks (milliseconds). */
    stillMs: 150,
    /** A tapped swing is cancelled if nothing happens for this long (milliseconds). */
    armTimeoutMs: 8000,
    /** The phone must turn this far from the start point before it counts as a swing (ignores hand shake). */
    startAngle: 2,
    /** Turning back towards the start point faster than this starts the forward swing. */
    reverseSpeed: 15,
    /** Backswings shorter than this do not hit (the deadzone). Small = tiny taps are possible. */
    minBackswing: 3,
    /** Backswing that gives the full backswing share of the power. */
    maxBackswing: 60,
    /** Speed at the start point that gives the full speed share of the power. */
    maxSpeed: 500,
    /** How much of the power comes from the backswing length (0..1). The rest comes from the speed. */
    backswingWeight: 0.6,
    /** Shape of the power curve. Above 1 = small swings get finer control for short putts. */
    curveExponent: 1.6,
    /** Multiplies the final power. 1 = normal, 1.2 = 20 % stronger. */
    sensitivity: 1,
    /** The swing arc must be at least this wide (radius in metres): a wrist flick is about 0.1, an arm swing 0.5 or more. */
    minArmRadius: 0.25,
    /** Only check the arc for swings faster than this; very soft taps are too gentle to measure. */
    armCheckMinSpeed: 100,
    /** How often the phone reports the live swing to the big screen (milliseconds). */
    progressIntervalMs: 50,
    /** How long to wait for the first motion sensor reading before using touch controls (milliseconds). */
    sensorProbeMs: 1000,
  },

  rules: {
    /** After this many strokes without holing out, the ball is picked up... */
    maxStrokes: 6,
    /** ...and the player scores this. */
    pickedUpScore: 7,
    /** How long the hole-in celebration shows before the next turn (milliseconds). */
    holedPauseMs: 2500,
  },

  ball: {
    radius: 0.1,
    /** Ball speed for a 0 % and a 100 % hit (units per second). */
    minShotSpeed: 0,
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
    /** Curve: how strongly a phone turned at impact bends the ball's path (per degree of turn). */
    curvePerDegree: 0.005,
    /** Turns smaller than this (degrees) do not curve the ball. */
    curveDeadzone: 3,
    /** Turns bigger than this (degrees) curve no more than this. */
    curveMaxDegrees: 30,
    /** Set to -1 if the ball curves the wrong way. */
    curveSign: 1,
    /** The ball counts as stopped below this speed... */
    restSpeed: 0.06,
    /** ...for this long (milliseconds). */
    restTimeMs: 400,
  },

  course: {
    /** Size of one Kenney kit tile in game units (3.33 makes the kit's ball the same size as ours). */
    tileSize: 0.1 / 0.03,
    floorFriction: 0.6,
    wallFriction: 0.1,
    /** How bouncy the walls are (0 = dead, 1 = perfect bounce). */
    wallBounce: 0.65,
    /** Depth of the pit under the cup. */
    cupDepth: 0.3,
    /** A slow ball whose centre comes this close to the cup's centre just rolls in (no annoying near-misses). */
    tapInRadius: 0.32,
    /** ...if it is slower than this (units per second). */
    tapInSpeed: 1,
    /** The windmill's blades are made this much longer than in the kit, so they reach the lane. */
    bladeScale: 1.5,
    /** How fast the windmill turns (degrees per second). */
    windmillDegreesPerSecond: 50,
    /** Grass colour of the plain lane drawn under the windmill (seen while it is faded out). */
    laneColour: '#6db27a',
    /** The holes are built side by side, this far apart. */
    holeSpacing: 60,
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
    aimDistance: 3.4,
    aimHeight: 1.8,
    /** While aiming the camera looks a little towards the golfer's side, so the character is in view. */
    aimSideShift: 0.25,
    /** While the ball rolls: distance and height. */
    followDistance: 3.6,
    followHeight: 2.4,
    /** How quickly the camera catches up (bigger = snappier). */
    smoothing: 3,
  },

  character: {
    /** Height of a character (the ball is 0.2 wide). */
    height: 0.9,
    /** The character's putter never swings further back or through than this (degrees). */
    maxBackswing: 70,
    /** Further away than this, a character hops to its spot instead of shuffling. */
    hopDistance: 0.35,
    /** Hopping speed (units per second), hops per second and hop height. */
    hopSpeed: 2.2,
    hopsPerSecond: 3,
    hopHeight: 0.12,
    /** Waiting players stand this far to the side of the ball and this far ahead of it, in a row going forward. */
    spectatorSide: 0.75,
    spectatorAhead: 0.6,
    spectatorSpacing: 0.55,
    /** A shot that stops this close to the cup gets a little cheer. */
    goodShotDistance: 1.0,
  },

  gauge: {
    /** Power at the three marks of the swing gauge (percent). */
    marks: [33, 66, 100],
  },

  aimLine: {
    /** The white aim line in front of the ball. It follows the ground, so slopes show. */
    length: 2.5,
    width: 0.05,
    /** How many pieces the line is made of (more = smoother over bumps and ramps). */
    segments: 48,
    /** Pieces that hide the ball from the camera (the windmill) fade to this see-through level. */
    occluderOpacity: 0.25,
    /** The distance marker ("about this far") simulates this many seconds of rolling at most. */
    previewSeconds: 6,
    /** Arrow keys on the Mac turn the aim this fast (degrees per second). */
    keyboardDegreesPerSecond: 70,
    /** Holding Space (hit) or P (practice) on the Mac charges from 0 to 100 % in this time (seconds). */
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
