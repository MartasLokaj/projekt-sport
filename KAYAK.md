# Kayak (SPEC §16) — brief for Claude Code

Read this whole file, SPEC.md (§12 hub, §16) and progress/STATUS.md before starting. Talk to the user in Czech,
in plain words; all code and in-game text in English. Plan first, wait for the user's OK, build phase by phase,
test on real phones after each phase, commit, push and update progress/STATUS.md and progress/OVERVIEW.md.

## Why
The user (2026-11-13) wants a **co-op game for two**: two friends sit in **one tandem kayak** (a kayak for two) and
paddle down a river. The point is **teamwork and timing**: only good, matched paddle strokes make the boat go
straight and fast, and the two have to agree on strokes to turn. Talking to each other ("left! left! now right!")
is part of the fun. The key word from the user: **synchronisation**.

**The most important rule (user, 2026-11-13): paddling must be the real kayak movement.** The player does exactly
what they would do in a real kayak, with the same arms, body and rhythm. It is **not** a tilt-to-steer control,
not a steering wheel and not buttons. If you could not paddle a real kayak with the movement, it is wrong.

## How a real kayak paddle works (what we copy)
A kayak paddle is one long shaft held with **both hands**, shoulder-width apart, with a **blade at each end**.
You paddle **left, right, left, right**: one blade goes into the water while the other is up in the air.
A **forward stroke** has four parts:
1. **Catch:** reach forward, twist the body, put the blade into the water next to your feet.
2. **Pull:** pull the blade back along the side of the boat to your hip, mostly by turning the body.
3. **Exit:** lift the blade out at the hip.
4. **Switch:** the other blade comes forward and goes in on the other side.
In a **tandem kayak** the front paddler sets the rhythm and the back paddler copies it, so both blades go into the
water **on the same side at the same moment**. The back paddler also steers.

## Controls (phone = the paddle)
- The player holds the phone **in both hands in front of the chest, like the middle of the paddle shaft** (phone
  landscape, the long side = the shaft). Then they **paddle for real**: reach forward, dip the left end down, pull
  back with a body twist, lift, then the right end, and so on. Standing or sitting on a chair or the floor both work.
- The phone follows the shaft: its **roll** shows which blade is down (left or right side), its **turn around the
  vertical axis** shows the body twist (forward reach → pull back), its **acceleration** shows the force.
- The phone recognises the **parts of each stroke** (catch, pull, exit), not just "a fast move". From each stroke
  it gets: **side**, **catch time** (blade in the water), **length** (how far forward it reached and how far back
  it pulled), **power**, and **quality** (clean stroke vs a short splash).
- **Paddle shaft stream:** the phone also sends the shaft angle about 30× a second, so the paddler on the TV copies
  the player's movement live. The player must see that their character paddles exactly like they do.
- **Real strokes for steering and braking** (each from real kayaking, each its own effect):
  - **Forward stroke** (above): forward + a small turn away from that side.
  - **Sweep stroke:** a wide, flat arc from the feet out to the side and back to the hip = strong turn away from
    that side, little speed.
  - **Back stroke:** the forward stroke backwards, the blade goes in at the hip and pushes forward = brake, reverse,
    turn towards that side.
  - **Rudder (back seat):** hold the blade still in the water behind you on one side = the boat turns towards that
    side while it glides.
- **Calibration:** "Hold the paddle in front of you, blades level, and press Ready" sets the neutral position.
  Then a short practice: "Paddle 4 strokes" so the phone learns each player's stroke size (big and small people
  paddle differently).
- Nobody looks at the phone while paddling: the phone screen is big and simple (Ready, the player's seat, a stroke
  flash); everything else is on the TV.
- Phone vibrates **when the partner's blade goes into the water** (a short tick), so each player *feels* the
  partner's rhythm. A stronger buzz on an in-sync pair, a rough buzz on a crash into a rock.
- Mac keys for testing without phones: A / D = front paddler forward stroke left / right, J / L = back paddler
  left / right, with Shift = sweep, with Ctrl = back stroke.

## Boat physics (the heart of the game)
Simple 2D boat on a flowing river (own code, no physics engine), all numbers in `TUNING.kayak`.
- Every stroke pushes the boat by how long and strong it was and turns it a little away from that side.
- **Front and back paddlers are different, like a real tandem kayak:** the front paddler gives more **speed**
  and sets the rhythm, the back paddler gives more **turning** (the back is the steering seat; rudder only there).
- **In sync** = both blades go into the water **on the same side within a short time window** (start: ±120 ms).
  Then the turns cancel out and the stroke counts extra → **straight and fast**.
- **Out of sync** = catches far apart or on different sides: the boat wobbles, yaws and loses speed. Not a
  punishment wall, just clearly slower.
- **Good technique pays off:** long, clean strokes go further than short, splashy ones; a steady rhythm keeps the
  boat gliding between strokes.
- **Sync streak:** in-sync strokes in a row fill a meter; full meter = a short **boost** (spray, speed lines).
- The river current carries the boat; eddies (calm spots behind rocks) slow and turn it; rapids shake it.

## Fair timing over Wi-Fi (critical)
Two phones send over Wi-Fi with different delays (20–150 ms). Judging "in sync" by **when the messages arrive**
would be unfair. Judge by **when each catch happened on the phone**, converted to the server clock with the
existing `clock_ping` / `clock_pong` offset. The host waits a short moment (`TUNING.kayak.syncWaitMs`) for the
partner's catch before deciding. Show each phone's measured delay in the debug readout. Log every stroke (and the
raw sensor samples around it) to `logs/kayak-strokes.jsonl` (gitignored) for tuning.

## Race and river
- **Co-op time run** down a river generated from a seed: bends, rocks, rapids, small drops (waterfall steps), calm
  pools, **slalom gates** (green = downstream, **red = upstream**: turn round and paddle up through it, as in real
  canoe slalom; needs teamwork). Missed gate = +5 s. Rocks = bump and slow down, no game over.
- **Medals** (bronze/silver/gold time) + **team stats** at the end. Results on our podium.
- **Capsize:** very out of sync in rapids → the boat tips over; both do the **kayak roll** together to come back up.

## Players
- **2 phones = one boat (main mode).** Camera behind and above the boat, whole screen.
- **1 phone = with a computer partner** in the other seat who follows the player's rhythm.
- **4 phones = two boats race** on a split screen. 3 phones: decided with the user in K12.

## Look
Same toy-like family as minigolf islands and beach: bright clear water with a flowing shader (foam lines along the
current, white water in rapids), sandy and rocky banks, trees, two chibi characters (our avatars) in life jackets
in a bright kayak, each holding a real two-bladed paddle. Splashes where each blade goes in, drips when it comes
out, wake behind the boat. Built in code; free CC0 assets only after telling the user file, source and size and
getting their yes.

## Architecture
- New game in the registry `host/hub/faces.ts` on a free side (`mystery-3` or `mystery-4`).
- Code in `host/kayak/` (`Kayak.ts` rules/camera, `river.ts` the river from a seed, `boat.ts` boat physics testable
  in Node, `paddlers.ts` characters with the live paddle), phone screen `controller/kayak/screen.ts`, stroke
  recognition `controller/kayak/stroke.ts` (testable in Node on logged samples), tuning `TUNING.kayak`, messages in
  `shared/protocol.ts` (`kayak_mode`, `kayak_paddle {roll, twist}` ~30×/s, `kayak_stroke {kind, side, catchAt,
  length, power, quality}`, `kayak_cue`), server flag like the other games.
- Reuse lobby, seats, clock sync, sensor permission flow, characters, podium, sounds, transitions.
- Do not change Minigolf, Badminton, Curling or Skiing behaviour.

## Phases (each ends with the user's test on real phones and their OK)
The user (2026-11-13) liked every extra idea and asked for each to be its own phase. One phase at a time.

- **K1 Real forward stroke + fair timing (highest risk, first).** No river yet. The TV shows each player's paddle
  moving live with their phone, and a timeline: every stroke appears as a mark (side, length, power, quality),
  in-sync pairs light up green with the gap in ms. Calibration + 4 practice strokes. Sync from the phones' own
  catch times via clock sync, Wi-Fi delay in the readout, logs. Done when both players say: the paddle on the TV
  moves like mine, every real stroke is counted, the side is never wrong, and "in sync" feels fair.
- **K2 Boat on calm water.** Graybox lake with buoys: forward strokes move the boat, in sync goes straight and
  fast, out of sync wobbles and slows, long clean strokes go further. Both seats still equal.
- **K3 Seat roles.** Front paddler gives more speed and sets the rhythm, back paddler turns more. The phone shows
  who sits where; players can swap seats. Done when both feel their seat matters.
- **K4 Feel your partner.** The phone ticks when the partner's blade goes in, buzzes on an in-sync pair and on a
  crash. Done when the players can keep the rhythm without looking at the TV.
- **K5 Sync streak + boost.** In-sync strokes in a row fill a meter; full = short boost (spray, speed lines,
  sound). Out of sync empties it slowly.
- **K6 Steering strokes.** Sweep stroke, back stroke and rudder (back seat), each recognised from the real
  movement. If one cannot be told apart reliably, show the user the logged data and decide together.
- **K7 River run.** Current, bends, rocks, eddies, rapids, drops, calm pools, green and red (upstream) gates,
  start, finish, time, medals, podium.
- **K8 Team stats.** % in sync, best streak, who catches early or late and by how much ("Anna is 80 ms ahead on
  average"), average stroke length, crashes, missed gates. Shown before the podium.
- **K9 Look and juice.** Water shader, foam, white water, banks, chibis in life jackets with real paddles,
  splashes and drips, wake, sounds (CC0), music.
- **K10 Capsize + kayak roll.** Very out of sync in rapids tips the boat over; both do a roll movement with the
  paddle (sweep it up from under the water in an arc) together to come back up. Too long = put back with a time
  loss.
- **K11 Computer partner (1 phone).** The other seat is the computer, it follows the player's rhythm (a little
  imperfect on Easy, better on Pro).
- **K12 Cube side + 4 players.** River diorama on a free cube side (ask the user which), lobby card, with 4 phones
  two boats race on a split screen; decide 3 phones with the user.
