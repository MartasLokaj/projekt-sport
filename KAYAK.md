# Kayak (SPEC §16) — brief for Claude Code

Read this whole file, SPEC.md (§12 hub, §16) and progress/STATUS.md before starting. Talk to the user in Czech,
in plain words; all code and in-game text in English. Plan first, wait for the user's OK, build phase by phase,
test on real phones after each phase, commit, push and update progress/STATUS.md and progress/OVERVIEW.md.

## Why
The user (2026-11-13) wants a **co-op game for two**: two friends sit in **one tandem kayak** (a kayak for two) and
paddle down a river. The point is **teamwork and timing**: only good, matched paddle strokes make the boat go
straight and fast, and the two have to agree on strokes to turn. Talking to each other ("left! left! now right!")
is part of the fun. The key word from the user: **synchronisation**.

## Controls (phone = the paddle)
- Each player holds their phone **landscape with both hands, like the shaft of a paddle**. A **stroke** = dip one
  end of the "paddle" down and pull it back: the phone rolls to one side (which side = left or right stroke) and
  sweeps through a short, quick turn. Read gyroscope + gravity (reuse the sensor helpers and the instant swing
  detection idea from `controller/badminton/swing.ts`, but in a new file `controller/kayak/stroke.ts`).
- Each stroke gives: **side** (left/right), **strength** (how fast), **time** of its strongest moment.
- **Back stroke** (push the paddle forward instead of pulling) = brake and turn on the spot. Decide in K1 whether
  it can be told apart reliably; if not, a big BRAKE button on screen instead.
- **Calibration:** "Hold the phone like a paddle and press Ready" sets the neutral roll (as in skiing).
- Phone vibrates **when the partner strokes** (a short tick), so each player *feels* the partner's rhythm without
  looking at the TV. A stronger buzz on "in sync", a rough buzz on a crash into a rock.
- Mac keys for testing without phones: A / D = front paddler left / right, J / L = back paddler left / right.

## Boat physics (the heart of the game)
Simple 2D boat on a flowing river (own code, no physics engine), all numbers in `TUNING.kayak`.
- A stroke on the **left** pushes the boat forward **and turns it right**; on the right, forward and left.
- **Front and back paddlers are different, like a real tandem kayak:** the front paddler gives more **speed**
  (sets the rhythm), the back paddler gives more **turning** (the back is the steering seat).
- **In sync** = both paddle on the **same side within a short time window** (start: ±120 ms). That stroke counts
  extra (speed bonus) and the turns cancel nicely → **straight and fast**. Then both switch sides together.
- **Out of sync** = strokes far apart or on opposite sides at the wrong moment: the boat wobbles, yaws and
  loses speed. Not a punishment wall, just clearly slower.
- **Turning on purpose:** both on the same side several times in a row = strong turn; one back stroke = sharp turn.
- **Sync streak:** in-sync strokes in a row fill a meter; full meter = a short **boost** (spray, speed lines).
- The river current carries the boat; eddies (calm spots behind rocks) slow and turn it; rapids shake it.

## Fair timing over Wi-Fi (critical)
Two phones send over Wi-Fi with different delays (20–150 ms). Judging "in sync" by **when the messages arrive**
would be unfair. Judge by **when each stroke happened on the phone**, converted to the server clock with the
existing `clock_ping` / `clock_pong` offset (like the badminton swing `at`). The host waits a short moment
(`TUNING.kayak.syncWaitMs`) for the partner's stroke before deciding. Show the measured delay of each phone in the
debug readout. Log every stroke pair to `logs/kayak-strokes.jsonl` (gitignored) for tuning the window.

## Race and river
- **Co-op time run** down a generated river (from a seed, built in 100 m pieces like the ski run): bends, rocks,
  rapids, small drops (waterfall steps), calm pools, **slalom gates** (green = go downstream through it, red =
  upstream gate: turn round and paddle up through it — the real canoe-slalom idea, needs teamwork). Missed gate =
  +5 s. Crashes into rocks = bump and slow down, no game over.
- **Medals** (bronze/silver/gold time) + **team stats** at the end: % strokes in sync, best streak, who was
  early/late more often ("Anna is 80 ms ahead on average"). Results on our podium.
- **Capsize (later, K4):** very out of sync in rapids → the boat tips over; both players do the **kayak roll**
  (turn the phone in a full circle together) to come back up.

## Players
- **2 phones = one boat (main mode).** Camera behind and above the boat; whole screen.
- **1 phone = with a computer partner** in the back seat who follows your rhythm (good for learning).
- **4 phones = two boats race**, split screen top/bottom or left/right (reuse the views from the ski split screen).
- 3 phones: not decided yet (e.g. two boats, one of them with a computer partner).

## Look
Same toy-like family as minigolf islands, beach and snow: bright clear water with a flowing shader (foam lines
along the current, white water in rapids), sandy and rocky banks, firs and leafy trees, two chibi characters
(our avatars) in life jackets in a bright kayak. Splashes from each paddle blade, wake behind the boat.
Built in code; free CC0 assets only after telling the user file, source and size and getting their yes.

## Architecture
- New game in the registry `host/hub/faces.ts` on a mystery side (`mystery-3` or `mystery-4`).
- Code in `host/kayak/` (`Kayak.ts` rules/camera, `river.ts` the river from a seed, `boat.ts` boat physics testable
  in Node, `paddlers.ts` characters and their stroke animation), phone screen `controller/kayak/screen.ts`, stroke
  detection `controller/kayak/stroke.ts`, tuning `TUNING.kayak`, messages in `shared/protocol.ts`
  (`kayak_mode`, `kayak_stroke {side, strength, at}`, `kayak_cue`), server flag like `ski_mode`.
- Reuse lobby, seats, clock sync, characters, podium, sounds, transitions, split-screen views.
- Do not change Minigolf, Badminton, Curling or Skiing behaviour.

## Phases (each ends with the user's test on real phones and their OK)
The user (2026-11-13) liked every extra idea and asked for each to be its own phase. One phase at a time.

- **K1 Stroke detection + fair timing (highest risk, first).** No river yet: the TV shows two big paddles and a
  timeline; each phone's strokes appear as marks (side, strength), pairs in sync light up green with the time gap
  in ms. Sync judged from the phones' own stroke times via clock sync (see "Fair timing"), each phone's Wi-Fi delay
  in the readout, strokes logged to `logs/kayak-strokes.jsonl`. Done when both players say strokes are detected
  every time, the side is never wrong, and "in sync" feels fair.
- **K2 Boat on calm water.** Graybox lake with buoys: basic boat physics, left stroke turns right and the other
  way, in-sync strokes go straight and fast, out of sync wobbles and slows. Both seats still equal.
  Done when going straight and turning on purpose feel good together.
- **K3 Seat roles.** Front paddler gives more speed and sets the rhythm, back paddler turns more (the steering
  seat). The lobby/phone shows who sits where; players can swap seats. Done when both feel their seat matters.
- **K4 Feel your partner.** Each phone gives a short tick when the partner strokes, a stronger buzz on an in-sync
  pair, a rough buzz on a crash. Done when the players can keep the rhythm without looking at the TV.
- **K5 Sync streak + boost.** In-sync strokes in a row fill a meter on the TV; full meter = a short boost (spray,
  speed lines, a sound). Out of sync empties it slowly. Done when the boost feels earned and exciting.
- **K6 Back stroke.** Push the paddle forward = brake and turn on the spot. First try reading it from the phone's
  movement; if it cannot be told apart reliably from a normal stroke, a big BRAKE button instead (ask the user).
- **K7 River run.** Generated river from a seed (100 m pieces like the ski run) with current, bends, rocks, eddies,
  rapids, small drops, calm pools and slalom gates: green downstream, **red upstream** (turn round and paddle up
  through it). Missed gate +5 s, rock = bump and slow down. Start, finish, time, bronze/silver/gold medals, podium.
- **K8 Team stats.** At the end: % strokes in sync, best streak, who was early or late more often and by how much
  ("Anna is 80 ms ahead on average"), number of crashes and missed gates. Shown before the podium.
- **K9 Look and juice.** Toy-like look (see "Look"): flowing water shader, foam, white water, banks and trees, two
  chibis in life jackets, paddle splashes, wake, sounds (CC0), music.
- **K10 Capsize + kayak roll.** Very out of sync in rapids tips the boat over (camera dips under water); both turn
  the phone in a full circle together to roll back up. Too long upside down = put back upright with a time loss.
- **K11 Computer partner (1 phone).** The other seat is the computer: it follows the player's rhythm (a little
  imperfect at first, better on Pro), so one person can play and learn.
- **K12 Cube side + 4 players.** A little river diorama on a free cube side (`mystery-3` or `mystery-4`, ask the
  user), lobby card, and with 4 phones two boats race in split screen (reuse the ski split-screen views).
  What 3 phones do is decided here with the user (e.g. two boats, one with a computer partner).
