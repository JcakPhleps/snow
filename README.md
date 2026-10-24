# SNOW ❄️🏂

A low-poly, PS2-era **snowboard** game — build on the same engine, character
model, and Frutiger-Aero look as [CRIBS](../cribs). One seeded mountain, real
momentum physics, a full air-trick system, and **live multiplayer**: everyone
rides the same run and sees each other bomb it.

Pure static site — Three.js + Firebase loaded via import map, no build step.

## Five runs

Pick from the level-select screen:

1. **Bunny Hill** — easy downhill, a few friendly jumps
2. **Backcountry** — a long, winding cross-country adventure
3. **The Face** — super steep speed run with a huge booter at the bottom
4. **The Long Haul** — a marathon descent, jumps the whole way
5. **Midnight Mayhem** — narrow night run, kickers back-to-back, send it

## Ride it

- **A / D** — carve (steer + a little speed scrub)
- **W** (or Shift) — tuck for speed · **S** — brake
- **SPACE** — *hold to charge a jump, release to pop* (bigger charge = bigger
  air). In the air, **hold SPACE to grab**.
- In the air:
  - **A / D** — spin (180 / 360 / 540 / 720…)
  - **W / S** — front / back flip
  - **Q / E** — cork (off-axis roll)
- You stay planted over small bumps — you only leave the ground off a kicker or a
  jump. You only **BAIL** if you actually rotated and land badly (or clip a
  tree); catch air straight and you always stomp it. Clean landings score and
  build a **combo multiplier**.
- Reach the finish banner for your run score, then **RIDE AGAIN** or pick another run.

## Soundtrack

Shuffled playlists in `music/menu` (title + level select) and `music/game`
(while riding), with a 🎵 mute toggle. Starts on the first click (DROP IN) to
satisfy browser autoplay rules.

## Physics

Everything the rider touches comes from one analytic `height(x,z)` function in
`js/mountain.js`, so the render mesh and the physics agree and **every client
shares the exact same mountain**. Gravity pulls you down the fall-line; kickers
are baked into the height field as a ramp-to-a-lip-then-drop, so hitting one at
speed launches you naturally. Trick cleanliness is judged by comparing the
board's up-vector to the slope normal and its forward-vector to your travel
direction — no fragile angle bookkeeping.

## Multiplayer

Shares the CRIBS Firebase project under a separate `snow/` subtree:

```
snow/riders/{uid}  live rider state (pos, orientation quaternion, trick, score)
snow/chat/{pushId} mountain-wide chat
```

Everyone signs in anonymously (zero friction — pick a name + board color and
drop in). Riders broadcast at ~11 Hz; remotes lerp/slerp toward their latest
state for smooth motion.

### Rules

`database.rules.json` is the **merged** CRIBS + SNOW ruleset. Deploy with:

```bash
cd ~/snow
npx -y firebase-tools deploy --only database
```

(This writes to the shared `cribs-55ba7` project but keeps all existing CRIBS
rules intact — it only adds the `snow/` subtree.)

## Run locally

```bash
cd ~/snow
python3 -m http.server 8000
# open http://localhost:8000
```

## Files

```
index.html         import map + DOM shell + title/HUD
css/style.css       Frutiger-Aero glass UI (shared look with CRIBS)
js/
  main.js           renderer/scene, title flow, game loop, netcode glue
  mountain.js       seeded height field, kickers, obstacles, finish
  rider.js          snowboard physics, air tricks, scoring, chase cam, spray
  remotes.js        other riders (board + name tag + live trick label)
  net.js            Realtime DB: shared riders + chat (snow/ subtree)
  firebase.js       anonymous auth
  player.js         buildAvatar() — the exact CRIBS character
  bubble.js         pixel speech bubble (shared with CRIBS)
```
