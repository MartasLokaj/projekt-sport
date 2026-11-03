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
    /** How often the server looks whether the Mac moved to another network (e.g. a phone's hotspot), ms. */
    addressCheckMs: 4000,
    /** The server ignores a second stroke from the same phone within this time (milliseconds). */
    minStrokeIntervalMs: 800,
  },

  /** The character editor on the phone (phase 5) and how the big screen shows the edits. */
  avatarEditor: {
    /** Minimum time between live look updates sent while editing (milliseconds). 100 = 10 per second. */
    sendIntervalMs: 100,
    /** The phone's 3D preview: sharpness (pixel ratio cap) and frames per second (lower = less battery). */
    previewPixelRatio: 2,
    previewFps: 30,
    /** How fast a finger drag turns the preview character (radians per pixel). */
    dragTurn: 0.012,
    /** Big screen: a small sparkle on each change, at most once per this many seconds; how many pieces. */
    sparkleEvery: 0.35,
    sparklePieces: 10,
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
    startAngle: 5,
    /**
     * While the phone is held at the ball and turns slower than this (degrees per second) for `stillMs`, the start
     * point is locked again right there. The gyroscope slowly drifts; without this the drift adds up to a "swing".
     */
    driftRate: 8,
    /** Turning back towards the start point faster than this starts the forward swing. */
    reverseSpeed: 30,
    /** Backswings shorter than this give no power (the deadzone of the power curve). */
    minBackswing: 3,
    /** A stroke needs at least this much backswing (degrees)... */
    minHitBackswing: 8,
    /** ...and must pass the start point at least this fast (degrees per second). Smaller twitches are ignored. */
    minHitSpeed: 40,
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
    /**
     * Courses to choose in the lobby card: `holes` holes picked at random from all of them (played in course
     * order), or all of them. The first one is chosen at the start.
     */
    courses: {
      short: { label: '3 holes', holes: 3, detail: '3 random holes' },
      full: { label: '9 holes', holes: 9, detail: 'All 9 holes' },
    },
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
    /** On slopes the grass slows the ball less (so it rolls back down a ramp instead of sticking): from this steepness (degrees)... */
    slopeFrom: 2,
    /** ...to this steepness, where the slow-down is only this part of rollingResistance. */
    slopeFull: 5,
    slopeResistance: 0.25,
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
    /** The blades' hitbox compared with the drawn blade: length and width (1 = exactly as drawn, smaller = easier). */
    bladeHitboxLength: 0.9,
    bladeHitboxWidth: 0.7,
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
    /** Pipes over the lane: paint colour, wall thickness, how flat the arch is (1 = half circle), length of the white rims at the ends. */
    tubeColour: '#2f9bff',
    tubeThickness: 0.07,
    tubeFlatten: 0.72,
    tubeRimLength: 0.2,
    /** The castle gate is this much wider than the lane with its borders (it stands over them). */
    castleOverhang: 0.3,
    /** Bridges: how long one repeat of 4 deck planks is, how deep the edge beams are, post size, spacing and how far posts stick up above the deck. */
    bridgePlankRepeat: 0.9,
    bridgeBeamHeight: 0.16,
    bridgePostRadius: 0.06,
    bridgePostSpacing: 1.3,
    bridgePostAbove: 0.12,
    /** Thickness of the wooden boards under the edges of a gap (jump). */
    gapBoardThickness: 0.1,
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
    islandGrassTint: [0.78, 1.3, 0.5],
    /** Grass covers the island up to this part of its size (1 = the edge of the flat top); beyond is beach. */
    grassReach: 0.86,
    /** How finely the island ground is divided, and how big one repeat of its grass and sand textures is. */
    islandCell: 0.25,
    /** The pond under a jump: how far it reaches out from the lane's edge, how steep its banks are (units), how deep below the sea surface. */
    pondWidth: 3.2,
    /** How much wider (along the lane) the pond gets away from the lane. */
    pondSpread: 1.1,
    pondSlope: 0.45,
    pondDepth: 0.5,
    /** The water under a bridge reaches this far back from where the bridge meets land. */
    bridgeShore: 0.35,
    islandTextureSize: 2.5,
    rocksPerIsland: 9,
    /** Meadow patches on the island grass: how big one patch is (units), and the colour boost of the darkest and lightest grass. */
    meadowPatchSize: 3.5,
    meadowDark: [0.72, 0.82, 0.68],
    meadowLight: [1.38, 1.3, 1.0],
    /** Grassy hills on each island: how many, how wide (from..to), how high (from..to), and how far from the lane they must stay. */
    hillsPerIsland: 5,
    hillSize: [1.6, 3.2],
    hillHeight: [0.5, 1.2],
    hillClearance: 2.5,
    /** Grey boulders in the grass: groups per island, size of the big stone (from..to), distance from the border. */
    boulderGroups: 5,
    boulderSize: [0.3, 0.6],
    boulderClearance: 1.2,
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
    /**
     * Trees and bushes between the camera and the ball (or the aim line) turn see-through: this much of them
     * disappears (0..1, 1 = invisible)...
     */
    fadeAmount: 0.75,
    /** ...when the view line passes closer than this part of the plant's size (1 = its whole round outline)... */
    fadeReach: 0.8,
    /** ...and this fast (bigger = quicker fade in and out). */
    fadeSpeed: 8,
  },

  character: {
    /** Height of a character (the ball is 0.2 wide). */
    height: 0.9,
    /** The character's putter never swings further back or through than this (degrees). */
    maxBackswing: 70,
    /** Arms hang out from the shoulders at this angle while standing (radians, 0 = straight down). */
    armRest: 0.35,
    /** Further away than this, a character hops to its spot instead of shuffling. */
    hopDistance: 0.35,
    /** Hopping speed (units per second), hops per second and hop height. */
    hopSpeed: 2.2,
    hopsPerSecond: 3,
    hopHeight: 0.12,
    /**
     * Waiting players stand this far to the side of the ball (on the side away from the golfer) and this far behind
     * it, in a row going back and a little further out (`spectatorSpacing` back, `spectatorSideStep` out per player).
     * Closer to the camera they would fill the side of the picture.
     */
    spectatorSide: 1.5,
    spectatorBehind: 0,
    spectatorSpacing: 0.5,
    spectatorSideStep: 0.3,
    /** They keep at least this far from the view line (camera → ball → aim), stepping further out if needed. */
    spectatorClearance: 0.7,
    /** They move along when the aim turns more than this (degrees) from where they lined up. */
    spectatorFollowAim: 25,
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
  /** Sounds and music on the big screen (host/audio/sound.ts). Levels 0..1; M mutes everything. */
  audio: {
    master: 0.9,
    /** All short sounds together, and all music together. */
    effects: 0.9,
    music: 0.45,
    /** Each music track's own level, and how long one track fades over to the next (ms). */
    musicLevels: { lobby: 0.8, minigolf: 0.9, badminton: 0.8 },
    musicFadeMs: 900,
    /** The same short sound plays at most once in this time (ms), e.g. a ball rattling along a border. */
    repeatGapMs: 60,
    /** Each short sound's own level (above 1 = louder than recorded, for quiet recordings; at most 4). */
    levels: {
      'ui-click': 0.6,
      'ui-select': 0.7,
      'ui-play': 0.8,
      'ui-back': 0.6,
      'ui-join': 1.6,
      'ui-leave': 0.7,
      sparkle: 0.5,
      'golf-putt': 2,
      'golf-wall': 2.5,
      'golf-cup': 1.6,
      'golf-splash': 0.9,
      'shuttle-hit': 0.9,
      'shuttle-smash': 1,
      'shuttle-sand': 0.6,
      'shuttle-net': 0.7,
      'jingle-hole-in': 0.8,
      'jingle-hole-in-one': 0.9,
      'jingle-point': 0.6,
      'jingle-win': 0.8,
      'jingle-super-smash': 0.8,
    },
    /** Minigolf: a ball hitting a border faster than wallSpeed (m/s) clicks, louder when faster (full at wallLoud). */
    wallSpeed: 0.6,
    wallLoud: 6,
    /** Beach: a wave rolls in every everyMs (random between the two), at this level and speed (pitch) range. */
    waves: { everyMs: [3500, 7000], level: 0.35, rate: [0.85, 1.05] },
  },

  /** Minigolf juice (host/game/Game.ts): hole intro, confetti, ball trail, camera nudge, wind. */
  minigolfFx: {
    /**
     * Hole intro: the camera starts high above the cup and flies over the hole to its spot behind the tee (seconds),
     * curving up to `arcHeight` above the hole; the "Hole 2/3 · Par 3" banner shows meanwhile. Any aim or swing
     * ends it at once.
     */
    introSeconds: 2.6,
    introStartHeight: 5,
    introStartBack: 3.5,
    introArcHeight: 8,
    bannerMs: 2600,
    /** Confetti when a ball drops in: pieces per burst, size of a piece (m), speed up (m/s), spread, life (s). */
    confettiPieces: 70,
    confettiSize: 0.1,
    confettiSpeed: 3.2,
    confettiSpread: 1.6,
    confettiSeconds: 1.6,
    /** A hole in one: this many bursts, one every holeInOneEveryMs, round the cup. */
    holeInOneBursts: 6,
    holeInOneEveryMs: 280,
    /** A faint white streak behind a ball rolling faster than trailSpeed (m/s): width (m), length (ms). */
    trailSpeed: 1.2,
    trailWidth: 0.07,
    trailMs: 320,
    trailColour: '#ffffff',
    /** The camera gives a little shake on the hit: strength (m) for a soft and a full-power shot, how long (ms). */
    nudgeSoft: 0.01,
    nudgeHard: 0.05,
    nudgeMs: 180,
    /** Wind in the trees, bushes and grass: how far the tops sway (share of the height) and how fast. */
    windSway: 0.035,
    windSpeed: 1.6,
  },

  /** The podium after a match (host/results/Podium.ts): steps, characters, camera and the celebration. */
  podium: {
    /** Characters are drawn this much bigger than in the games. */
    characterScale: 2,
    /** Height of the 1st, 2nd and 3rd step, and how wide one step is (m). */
    stepHeights: [1.5, 1.0, 0.6],
    stepWidth: 2.2,
    stepDepth: 1.8,
    stepColours: ['#ffd84d', '#d9e2f2', '#f0a868'],
    /** Camera: where it ends (height, distance), where it looks (height), how long it swoops in (s), how much it sways. */
    cameraHeight: 3.2,
    cameraDistance: 9.5,
    lookHeight: 2.1,
    cameraFov: 40,
    swoopSeconds: 1.6,
    sway: 0.6,
    /** Confetti over the winners every few seconds (random between the two), pieces per burst. */
    confettiEvery: [1.2, 2.4],
    confettiPieces: 60,
    /** The winners jump or cheer, the others clap, every few seconds. */
    cheerEvery: [1.6, 2.6],
    /** How long after the last point of a badminton match the podium comes (ms), so the reactions can play. */
    badmintonDelayMs: 1800,
    /** Background colours (top, bottom) and the ground's colour per game (the ground fades into the sky far away). */
    sky: { minigolf: ['#7ec8ff', '#d9f3ff'], badminton: ['#ffb36b', '#ffe3b0'] },
    ground: { minigolf: '#8fd16a', badminton: '#f1dcae' },
  },

  /** The way from the cube into a game and back (host/hub/Hub.ts diveIn/pullOut, host/ui/transition.ts). */
  transition: {
    /** Play: the camera flies into the chosen side (seconds) and ends this far from the side's middle. */
    diveSeconds: 1.2,
    diveEndDistance: 1.5,
    /** The soft flash that hides the switch: colour, fading in and fading out (milliseconds). */
    flashColour: '#ffffff',
    flashInMs: 250,
    flashOutMs: 500,
    /** In the game the camera starts this high above and this far behind its spot, and glides down (seconds). */
    swoopSeconds: 1.6,
    swoopHeight: 9,
    swoopBack: 6,
    /**
     * Back to the cube: the camera starts this share of the way towards the side (0 = the normal view of the whole
     * cube, 1 = right at the side) and settles back to the normal view (seconds).
     */
    pullOutFrom: 0.15,
    pullOutSeconds: 1.1,
  },

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
    /** The SHORT button counts if it was held this close to the hit (milliseconds), in case it was let go a little early. */
    shortGraceMs: 150,
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
    homeDepth: 4.0,
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
    /**
     * A shuttle out of running reach by at most diveReach (m) can still be caught with a stretch, as a wobble.
     * A swing up to earlyWobbleMs earlier than the hit window still catches it, as a wobble; earlier than that
     * is "Too early!" and the player may swing again. Only a swing more than veryLateMs after the right moment
     * makes the character dive into the sand (diveMs) and lie there for recoveryMs (counted from the landing).
     */
    diveReach: 1.6,
    earlyWobbleMs: 150,
    veryLateMs: 400,
    diveMs: 350,
    recoveryMs: 900,
    /** A jump takes this long to go up (and the same to come down, milliseconds). */
    jumpRiseMs: 320,
    /**
     * A player's character only jumps with the player's swing; that jump is quicker (milliseconds to the top),
     * and the racket meets the shuttle at the top.
     */
    swingJumpRiseMs: 180,
    lowestContact: 0.3,
    /** Nobody can hit the shuttle closer to the net than this (m), e.g. a drop that has just crossed it. */
    minContactDepth: 0.6,
    reactionMs: 150,
    /**
     * Running help: characters run this much faster than runSpeed / maxRunSpeed (0.2 = 20 %), so they reach the
     * shuttle more often. Stretches still exist for really far shots.
     */
    reachAssist: 0.2,
    /**
     * Footwork, like real badminton players.
     * - Base: after a shot the hitter goes back to a waiting spot. When the other side has to play from near the
     *   net or low (a lift is coming, usually deep), the spot is deeper (baseDepthVsNet) so the character is
     *   already running back; otherwise homeDepth. baseFollowX moves the spot towards the side of the court the
     *   other player hits from (0 = always the middle).
     * - Split step: as the other side hits, the receiver does a small hop (as long as its reaction time) and
     *   then runs.
     * - Running look: legs stride (strideAngle radians at runSpeed), the body leans into the run (forward
     *   leanForward, backwards leanBack, sideways leanSide, radians); little sand puffs at each step from
     *   stepPuffSpeed (m/s).
     * - Lunge (výpad): a shuttle taken below overhead height closer than lungeDepth to the net, or a stretch
     *   (dive reach): the last step becomes a deep lunge, racket leg forward, body low and leaning towards the shuttle. It starts within lungeStartDistance
     *   (m) of the spot and lungeLeadMs before the contact, and is held lungeHoldMs after the hit.
     * - Pace: running to the shuttle, the character goes just fast enough to get there after arriveShare of the time
     *   left, but at least calmRunSpeed (m/s) — no sprinting when there is time.
     */
    footwork: {
      calmRunSpeed: 3.5,
      arriveShare: 0.85,
      baseDepthVsNet: 6.2,
      frontContactDepth: 3.5,
      baseFollowX: 0.3,
      splitHop: 0.08,
      strideAngle: 0.9,
      leanForward: 0.22,
      leanBack: 0.12,
      leanSide: 0.18,
      stepPuffSpeed: 4.5,
      lungeDepth: 4.5,
      lungeStartDistance: 1.6,
      lungeLeadMs: 450,
      lungeHoldMs: 350,
      lungeDrop: 0.06,
      lungeLean: 0.55,
      lungeStep: 0.18,
      lungeFrontLeg: -1.15,
      lungeBackLeg: 0.95,
    },
    /**
     * The coach (host/badminton/coach.ts) learns each player's swings and adapts the game to them, after
     * minSwings swings, from the last `memory` ones.
     * - Timing: the right moment moves by timingShare of the player's median offset (early/late), at most
     *   maxTimingShift ms.
     * - Power: scaled so the player's strong swing (their 80th percentile) gives strongPower, within powerScale
     *   (never weaker than the phone says).
     * - Aim: scaled so their wide swing (80th percentile of |aim|) gives wideAim, within aimScale.
     * - Wi-Fi: when 1 in 10 swings arrives later than normalDelayMs, the game waits that much longer before
     *   calling a miss (at most maxExtraGraceMs). Measured on real phones: median ~50 ms, 1 in 10 over ~300 ms.
     */
    coach: {
      enabled: true,
      minSwings: 5,
      memory: 15,
      timingShare: 0.6,
      maxTimingShift: 120,
      strongPower: 85,
      powerScale: [1, 1.5],
      wideAim: 0.75,
      aimScale: [1, 1.6],
      normalDelayMs: 150,
      maxExtraGraceMs: 250,
    },
    /** Contact height decides the stroke: from overheadFrom up = overhead, from driveFrom up = flat drive, lower = lift (m). */
    overheadFrom: 1.7,
    driveFrom: 1.0,
    /** How far beside the shuttle the character stands for each stroke, so the racket meets it (m). */
    reach: { overhead: 0.35, drive: 0.8, lift: 0.6 },
    /**
     * How far short of the shuttle the character stops, on its own side (m): it keeps a little distance and
     * reaches out with the racket (and a lunge near the net) instead of running right under it.
     */
    reachBack: { overhead: 0.15, drive: 0.5, lift: 0.8 },
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
    /**
     * Texts over the game while playing (timing text above the head, tips, "Smash chance!", "SUPER SMASH!",
     * "Point to …", the serve prompt, the Mac keys line). Off on the user's request (2026-10-31: they hide the
     * game); the score, the rally counter and the result at the end of a match always show.
     */
    screenTexts: false,
    /** Timing text above the player's character: how long it shows (ms); Perfect makes the racket glow (ms). */
    popMs: 900,
    perfectGlowMs: 350,
    /** After a miss, a tip ("Wait for it!" / "Swing sooner!") shows at most once every this many rallies. */
    hintEveryRallies: 3,
    /** Mac keyboard: Space with W held swings this weakly (a wobble). */
    keyWeakPower: 15,

    // Shots. depth = landing distance from the net (min at 0 % power, max at 100 %), apex = extra height of the arc (m),
    // seconds = flight time (slow at 0 % power, fast at 100 %), drag = how much the shuttle slows down in flight
    // (a real shuttle slows down a lot; the user wants it slow, steady and easy to predict, so drag is kept low).
    /** The serve always goes diagonally into the receiver's service court (between the centre line and the sideline). */
    serve: { depth: [7.4, 8.15], apex: 3.8, seconds: [2.35, 1.95], drag: 1.0 },
    clear: { depth: [7.5, 8.15], apex: 4.0, seconds: [2.35, 1.85], drag: 1.1 },
    lift: { depth: [7.3, 8.15], apex: 4.2, seconds: [2.45, 1.95], drag: 1.0 },
    drive: { depth: [6.8, 8.0], apex: 0.4, seconds: [1.45, 1.1], drag: 0.6 },
    smash: { depth: [3.25, 5.25], apex: 0, seconds: [1.15, 0.8], drag: 0.3 },
    /** Drop shot (SHORT button held): soft, just over the net, lands close behind it. Slower swing = shorter. */
    drop: { depth: [0.8, 2.4], apex: 0.8, seconds: [1.8, 1.5], drag: 1.2 },
    /** Short serve (SHORT held while serving): low, lands just past the short service line (depth from the net). */
    shortServe: { depth: [2.7, 3.8], apex: 0.4, seconds: [1.6, 1.35], drag: 0.8 },
    /**
     * How high a drop and a short serve pass over the net (m). A drop still lands close to the net, so it
     * can never be smashed (a smash needs smashFromDepth from the net).
     */
    dropNetClearance: 0.4,
    shortServeNetClearance: 0.12,
    /**
     * A drop from the back of the court (at least smashFromDepth from the net) lands up to this far from
     * where it was aimed (m) and has this chance to end in the net. From mid-court or the front it is precise.
     */
    shortShotScatterBack: 1.2,
    shortShotNetChanceBack: 0.15,
    shortShotScatterMid: 0.35,
    /**
     * Wobble shot: what a bad hit becomes (too weak, timing outside the Good part, or a dive). Slow, high and
     * wobbly with a wavy trail, so the other side sees its chance coming. It mostly ignores the aim.
     */
    wobble: { depth: [4.0, 6.5], apex: 3.6, seconds: [2.9, 2.6], drag: 0.8 },
    /** A swing weaker than this (percent) gives a wobble shot (not for drops). */
    wobblePower: 25,
    /** The Good part of the hit window: further than this early or late (but still a hit) gives a wobble (ms). */
    goodEarlyMs: 220,
    goodLateMs: 170,
    /** How much of the aim a wobble keeps (0..1), how far it sways sideways (m) and how many sways per flight. */
    wobbleAimShare: 0.3,
    wobbleSway: 0.35,
    wobbleSwaysPerFlight: 5,
    /**
     * Trails behind the shuttle, one style per shot (colour, how long the trail is in ms). Chosen to be easy to
     * tell apart, also in split screen. In a fiery rally (rallyThresholds.fire) every shot except a wobble or a
     * Super Smash gets the fire trail.
     */
    trails: {
      serve: { colour: '#ffffff', ms: 450 },
      clear: { colour: '#ffffff', ms: 450 },
      lift: { colour: '#ffffff', ms: 450 },
      drive: { colour: '#3fe0e0', ms: 380 },
      drop: { colour: '#5be36b', ms: 380 },
      shortServe: { colour: '#5be36b', ms: 380 },
      smash: { colour: '#ff5a36', ms: 520 },
      superSmash: { colour: '#ffb400', ms: 700 },
      wobble: { colour: '#c45cff', ms: 600 },
    },
    fireTrail: { colour: '#ff7a1a', ms: 650 },
    /**
     * Long rallies (hits in one rally, the serve counts): the counter shows from `show`, the seagulls circle from
     * `birds`, a fire trail from `fire`, and a rally of at least `celebrate` gets a "Rally ×N!" when it ends.
     */
    rallyThresholds: { show: 3, birds: 5, fire: 10, celebrate: 5 },
    birds: 7,
    /**
     * Super Smash: a strong (>= superSmashPower) overhead hit on a wobble shot, met at least superSmashMinHeight
     * high (with the swing's jump) and timed in the Good part of the window. Allowed from anywhere on the court
     * (user, 2026-10-31). The fastest shot; each further Super Smash in the same rally is superSmashChainBoost
     * faster, up to superSmashMaxSpeed times the first one. A strong swing at a wobble that is badly timed
     * makes the character fall (a weak wobble back, or a miss).
     */
    superSmash: { depth: [2.5, 5.5], apex: 0, seconds: [0.75, 0.55], drag: 0.2 },
    superSmashPower: 75,
    superSmashMinHeight: 2.4,
    superSmashChainBoost: 0.12,
    superSmashMaxSpeed: 1.8,
    /** Returning a Super Smash: a tighter hit window (ms, too early / too late). */
    superSmashDefenseWindowMs: { early: 180, late: 130 },
    /** Juice: the shuttle stops at the racket for a moment, camera shake and a sand burst on landing (trail: see trails). */
    superSmashHitStopMs: 300,
    shakeStrength: 0.25,
    shakeMs: 450,
    sandBurst: 34,
    /** Every shot clears the net by at least this much (m). */
    netClearance: 0.35,
    /** A Perfect hit flies this much faster. */
    perfectSpeedup: 0.9,

    /** The computer: chance to return a normal shot and a smash, its power range (percent), and serve delay (ms). */
    cpu: { serveDelayMs: 1300, shortServeChance: 0.25 },
    /**
     * Computer difficulty (keys 1 / 2 / 3 during a match against it). reactionMs = how fast it starts running;
     * hitChance / smashReturnChance / superSmashReturnChance = how often it returns a normal shot / a smash /
     * a Super Smash; smashChance, dropChance, wobbleChance, superSmashChance = how often it plays those;
     * aimRange = how close to the lines it aims (1 = the sidelines); power and quality = how hard and clean it hits.
     */
    cpuLevels: {
      easy: { reactionMs: 230, hitChance: 0.7, smashReturnChance: 0.35, superSmashReturnChance: 0.15, smashChance: 0.15, dropChance: 0.08, wobbleChance: 0.22, superSmashChance: 0.25, aimRange: 0.5, power: [25, 70], quality: [0.3, 0.8] },
      normal: { reactionMs: 150, hitChance: 0.85, smashReturnChance: 0.55, superSmashReturnChance: 0.3, smashChance: 0.35, dropChance: 0.15, wobbleChance: 0.12, superSmashChance: 0.5, aimRange: 1, power: [30, 85], quality: [0.5, 1] },
      pro: { reactionMs: 100, hitChance: 0.95, smashReturnChance: 0.75, superSmashReturnChance: 0.5, smashChance: 0.5, dropChance: 0.25, wobbleChance: 0.05, superSmashChance: 0.8, aimRange: 1.1, power: [45, 95], quality: [0.7, 1] },
    },
    cpuLevel: 'normal' as 'easy' | 'normal' | 'pro',

    /**
     * Match lengths (chosen in the lobby card), rally scoring: first to `to`, you must lead by `winBy`, but the
     * one who reaches `cap` wins anyway (null = no cap). Pause after a point (ms).
     */
    matchLengths: {
      quick: { label: 'Quick', to: 4, winBy: 2, cap: null },
      normal: { label: 'Normal', to: 11, winBy: 2, cap: 15 },
      long: { label: 'Long', to: 21, winBy: 2, cap: 30 },
    },
    matchLength: 'quick' as 'quick' | 'normal' | 'long',
    pointPauseMs: 1600,

    /**
     * Camera behind the player, framed like a console sports game: it rides along behind the player (sideways
     * cameraFollowX, forwards / backwards cameraFollowZ, 1 = fully), cameraBehind metres behind and cameraHeight
     * high, looking cameraLookAhead metres in front of the player at cameraLookY high. So the player stays in the
     * same spot in the lower middle of the picture wherever they run, with the court in front of them.
     */
    cameraHeight: 4.2,
    cameraBehind: 5.5,
    cameraLookAhead: 6,
    cameraLookY: 0.5,
    cameraFollowX: 0.8,
    cameraFollowZ: 0.9,
    /** How quickly the camera catches up with the player (higher = tighter). */
    cameraFollowSpeed: 5,
    /** When the shuttle flies higher than cameraTiltFrom (m), the camera looks up this share of the extra height, at this speed. */
    cameraTiltFrom: 3.0,
    cameraTiltFollow: 0.4,
    cameraTiltSpeed: 3,
    cameraFov: 50,
    /**
     * Keeping things in the picture: the player (feet and head), a teammate and the shuttle must stay inside, with
     * this margin (share of half the picture). If one would leave, the view widens (up to cameraFovMax), quickly
     * (cameraWidenSpeed), and narrows back slowly (cameraNarrowSpeed).
     */
    cameraFrameMargin: 0.12,
    cameraFovMax: 72,
    cameraWidenSpeed: 8,
    cameraNarrowSpeed: 1.5,
    /** Split screen (two players): each half is narrow, so the camera sees wider and sits a little further back. */
    splitCameraFov: 60,
    splitCameraBehind: 5.2,
    /** The shuttle is drawn this much bigger than real, so it is easy to follow from the sofa. */
    shuttleScale: 2.4,
    /**
     * Shuttle look: 'classic' (white feathers, coral cork, thin dark outline, soft glow) or 'red' (the glowing red
     * one, refined). glow = how much the cork/feathers shine by themselves; halo = the soft glow around it.
     */
    shuttleStyle: 'classic' as 'classic' | 'red',
    shuttleLooks: {
      classic: { cork: '#ff6b57', feathers: '#ffffff', ribs: '#c9ced6', band: '#1e3a8a', glow: 0.25, outline: '#1b1f2a', halo: 0.35, haloColour: '#fff4d6' },
      red: { cork: '#ff1a1a', feathers: '#ff2a2a', ribs: '#b30000', band: '#ffd23d', glow: 0.7, outline: null, halo: 0.45, haloColour: '#ff5a3a' },
    },
    /** Rackets: size (1 = sized for our chibis, a little bigger than real), and the swoosh behind the head on each swing. */
    racketScale: 1,
    /**
     * 2 v 2 (B4): teammates wait side by side, laneOffset (m) either side of the middle; the receiving team's and
     * the server's partner stand partnerBack (m) further back at the serve. The teammate who goes for the shuttle
     * gets a ring in their colour on the sand (ringOpacity) and their phone buzzes. Teammates keep at least
     * minGap (m) apart.
     */
    doubles: { laneOffset: 1.5, partnerBack: 1.2, ringOpacity: 0.75, minGap: 0.9 },
    /** How long the reactions after a point last (milliseconds): the winner's jump and spin, the loser's slump. */
    pointReactionMs: { won: 1300, lost: 1300 },
    swoosh: { ms: 220, opacity: 0.55, colour: '#ffffff', perfectColour: '#ffd23d' },
    /**
     * Beach outfit for everyone (the avatar menu may later let players choose): top tank/tee, shorts/pants, feet
     * bare/shoes, a headband in headbandColour (null = none). Shorts are the player's colour darkened by
     * shortsShade (0 = same colour, 1 = shortsBase).
     */
    outfit: { top: 'tank', bottoms: 'shorts', feet: 'bare', headbandColour: '#ffffff' as string | null, shortsBase: '#1f2a44', shortsShade: 0.55 },
    /** Colour of the sand kicked up by the players (the beach itself is in `beach` below). */
    sandColour: '#ecd3a0',

    // The beach venue (host/badminton/venue/). The court runs along z; west (-x) is the deck and the sea,
    // north (-z) the open beach and the sea, east (+x) palms, the palapa and rocks, south (+z) a palm grove and hills.
    beach: {
      /** Change this number for a different (but always repeatable) placement of palms and rocks. */
      seed: 21,
      skyTop: '#2f8fe6',
      skyHorizon: '#cdeeff',
      clouds: 26,
      /** Sea: height of its surface, colours from the shore outwards, and how far out the surf breaks on the reef (metres). */
      seaLevel: -0.6,
      seaShallow: '#5fe3d6',
      seaMid: '#1fb5c9',
      seaDeep: '#1867b8',
      reefDistance: 34,
      /** The north shore's waterline (z), and over how many metres the beach slopes down to it. */
      northShoreZ: -24,
      beachSlope: 9,
      /** Sand: dry and wet colour, size of one texture repeat (metres), bumpiness, ground detail (metres per cell) and area [x0, z0, x1, z1]. */
      sandDry: '#fff6e2',
      sandWet: '#d9bb8a',
      sandTextureSize: 3,
      sandBumpiness: 1.5,
      groundCell: 1,
      groundArea: [-16, -42, 72, 78],
      /** The deck on the west: its sand-side edge (x), width, length (z from..to), height above the sand, umbrella spacing. */
      wallX: -9.6,
      deckWidth: 2.6,
      deckFromZ: -14,
      deckToZ: 40,
      deckHeight: 0.5,
      umbrellaEvery: 4.5,
      /** The court lines (rope thickness) and the net: sag in the middle and mesh size (metres). */
      ropeRadius: 0.028,
      netSag: 0.06,
      netCell: 0.07,
      /** Palms leaning over the east edge of the court: how far out (x) and where along it (z). */
      courtPalmsX: 7.2,
      courtPalmsZ: [-4.5, 4],
      /** Palm groves: [x, z, how many, radius]. */
      groves: [
        [13, -18, 5, 3.5],
        [-3, 22, 6, 4],
        [12, 17, 5, 4],
        [22, 2, 7, 6],
        [6, 30, 6, 6],
        [40, 20, 8, 9],
        [-4, 44, 7, 7],
      ],
      /** The palapa (x, z), volcanic rocks [x, z, size], and far green hills [x, z, width, height, depth]. */
      palapa: [11.5, -3.5],
      rocks: [
        [15, -9, 0.9],
        [16.5, -7.5, 0.6],
        [17, 6, 1.1],
        [15.5, 8, 0.5],
        [8, 14, 0.8],
        [-6, 15, 0.7],
        [-7, 16.5, 0.45],
        [9, -12.5, 0.6],
      ],
      hills: [
        [-10, 64, 26, 9, 14],
        [22, 70, 30, 12, 16],
        [58, 30, 14, 10, 30],
        [60, -10, 12, 7, 22],
      ],
      /** Feather flags [x, z, which way the banner faces (radians)]: by the net and at two corners. */
      flags: [
        [-5.2, 0.6, 0.4],
        [5.0, -0.6, Math.PI - 0.4],
        [-5.0, -11.6, -0.6],
        [5.2, 11.6, Math.PI + 0.6],
      ],
      flagHeight: 3.3,
      /** Wind: overall strength, and how far palms, flags and the net's band move. */
      windStrength: 1,
      palmSway: 0.35,
      flagSway: 0.22,
      netSway: 0.05,
    },
  },

  // Curling prototype (phase C1, SPEC §14): one ice sheet, stones thrown with the phone's minigolf swing.
  // Distances in metres: the thrower stands at z = 0 and throws towards -z; times in seconds.
  curling: {
    /** The ice: half of its width, how far the house's centre (the target) is, and how far the ice goes. */
    sheetHalfWidth: 2.3,
    houseDistance: 26,
    sheetLength: 30,
    /** The house rings (outer to inner) and the far hog line's distance in front of the house's centre. */
    ringRadii: [1.83, 1.22, 0.61, 0.15],
    hogLineBeforeHouse: 6.4,
    /** Stone radius (drawn a bit bigger than a real 0.145 m, so it is easy to see) and how many per end (both teams). */
    stoneRadius: 0.17,
    stonesPerEnd: 8,
    /** The stone slows down this much every second (m/s²); lower = slides further. */
    friction: 1.45,
    /** Throw speed for 0 % and 100 % swing power (m/s). About 66 % stops in the middle of the house. */
    minSpeed: 4,
    maxSpeed: 11,
    /** Phone aim (degrees) times this = the throw's direction (degrees), clamped to ±maxAimDegrees. */
    aimScale: 0.2,
    maxAimDegrees: 6,
    /** Mac keyboard: ← → turn the aim this fast (degrees per second); holding Space fills the power in this many seconds. */
    keyAimSpeed: 3,
    keyChargeSeconds: 1.6,
    /**
     * Curl: a twisted swing makes the stone drift sideways, more as it slows down (like a real stone):
     * sideways pull = curl / (speed + curlSoftening), at most curlMax (m/s²).
     */
    curl: 0.9,
    curlSoftening: 0.8,
    curlMax: 0.6,
    /** How bouncy a stone hitting another stone is (1 = no energy lost). */
    restitution: 0.88,
    /** All stones thrown and still: wait this long, then the next end starts with an empty sheet. */
    nextEndDelay: 3,
    /**
     * Camera: behind the thrower (height, distance back), following the stone, and above the house when everything
     * stopped (for houseSeconds, then back behind the thrower for the next stone). smoothing: higher = snappier.
     */
    camera: { height: 2.2, back: 4.2, followHeight: 3, followBack: 5, houseHeight: 9, houseBack: 3.5, houseSeconds: 2.5, smoothing: 3 },
    /** Team colours of the stones' handles (red team, yellow team). */
    teamColours: ['#e84a4a', '#f5c518'],
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
