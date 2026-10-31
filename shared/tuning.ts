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
    /** Half-width of the lane is set per hole; this is the cup's radius. */
    cupRadius: 0.22,
    /** The tee is this far along the lane from its round back end. */
    teeDistance: 0.7,
    /** How finely the lane curve is sampled and the lane surface divided (smaller = smoother, slower to build). */
    laneSpacing: 0.08,
    floorCell: 0.1,
    /** All lanes are made this much wider than drawn in HOLES (1 = as drawn). */
    laneWidthScale: 1.2,
    /** The wooden border: thickness and height above the floor, how far its outer side reaches down into the ground, bevel on the top edges. */
    bumperWidth: 0.2,
    bumperHeight: 0.26,
    bumperDepth: 0.4,
    woodBevel: 0.035,
    /** Wood colour, and how long one plank is (a dark joint between planks). */
    woodColour: '#9a5f33',
    woodPlankLength: 1.6,
    /** One repeat of the grass bump texture on the lane (units), and how bumpy it looks. */
    turfTextureSize: 2.2,
    turfBumpiness: 0.45,
    /** The mowed checker pattern: its two greens, how long one square is along the lane, and how many squares across. */
    turfLight: '#7fd34b',
    turfDark: '#5cb83a',
    checkerLength: 0.55,
    checkerColumns: 4,
    /** The white rim around the cup. */
    cupRimWidth: 0.045,
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
    aimDistance: 2.7,
    aimHeight: 1.3,
    /** While aiming the camera looks at a point this far ahead of the ball. */
    aimLookAhead: 3,
    /** While aiming the camera looks a little towards the golfer's side, so the character is in view. */
    aimSideShift: 0.25,
    /** While the ball rolls: distance and height. */
    followDistance: 3.0,
    followHeight: 2.0,
    /** How quickly the camera catches up (bigger = snappier). */
    smoothing: 3,
  },

  // The world around the course and the overall look: sea, islands, sky.
  scenery: {
    /** Change this number for a different (but always repeatable) island shape and rocks. */
    seed: 42,
    skyTop: '#3d9be9',
    skyHorizon: '#d8f0ff',
    sunColour: '#fff3d1',
    /** Where the sun disk shows in the sky (degrees): height above the horizon and direction (0 = +z). */
    sunElevation: 14,
    sunAzimuth: 25,
    /** How high the sunlight that lights and shades everything comes from (degrees). */
    lightElevation: 50,
    sand: '#e3c88c',
    wetSand: '#c4a46a',
    seaDeep: '#1f7fc4',
    seaShallow: '#4fe0d6',
    /** Height of the sea surface (the course floor is at 0). */
    seaLevel: -0.55,
    /** Height of the waves. Small = calm and cute. */
    waveHeight: 0.16,
    /** How fast the waves roll (1 = normal). */
    waveSpeed: 1.35,
    /** Size of the sea and how finely it is divided (more = smoother waves, a little slower). */
    seaSize: 420,
    seaDetail: 220,
    /** Island tops lie this far below the course floor (the thickness of the course tiles). */
    groundDepth: 0.21,
    /** Island ground around the course (units) and its grass colour boost. */
    islandMargin: 3.2,
    islandGrassTint: [0.62, 1.0, 0.45],
    /** Grass covers the island up to this part of its size (1 = the edge of the flat top); beyond is beach. */
    grassReach: 0.86,
    /** How finely the island ground is divided, and how big one repeat of its grass and sand textures is. */
    islandCell: 0.25,
    islandTextureSize: 2.5,
    rocksPerIsland: 9,
    clouds: 22,
    /** Haze in the distance: starts at fogNear, fully hazy at fogFar. */
    fogNear: 55,
    fogFar: 170,
    /** Overall brightness, and the soft glow on bright things (strength, spread, from which brightness). */
    exposure: 0.95,
    bloomStrength: 0.22,
    bloomRadius: 0.5,
    bloomThreshold: 0.96,
    /** Sharpness on retina screens. Lower = faster. */
    maxPixelRatio: 1.75,
  },

  // Trees, bushes and grass tufts on the islands (KayKit Forest Nature Pack models).
  vegetation: {
    /** How many trees in groves and alone, and how many bushes, go on one island (fewer = faster). */
    treesPerIsland: 24,
    loneTrees: 6,
    bushesPerIsland: 34,
    /** Trees grow in little groves spread evenly around the island: this many groves per island. */
    grovesPerIsland: 8,
    /** Smallest distance between two tree trunks. */
    treeSpacing: 1.2,
    /** Grass tufts cover the whole grassy island, one in every square of this size (smaller = denser, slower). */
    grassSpacing: 0.5,
    /** Size of the models compared with the original pack (smallest, biggest). Trees grow bigger further from the lane. */
    treeScale: [0.38, 0.62],
    bushScale: [0.3, 0.5],
    grassScale: [0.35, 0.55],
    /** Gap kept between the foot of the bumpers' slope and a tree trunk / a bush. */
    treeGap: 1.1,
    bushGap: 0.25,
    /** No trees or bushes within this distance of the camera's spot behind the tee. */
    teeClearance: 3,
    /** Trees and bushes stay on the grass, up to this part of the island's size (grass ends at grassReach). */
    maxReach: 0.8,
    /** Colour boost on the pack's colours (1 = as made). */
    tint: [1.15, 1.22, 1.05],
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

  // The Cube World hub (the lobby): a floating cube in starry space, one little world per side.
  hub: {
    /** Size of the cube and how round its edges are. */
    cubeSize: 6,
    cubeRounding: 0.7,
    cubeColour: '#b9a6ff',
    glowColour: '#7ff3ff',
    skyTop: '#0b0f2e',
    skyBottom: '#3a1f5c',
    stars: 2200,
    /** How much each star layer (near, middle, far) turns along with the cube: the depth effect. */
    starParallax: [0.06, 0.03, 0.008],
    /** Glowing specks floating round the cube, and how strong the coloured clouds far behind are. */
    dust: 140,
    nebulaOpacity: 0.28,
    /** How much the colour clouds and the planets turn along with the cube (depth: planets are nearer than the clouds). */
    nebulaParallax: 0.004,
    planetParallax: 0.08,
    /** A shooting star every so many seconds (from..to), and how long one takes to cross. */
    shootingStarEvery: [5, 11],
    shootingStarSeconds: 0.9,
    /** The light outline round the cube: how much bigger than the cube it is, and how bright. */
    outlineScale: 1.035,
    outlineStrength: 1.6,
    /** The glowing frame round the chosen side (0..1), and how much the cube pops when a game is chosen. */
    frameOpacity: 0.85,
    /** The soft glow lying on the chosen side (share of the frame's brightness). */
    sideGlow: 0.55,
    /** While a game is chosen, the other sides are drawn this bright (1 = not dimmed). */
    dimOthers: 0.45,
    /** The name sign at the back of the chosen side: how far in from the edge, and how long it takes to spring up (s). */
    signInset: 0.45,
    signPopSeconds: 0.6,
    /** Trees at the edges lean out over the edge by this much (radians). */
    overhangLean: 0.4,
    /** The minigolf waterfall: where along the front edge it pours (sideways, -3..3) and how wide it is. */
    waterfallX: 0.15,
    waterfallWidth: 0.55,
    /** Things orbiting the cube: radius, seconds per round, tilt of the orbit (degrees), size. */
    orbiters: [
      { kind: 'golfball', radius: 6.6, seconds: 24, tilt: 18, size: 0.32 },
      { kind: 'shuttle', radius: 7.6, seconds: 33, tilt: -22, size: 1.6 },
      { kind: 'cube', radius: 8.4, seconds: 41, tilt: 52, size: 0.45 },
    ],
    choosePop: 0.025,
    /** How high the cube hops (bouncing) when a game is chosen. */
    switchHop: 0.45,
    /** A newly joined player jumps down onto the cube: from how high, how long the fall takes (s). */
    dropHeight: 4,
    dropSeconds: 0.55,
    /** Confetti when they land: pieces per burst, how fast they shoot up, how wide they spread, how long they live (s). */
    confettiPieces: 70,
    confettiSpeed: 6,
    confettiSpread: 3.5,
    confettiSeconds: 1.8,
    /** Camera: distance from the cube, height and field of view (degrees). Closer = bigger cube. */
    cameraDistance: 16.5,
    cameraHeight: 3.5,
    cameraFov: 40,
    /** On screens narrower than this (width / height) the camera steps back so the cube still fits. */
    fitAspect: 1.3,
    /** On upright screens, how far up the cube sits (share of the screen height), above the game card. */
    portraitLift: 0.08,
    /** Zooming with the mouse wheel or a trackpad pinch: nearest and farthest camera distance, and how fast. */
    zoomMin: 9,
    zoomMax: 32,
    zoomSpeed: 0.0015,
    /** Dragging with the mouse: how far the cube turns per pixel, and how long it keeps spinning after letting go. */
    dragSpeed: 0.008,
    spinFriction: 3,
    /** While nobody touches it, the cube turns slowly by itself (radians per second). */
    idleSpin: 0.12,
    /** ...and a little faster behind the title menu (radians per second). */
    titleSpin: 0.35,
    /** The cube's starting pose (degrees): tipped towards us and turned, so three sides show. */
    startTiltDegrees: 22,
    startTurnDegrees: -32,
    /** A chosen game's side turns up, then tips this far towards us so its little world is easy to see (degrees). */
    chosenTiltDegrees: 36,
    /** How quickly the cube turns to the chosen side (bigger = snappier). */
    turnSpeed: 5,
    /** The gentle idle float: up-down distance and speed. */
    bobHeight: 0.15,
    bobSpeed: 0.8,
    /** Characters on the chosen side: their size, the spacing between them, and how far forward they stand. */
    characterScale: 1.35,
    characterSpacing: 1.3,
    characterForward: 1.5,
    /** How long a character takes to pop in, and the pause between one character and the next (seconds). */
    popInSeconds: 0.5,
    popInStagger: 0.15,
    exposure: 1.05,
    bloomStrength: 0.55,
  },


  // Badminton swing detection (Swing Lab, phase B1). The phone is held like a racket handle,
  // with the top of the phone where the racket head would be. No button: a fast enough turn is a swing.
  // Overhead or underhand is not read from the phone (test 2 showed it is unreliable): the game picks it
  // from where the character stands (back of the court = overhead, front = underhand unless a smash is possible).
  // Speeds in degrees per second, times in milliseconds. Every swing is saved to logs/badminton-swings.jsonl.
  badmintonSwing: {
    /** Turns faster than this are looked at (and logged); slower ones are just moving around. */
    triggerSpeed: 350,
    /**
     * A swing must be faster than this to be a hit. Slower turns are reaching for the shuttle or getting
     * ready (shown as "ignored"). In test 2 reaching peaked at 380–730, real swings at 780–2100.
     */
    minHitSpeed: 750,
    /** Swings faster than this are sent at once; slower ones wait `confirmMs` first. */
    instantSpeed: 1100,
    /** The swing is sent as soon as the turn slows below this share of its fastest moment (0..1). */
    releaseRatio: 0.75,
    /** ...or at the latest this long after it started. */
    maxSwingMs: 250,
    /**
     * After a slower swing, wait this long in case a faster one follows (reaching back with the
     * racket comes just before the real swing). Adds to the delay, but the hit time is still exact.
     */
    confirmMs: 280,
    /** After a swing, ignore motion for this long (the arm coming back is not a new swing). */
    cooldownMs: 450,
    /** Speed for 0 % and 100 % power, and the curve between them (1 = straight). The iPhone gyro tops out near 2000. */
    minSpeed: 750,
    maxSpeed: 1800,
    curveExponent: 1,
    /** Power bands shown in the lab: soft below the first, hard from the second (percent). */
    softBelow: 35,
    hardFrom: 70,
    /**
     * Aim: the share of the swing's turn around the vertical axis, times `aimGain` (then clamped to -1..1).
     * Measured over this many milliseconds around the fastest moment. Below `aimDeadzone` counts as straight.
     * aimSign: -1 swaps left and right, in case a phone reports it the other way round.
     */
    aimGain: 1.0,
    /**
     * Most people's natural swing goes a little to one side. The phone keeps learning a player's usual
     * direction and counts it as straight: each swing moves the learned "straight" this much (0 = off).
     */
    aimAutoCenter: 0.15,
    aimWindowMs: 120,
    aimDeadzone: 0.15,
    aimSign: 1,
    /** Graph and log: how much motion before the fastest moment is kept (milliseconds). */
    traceBeforeMs: 600,
    /** Clock sync with the server: how often the phone asks the time (milliseconds). */
    clockSyncIntervalMs: 4000,
  },

  // Badminton prototype (phase B2): one player against the computer on a plain court.
  // Distances in metres (net at z = 0, the player's half at +z), times in milliseconds unless the name says otherwise.
  badminton: {
    /**
     * Court: half of the width and half of the length (25 % bigger than a real singles court, so the
     * characters run more), net height, and the short service line's distance from the net.
     */
    courtHalfWidth: 3.25,
    courtHalfLength: 8.4,
    netHeight: 1.55,
    shortServiceLine: 2.5,
    /** Characters are the minigolf chibis scaled up this much (1 = 0.9 m tall). */
    characterScale: 1.8,
    /** Where a character waits between shots (distance from the net). */
    homeDepth: 4.5,
    /** The server stands this far from the net. */
    serveDepth: 3.25,
    /** Running: normal top speed, and the speed allowed when it is the only way to get there in time (m/s). */
    runSpeed: 6,
    maxRunSpeed: 10.5,
    /** While waiting for the other side's shot, characters bounce on their toes (height in m, bounces per second). */
    readyBounce: 0.05,
    readyBouncesPerSecond: 2.2,
    /**
     * Where the racket meets the shuttle. Like real players, a character takes the shuttle as early as it can:
     * the first point of the flight in its half that it can reach in time (at runSpeed, or maxRunSpeed if it
     * must, after reactionMs) and that is no higher than reachHeight. Real adults (about 1.75 m) meet clears at
     * about 2.3 m and smashes at about 2.2 m; we go much higher, like a cartoon sports game: above standingReach
     * the character jumps to meet the shuttle (a jump smash), up to reachHeight.
     */
    reachHeight: 3.0,
    /** How high the racket reaches with the arm up, standing (our chibis are small: about 1.8 m). */
    standingReach: 1.8,
    /** A jump takes this long to go up (and the same to come down, milliseconds). */
    jumpRiseMs: 320,
    /**
     * A player's character only jumps with the player's swing; that jump is quicker (milliseconds to the top),
     * and the racket meets the shuttle at the top.
     */
    swingJumpRiseMs: 180,
    lowestContact: 0.3,
    reactionMs: 150,
    /** Contact height decides the stroke: from overheadFrom up = overhead, from driveFrom up = flat drive, lower = lift (m). */
    overheadFrom: 1.7,
    driveFrom: 1.0,
    /** How far beside the shuttle the character stands for each stroke, so the racket meets it (m). */
    reach: { overhead: 0.35, drive: 0.8, lift: 0.6 },
    /**
     * A smash is only possible from the back of the court: an overhead hit hard (power >= smashPower) at least
     * this far from the net (m). Closer to the net a hard overhead is a clear.
     */
    smashFromDepth: 4.6,
    /** The server holds the shuttle at this height. */
    serveHeight: 0.9,

    // Hitting (timing only decides hit or miss and how good the hit is; the swing direction aims).
    /** A swing this close to the right moment hits: this much too early, or this much too late (milliseconds). */
    hitWindowEarlyMs: 350,
    hitWindowMs: 250,
    /** This close is "Perfect": the shot is as fast and as precise as it gets. */
    perfectMs: 100,
    /** After the right moment, wait this much longer for the phone's message before calling it a miss (Wi-Fi delay). */
    lateGraceMs: 300,
    /** Power at or above this (percent) makes an overhead shot from the back court a smash. */
    smashPower: 70,
    /** Aim -1..1 moves the target this far sideways, as a share of the half width (1 = to the sideline). */
    aimReach: 0.9,
    /** A shot that was not Perfect lands up to this far from where it was aimed (m). */
    scatter: 1.0,
    /** Mac keyboard (testing without a phone): Space swings with this power, arrows held = aim. */
    keyPower: 60,

    // Shots. depth = landing distance from the net (min at 0 % power, max at 100 %), apex = extra height of the arc (m),
    // seconds = flight time (slow at 0 % power, fast at 100 %), drag = how much the shuttle slows down in flight
    // (a real shuttle slows down a lot; the user wants it slow, steady and easy to predict, so drag is kept low).
    /** The serve always goes diagonally into the receiver's service court (between the centre line and the sideline). */
    serve: { depth: [6.5, 7.9], apex: 3.2, seconds: [2.35, 1.95], drag: 1.0 },
    clear: { depth: [6.25, 7.9], apex: 3.4, seconds: [2.35, 1.85], drag: 1.1 },
    lift: { depth: [6.0, 7.75], apex: 3.6, seconds: [2.45, 1.95], drag: 1.0 },
    drive: { depth: [5.75, 7.5], apex: 0.4, seconds: [1.45, 1.1], drag: 0.6 },
    smash: { depth: [3.25, 5.25], apex: 0, seconds: [1.15, 0.8], drag: 0.3 },
    /** Every shot clears the net by at least this much (m). */
    netClearance: 0.35,
    /** A Perfect hit flies this much faster. */
    perfectSpeedup: 0.9,

    /** The computer: chance to return a normal shot and a smash, its power range (percent), and serve delay (ms). */
    cpu: { hitChance: 0.85, smashReturnChance: 0.55, power: [30, 85], smashChance: 0.35, serveDelayMs: 1300, aimRange: 1 },

    /** Rally scoring: first to pointsToWin, but you must lead by winBy (4 : 4 → 5 : 4 → 6 : 4 wins). Pause after a point (ms). */
    pointsToWin: 4,
    winBy: 2,
    pointPauseMs: 1600,

    /** Camera behind the player: height, distance behind the baseline, and how far down the court it looks. */
    cameraHeight: 4.2,
    cameraBack: 5.0,
    cameraLookAt: -4,
    cameraFov: 50,
    /** Split screen (two players): each half is narrow, so the camera sees wider and sits a little closer. */
    splitCameraFov: 62,
    splitCameraBack: 4.0,
    /** The shuttle is drawn this much bigger than real, so it is easy to follow from the sofa. */
    shuttleScale: 2.4,
    /** Look: sand, court, lines, sky. */
    sandColour: '#ecd3a0',
    courtColour: '#e3bf85',
    skyColour: '#9fd8ff',
  },

  // Swing Lab on the big screen: a shuttle drops to the hit line, the player swings when it gets there.
  badmintonLab: {
    /** Time from the shuttle appearing to reaching the hit line, and the pause before the next one (milliseconds). */
    fallMs: 1600,
    pauseMs: 1400,
    /** Within this many milliseconds of the right moment it is "Perfect", within the second "Good". */
    perfectMs: 70,
    goodMs: 160,
    /** Swings further than this from any shuttle are not judged (milliseconds). */
    judgeWindowMs: 700,
    /** The TV may show the picture a bit late; add its delay here so the timing feels fair (milliseconds). */
    displayLatencyMs: 0,
  },

} as const;
