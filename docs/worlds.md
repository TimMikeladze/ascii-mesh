# Worlds — compose whole 2D / 3D ASCII scenes and animate them

Today the studio renders **one** point cloud spun as a whole. A *world* is a full scene: many
objects, each with its own geometry, material (colour ramp + charset), transform and procedural
animation, over generative 2D background/foreground fields, seen through an animated camera.
2D scenes are the same thing with an orthographic camera and flat shapes on depth layers.

## Data — `lib/ascii/world.ts` (pure, JSON, unit-tested)

```ts
World   = { v: 1, name?, duration, fit, camera: Camera, fields: Field[], objects: WObject[] }
Camera  = { rot: Vec3 (deg; negative tilt looks down), zoom, fov (0 = ortho / 2D), pan: [x, y], anim: Behaviour[] }
WObject = { id, name?, geom: Geom, pos, rot, scale, color, shadow?, charset?, emissive?,
            source?: boolean, tint?: 'height', anim: Behaviour[], array?: ArraySpec, hidden? }
Field   = { id, type, layer: back|front, charset, colors[2..4], scale, speed, intensity, angle, seed, hidden? }
```

- **Geom** — `shape` (SDF solid: sphere box cylinder torus cone), `sculpt` (a whole modeller
  `MeshScene`, so anything built in the existing modeller drops into a world), `flat` (2D SDF:
  circle ring rect star polygon heart moon petal cross triangle, with a pillow `bevel` so flat
  shapes still catch light), `text`, `image` (url), `curve` (helix knot lissajous spiral circle
  tube), `terrain` (hills mountains dunes ocean — ocean/flowing terrain recompute each frame, ocean
  with analytic normals), `particles`
  (stars snow rain fireflies embers galaxy ring dust — recomputed each frame from `t`).
- **Behaviour** — deterministic `f(t)`: `spin` (deg/s), `orbit` (deg/s, radius, tilt), `bob`,
  `pulse`, `sway` (Hz), `drift` (velocity + wrap), `keys` (keyframes, looped, eased), deformers
  `wave` and `twist` (per point, object space). Camera takes the same list.
- **Array** — instancing: `count`, `offset`, step `pos`/`rot`/`scale`, `spin` (whole ring turns),
  `phase` (time offset per instance → sequenced waves), `jitter` (random heights grown from the base). Instance i:
  `T(pos+anim) · R(i·stepRot + t·spin) · T(offset + i·stepPos) · R(rot+anim) · S(scale·stepScaleⁱ·anim)`.
- **Material** — shade `v` (light, or self-lit by `emissive`) picks a glyph from the object's
  `charset` (default: config charset) and a colour on the ramp `shadow → color`
  (default shadow: colour faded 85% to the background). `source: true` uses geometry colours
  (paint / image pixels); `tint: 'height'` ramps the colour by local height instead of shade.
- **Fields** — screen-space generators returning `v ∈ [0,1]` per cell: gradient plasma noise
  waves ripples rain fire aurora tunnel vortex stars metaballs rings. `back` fields fill cells no
  object covers; `front` fields overlay everything (rain, snow haze).
- `parseWorld` validates and drops bad entries (never throws), `serializeWorld` rounds numbers.

## Rendering — `lib/ascii/world-renderer.ts`

Shared z-buffer across every instance of every object. Per frame: camera matrix → per instance
3×4 matrix + normal matrix → project all points (winner keeps instance + point index) → lighting
only for winning cells → back fields in empty cells, front fields on top → counting-sort by 12-bit
colour bucket → `fillText`. Global config still drives font, cell size, background, light
direction, ambient, contrast/brightness/gamma, depth fade, shimmer, scan, intro, grid dots.
`pickObject(x, y)` returns the object under a pixel; `toText()` as before.

Point density follows the screen: target spacing = 0.6 cell in world units. Each object's model is
built in local space with **per-axis** spacing (`spacing / scale[axis]`, quarter-octave quantised,
cached by geometry + spacing), so long thin shapes (logs, towers, slabs) don't pay for their short
axes. Solids are sampled straight from their parametric surfaces (not the modeller's SDF sampler);
modelled `sculpt` objects use the SDF sampler at the smallest spacing.

## Component / studio

- `SourceSpec` gains `{ kind: 'world', world }`; `AsciiMesh` swaps renderer, builds object models
  (text / image async), disables config auto-motion (the world camera animates), drag still orbits.
  Replay restarts the world clock.
- Studio source **Compose a scene** → World section: gallery of curated scenes, scene settings
  (duration, camera, fit), fields list + inspector, objects list (add by kind, select, duplicate,
  delete, show/hide) + inspector (geometry params, transform, material, behaviours, array).
  Click an object on the canvas to select it. Undo covers the world; session + share link + folder
  pieces (`{ kind: 'world', world }`) persist it. Video export records one loop (`duration`).

## AI generation — `app/api/generate/route.ts`, `lib/ascii/world-prompt.ts`, `components/studio/ai-panel.tsx`

- Studio section **Generate with AI**: a chat. Each send posts the conversation (last 12 turns) plus
  the scene on screen (world + look keys, ids stripped) unless "start fresh" is ticked.
- The route calls `streamText` (AI SDK 7, AI Gateway model string, default `anthropic/claude-sonnet-5.5`,
  override `ASCII_AI_MODEL`) with `buildInstructions()` — the world format generated from the same
  type lists the parser uses, craft rules, and two gallery worlds as examples — and streams plain text.
- Reply = one sentence + a ```json block `{ world, config }`. `parseAiReply` tolerates a missing
  closing fence or bare object, runs `parseWorld`, and keeps only whitelisted look keys
  (`AI_CONFIG_KEYS`). Applied as one undo step; failures leave the scene untouched.
- No key → 503 with a setup hint (`AI_GATEWAY_API_KEY` or `vercel env pull` for an OIDC token).

## Gallery — `lib/ascii/worlds.ts`

Hand-tuned scenes (world + config patch) that show range: orrery, ocean sunset (2D), koi pond (2D),
aurora peaks, galaxy, DNA, campfire, warp tunnel, zen garden, neon rain city, lotus mandala (2D),
jellyfish, synthwave. Each must look good as a still frame and loop.

## Tests

`lib/ascii/world.test.ts`: parse/serialize round-trip + bad input, behaviours (periodic, keyframe
interpolation, array instances), geometry generators (flat shapes sized/bevelled, curves, terrain,
particles stay in bounds and move with t), fields stay in [0,1] and animate, renderer smoke test
with a stub 2D context (objects occlude fields, front fields overlay, `toText` non-empty, pick),
every gallery world parses, renders glyphs and stays under a point budget; AI reply parsing
(fenced, bare, truncated, garbage, config whitelist).
