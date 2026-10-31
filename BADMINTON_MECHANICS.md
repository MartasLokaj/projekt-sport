# Badminton mechanics upgrade — task brief for Claude Code

Read this whole file, SPEC.md §13 and progress/STATUS.md before starting. Talk to the user in Czech, as always.

## Why
The user researched how the best-known motion-control party badminton works (Nintendo Switch Sports badminton, 2022) and wants its core mechanics in our game, adapted to phones. Inspiration only: no names, characters or visuals from that game, and nothing in the game refers to it.

What makes that game fun, in short:
- Movement is automatic; the player only swings. The shuttle is floaty and hangs in the air, so timing has some leeway.
- Mind game between **smash** (fast, downward, pushes the opponent back) and **drop shot** (falls just past the net). Smashes push the opponent back, then a drop wins the point; drops pull them to the net, then a smash goes over their head.
- A badly timed or too slow hit becomes a **wobble shot** (slow, wobbly, with a wavy trail). The opponent can punish it with a **Super Smash**: the fastest shot, and consecutive Super Smashes in the same rally get even faster.
- Swinging too early / too far from the shuttle makes the character **dive and fall**; it needs time to get up, which opens the court for the opponent. A complete miss also ends with the character on the ground.
- Timing feedback ("too early / too late") teaches the player.
- Critics' complaints we want to fix: local matches are too short and have no options, no 2v2, automatic movement sometimes doesn't reach the shuttle, the smash can feel unresponsive.

## Keep exactly as it is (already approved by the user)
- Shot type comes from **court position and contact height**, not from the phone's tilt (phones can't reliably tell overhead from underhand). Aiming comes from the swing direction; timing decides hit/miss and quality.
- The current swing detection (B1 Swing Lab thresholds), clock sync, asymmetric hit window, Perfect window, flight speeds, shuttle size (`shuttleScale` 2.4), court size, the player's character jumping only with the swing, split screen, and default match length (to 4, win by 2).
- Change approved values only if a new mechanic truly needs it, and tell the user what changed and why.
- Do not touch `host/hub/`: a cloud session is redesigning the hub.

## New mechanics to add

### 1. Short shot (drop shot) with a phone button
- A big "SHORT" button on the phone (bottom of the screen, under the thumb, mirrored for left-handed players). Swinging while holding it plays a **drop shot**: soft, falls just past the net. Holding it during the serve gives a **short serve**.
- A drop hit from the back of the court is less precise (more scatter, may hit the net) than one from mid-court. Keep this tunable.
- The phone shows clearly when SHORT is held (colour change, light vibration on Android).

### 2. Wobble shots
- A return becomes a **wobble shot** when it was: (a) an out-of-reach / dive hit (see 3), (b) a swing slower than a tunable `wobblePower` threshold, or (c) timing outside the Good part of the window but still a hit.
- A wobble shot flies slower and higher, wobbles visibly, and has a distinct **wavy trail** in its own colour, so both players see the chance coming.
- The receiving phone gets a short vibration hint "Smash chance!" (Android) and the screen half shows a small icon.

### 3. Dive, fall and recovery
- A swing much too early, or when the shuttle is beyond normal reach: the character **dives**. If the shuttle is still reachable during the dive, the return is a wobble shot; otherwise it is a miss.
- After a dive or a complete miss, the character **falls** and needs `recoveryMs` (start around 900 ms, tunable) to get up. During that time it cannot move or hit, which opens the court.
- Funny, cute animations: a belly-flop into the sand with a little sand puff, then a quick scramble up. No pain or injury look.

### 4. Super Smash
- An overhead hit on a **wobble shot** at a high contact point (near the top of its arc, using the swing jump) with a strong swing (≥ `superSmashPower`) becomes a **Super Smash**: the fastest shot in the game. Allowed from anywhere on the court where the contact is high enough. If this conflicts with "smash only from the back", ask the user which rule wins.
- Consecutive Super Smashes in the same rally each get faster by `superSmashChainBoost` (cap with `superSmashMaxSpeed`).
- Defending one is possible but hard: a tighter hit window for the receiver (`superSmashDefenseWindowMs`).
- Juice: about 0.3 s slow motion on contact, big "SUPER SMASH!" text in that half, camera shake, sand burst and spray where it lands, a strong phone vibration for the hitter (Android).

### 5. Timing feedback
- Keep the per-half Early / Perfect / Late feedback and make it more readable and fun: big bouncy text above the player's own character for about 0.6 s. Perfect gets a golden flash on the racket and a short phone vibration.
- After a miss, show a small hint once in a while ("Wait for it!" after early misses, "Swing sooner!" after late misses), at most once every few rallies.

### 6. Automatic movement that reaches more often
- Make the running a bit more generous than now (tunable `reachAssist`), because the most common complaint about this kind of game is the character not reaching the shuttle. Dives (3) still exist for really far shots, so drops and smashes keep their value.
- The computer player uses the same rules (including diving and falling), with difficulty levels Easy / Normal / Pro: reaction time, accuracy, how often it smashes or plays short, how often it makes wobble shots.

### 7. Rally escalation
- A rally counter in the corner of each half (or once for full screen) from 3 hits on.
- From 5 hits the beach crowd/birds react; from 10 hits the shuttle gets a fiery trail, the music gets more intense, the waves get louder. A long-rally celebration when the rally ends ("Rally ×14!"). Graybox versions now (text, colours, simple particles); the beautiful versions come in B5.

### 8. Shot trails by type
- Each shot type has its own trail colour and shape: normal, clear/lift, drive, smash, Super Smash, drop, wobble (wavy). Choose an original, readable palette that works in split screen.

### 9. Match options
- Before the match (phone of the first player or Mac keys): match length **Quick (to 4, win by 2)** = current default, **Normal (to 11, win by 2, cap 15)**, **Long (to 21, win by 2, cap 30)**. CPU difficulty when playing against the computer.

## Tuning
All new values go into `TUNING.badminton`, named clearly (e.g. `wobblePower`, `wobbleSpeedFactor`, `recoveryMs`, `diveReach`, `reachAssist`, `superSmashPower`, `superSmashChainBoost`, `superSmashMaxSpeed`, `superSmashDefenseWindowMs`, `shortShotScatterBack`, `rallyThresholds`, `cpuLevels`).

## Order of work (each step: plan → user OK → build → user tests on real phones → commit, push, update STATUS.md)
1. Short shot button + short serve.
2. Wobble shots + dive, fall and recovery.
3. Super Smash (+ chain) with graybox juice.
4. Timing feedback upgrade, more generous movement, CPU levels.
5. Rally escalation (graybox), shot trails by type, match options.
6. Then continue with **B4 (2v2)** as planned. All these mechanics must work in 2v2: only the teammate closest to the shuttle is the active hitter (highlight them in that half); a dive or fall of one teammate does not freeze the other.

The beautiful versions of effects, sounds and the beach crowd belong to **B5**.
Keep minigolf, the hub and the Swing Lab working. Never write any text in the game that names another company's game.
