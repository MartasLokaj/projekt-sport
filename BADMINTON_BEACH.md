# Badminton beach venue — design brief for Claude Code

The user gave a **reference photo** of a real beach badminton court (they will paste it into the chat). Rebuild that whole look as our badminton venue in **our own style**: cute, soft, low-poly toon (like the minigolf islands, KayKit/Kenney level of detail). Not a realistic copy.
Talk to the user in Czech. Work in this order and get the user's OK after each step: **1. court and surroundings → 2. players → 3. shuttle → 4. rackets.**
The venue code stays in its own venue file(s) (SPEC §13: more venues later). Don't touch `host/hub/` (cloud session).

## What is in the reference photo (to translate into our style)
- **Sand court** right on a tropical beach: warm light sand, uneven, full of footprints and little dimples.
- **Court lines made of dark rope/tape** lying on the sand, slightly wavy, pinned with small pegs at the corners.
- **Portable net**: black mesh with a bright **orange top band**, thin dark/blue posts with small feet, a slight sag.
- **Feather beach flags** (tall curved banners) at the ends of the court. In the photo they are green with a sponsor logo: **use our own design** (green with a simple original shuttlecock/cube icon). No real logos or text from the photo.
- **Thatched-roof hut (palapa)** behind one side of the court, with wooden tables and chairs under it.
- **Palm trees** leaning over the court edge, coconuts, fronds moving in the wind.
- **Closed green patio umbrellas** along a **wooden deck with a railing** on a low wall above the sea.
- **Turquoise sea** with white breaking waves on a reef line further out, horizon.
- **Big bright blue sky** with fluffy white clouds.
- **Dark volcanic rocks** along one edge of the beach.
- Bright tropical midday light: crisp soft shadows, warm sand bounce light.

## Step 1 — Court and surroundings
- Build the scene so **both split-screen views look great**: each camera is behind its own player. Put the sea and the deck with umbrellas along one long side, the palms, palapa and rocks along the other, and something nice behind each end (flags, palms, deck), so neither player looks at an empty background.
- Sand: soft uneven sand material with subtle footprints and dimples (texture/normal map or vertex detail), slightly lighter wet sand towards the sea.
- Reuse the minigolf sea/waves shader if it fits; add white surf on a distant reef line.
- Gentle wind: palm fronds, flags and the net's top band sway (cheap vertex animation).
- Keep it light: split screen renders twice. Instanced palms and props, low-poly, few draw calls, target 60 fps on the MacBook Air with two phones. Measure and report it.
- Show the user screenshots from **both player cameras** and one overview before polishing details.

## Step 2 — Players
- Our chibi characters in **beach outfits**: tank top or T-shirt in the player's colour, shorts, bare feet (small sand puffs when running and jumping), optional cap, visor, headband or sunglasses.
- Must stay compatible with the coming phone character editor (SPEC Phase 5): colours and accessories as options, not baked in.
- Keep all existing animations (running, swing jump, diving and falling from BADMINTON_MECHANICS.md). Add a happy celebration and a disappointed reaction suited to the beach.

## Step 3 — Shuttle
- Classic shuttlecock look: white feather skirt and a rounded cork base, at the current enlarged size (`shuttleScale`).
- It must stay easy to see against bright sand and sky in split screen. Offer the user 2 options: (a) white feathers with a coral/red cork, a thin dark outline and a soft glow; (b) the current glowing red style refined.
- It flips cork-first in flight; trails by shot type as in BADMINTON_MECHANICS.md §8.

## Step 4 — Rackets
- Classic badminton racket: oval head with a visible string grid, long thin shaft, grip tape in the **player's colour**. About 1.3× real size for readability (tunable).
- The racket head gets a short swoosh trail on every swing and a golden flash on Perfect hits.

## Not now
Other venues (cloud court, gym, backyard), spectator crowds beyond what BADMINTON_MECHANICS.md asks for in graybox form, online play.
