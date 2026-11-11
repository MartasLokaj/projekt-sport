# More sports — ideas (2026-11-11)

Short briefs for future games, written in the same spirit as SKI.md and F1.md. Each one is a draft to talk through with
the user; when one is chosen, expand it into its own full brief (`<GAME>.md`) and a SPEC section, then build it phase by
phase like the others. Same rules everywhere: toy-like 3D built in code, CC0 assets only with the user's yes, 1 phone =
vs CPU, 2–4 phones = everyone plays, results on our podium, do not change the other games.

**Cube sides:** only two mystery sides are left (`mystery-3`, `mystery-4`). Proposal: Formula racing takes one;
the winter ideas below (A–C) become **events inside the Skiing side** ("Winter Games": Downhill / Ski jump / Bobsleigh /
Biathlon) so they reuse the snowy world, the ski outfit and the wheel steering; the last side stays for the summer
favourite the user picks (D–H). If more games come, the cube could get a "next cube" arrow or seasonal cubes.

Ordered by how much existing code they reuse (most first).

---

## A. Ski jump (event inside Skiing)
- **Feeling:** the long in-run, the take-off, flying in silence, the landing and the crowd going wild.
- **Phone:** held like the ski wheel. In-run: keep the tilt in the middle (balance bar). Take-off: **flick the phone up**
  at the right moment (green zone at the lip). Flight: tilt forward/back to keep the ideal angle (too steep = fall short,
  too flat = stall), wind arrow shown. Landing: press TELEMARK just before touching down for style points.
- **Scoring:** distance + style (5 judges with scores flying up), wind bonus/penalty. 2 jumps each, turns like minigolf.
- **Reuses:** ski world, `WheelSteer`, ski outfit, backdrop, turn-based flow and swing detection from minigolf.
- **Fun extra:** huge "K-point" line, slow-motion camera on a record jump, giant hill for the last round.

## B. Bobsleigh (event inside Skiing) — co-op
- **Feeling:** 2–4 players in **one bob**: everybody shakes at the start, then the whole team leans together through
  an ice channel with banked curves.
- **Phone:** start = **shake/run with the phone** (motion energy fills the push bar, everyone's push adds up), jump in on
  "JUMP" in time. Run = the pilot (player 1) steers with the wheel tilt; other players **lean** (tilt) in the curves; the
  more in sync, the faster. 1 phone = solo bob vs CPU times.
- **Race:** time trial, 2 runs, or 2 bobs (teams) side by side in a split ice track. Too high on the bank = flip
  (comical tumble, respawn).
- **Reuses:** ski world and look, `WheelSteer`, minigolf `tube`/`bank` lane shapes for the ice channel.

## C. Biathlon (event inside Skiing)
- **Feeling:** calm skiing, then a racing heartbeat at the shooting range.
- **Phone:** skating = alternate left/right swings (or the wheel tilt with rhythm). Shooting: phone held like a rifle
  (portrait), the crosshair sways with the phone and with your "heart rate" (higher if you skied fast); **hold breath**
  button steadies it for 2 s, tap to fire, 5 targets.
- **Race:** 2 laps + 1 shooting stop (Quick), each miss = a short penalty loop. Tension between speed and accuracy.
- **Reuses:** ski course generator (flat cross-country version), ski racers and CPU, aim maths from minigolf/curling.

## D. Kart racing / Formula — see F1.md (full brief)

## E. Bowling
- **Feeling:** classic party game, everyone knows it, perfect for families.
- **Phone:** hold like a bowling ball, step back, **swing forward** (reuse the minigolf/curling swing): speed = power,
  wrist twist at release = hook/spin, tilt = aim before the throw.
- **Rules:** 10 frames (Quick 5), strikes/spares scoring, turns. Pins with real physics (cheap rigid bodies, 10 pins).
- **Look:** retro toy bowling alley with neon, or an outdoor lane on a cloud island. Funny pin animations, strike
  fireworks, "TURKEY!" for 3 strikes.
- **Reuses:** swing detection and aim from minigolf/curling, turn flow, podium.

## F. Boxing (already on the user's list, SPEC "Ideas for later")
- **Phone:** one phone in the punching hand (or two phones per player for both hands later). Straight punch = fast push
  forward, hook = sideways swing, uppercut = upward swing, hold the phone near the face = guard, tilt = dodge.
- **Rules:** 3 rounds of 60 s, stamina bar (spamming tires you), knockdown + "get up" by shaking. 1v1, or vs CPU.
- **Look:** toy ring on a beach or a rooftop, soft-glove chibis, comic "POW" stars (no blood, family-friendly).
- **Reuses:** badminton swing detection and coach, split-screen camera.

## G. Kayak / rafting
- **Feeling:** wild river, rapids, splashes, team paddling.
- **Phone:** hold like a paddle, **swing left / right** to paddle on that side (rhythm = speed, one side only = turn).
  Rafting: 2–4 players in one raft, each paddles on their side, team sync matters (like the bob).
- **Race:** downhill river with gates (slalom), rocks, waterfalls (jump!), whirlpools. Shared camera like skiing.
- **Reuses:** ski course generator (bends, forks, gates) turned into a river, sea shader from minigolf/beach.

## H. Penalty shootout (football)
- **Feeling:** quick, loud, very easy to explain.
- **Phone:** shooter: aim with tilt, **flick** the phone forward to kick (speed = power, curl = sideways twist).
  Goalkeeper (other phone): a short window to **tilt/dive** left or right, up = jump. 1 phone = vs CPU keeper.
- **Rules:** 5 shots each, then sudden death. Stadium crowd in toy style.
- **Reuses:** minigolf swing, badminton timing windows, podium.

## I. More quick ones (one line each, for later)
- **Archery:** pull back with the phone, hold steady against the wind, release; turns.
- **Sprint & hurdles:** shake the phone as fast as you can, JUMP button for hurdles; 4 lanes side by side.
- **Table tennis:** like badminton but faster, smaller table, can reuse almost all badminton code.
- **Darts:** flick the phone, very cheap to build, great for parties.
- **Surfing:** wheel tilt to ride a wave, tricks in the air on the beach from badminton.

---

## Suggested order
1. **Formula racing** (F1.md) — new side, reuses the ski steering, the user's own idea.
2. **Ski jump** and **Bobsleigh** as events of the Skiing side (cheap, same world, very different feelings).
3. **Bowling** or **Boxing** for the last free side — ask the user which one.
