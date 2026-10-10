# Mesh editor — model, sculpt and paint your own 3D source

New source kind alongside preset / upload / text: a **scene** the user builds in the studio.

## Data — `lib/ascii/scene.ts`

```ts
MeshScene = { prims: Prim[], dabs: Dab[], paint: Record<number, number>, blend: number, meshes: ImportedMesh[] }
Prim  = { id, type: sphere|box|cylinder|torus|cone, op: add|subtract, pos, rot (deg), scale, color }
Dab   = { p, r, op: add|subtract, color }        // sculpt brush blobs
paint = voxel key (PAINT_CELL = 0.02 world units) -> 0xRRGGBB
ImportedMesh = { name, tris: number[] (9 per triangle, already normalised), color }
```

Plain JSON — goes into history, localStorage and (minus paint/meshes) share links.

## Geometry — SDF + surface sampling

- Every prim and dab has a signed distance function. Scene SDF = smooth union of `add` shapes
  (`blend` = smooth-min k), smooth subtraction of `subtract` shapes.
- Points: deterministic grid samples on each shape's own surface, density from `res` (same knob as
  image models). Samples far from the scene surface are dropped (buried / carved); the rest are
  projected onto the blended surface. Normal = SDF gradient (tetrahedral).
- Dabs blend with `min(blend, 0.6·r)`: chained smooth-mins of overlapping dabs with the full blend
  swell the surface past every dab and leave holes. Samples within a band (3× tolerance) take up to
  3 Newton steps onto the surface.
- Acceleration: shapes binned into a flat (CSR) 40³ grid by bounding sphere + their own blend; SDF
  eval only visits the point's bin. World-space samples are cached per prim/dab object.
- Incremental updates (`sceneChanges` + `updateSceneModel`): when only dabs were added/removed or
  prims edited in place, only the spheres around those changes are resampled; old points elsewhere
  are kept. Full rebuild for blend / mesh / add-remove-reorder edits, or when spacing drifts >25%.
  ~20ms per stroke step on typical scenes, ~100ms with 400 overlapping dabs (Node, res 288).
- Imported OBJ/STL triangles are area-sampled, kept unless inside an `add` shape or a `subtract` shape.
- Each point records its shape index (`Model.prim`) for click-to-select. Colour = paint voxel if set,
  else the winning shape's colour; `lum` = colour luminance.
- Colour is a separate cheap pass (`colorizeModel`) so painting never rebuilds geometry.

## Renderer / component

- `AsciiRenderer.pick(x, y, buf?)` → point index under a canvas pixel (last frame's z-buffer, ±1
  cell). Strokes pick from a `snapshotPick()` taken at stroke start, so clay isn't picked on clay
  added by the same stroke (it would climb toward the camera).
- `AsciiRenderer.project()` places DOM overlays: the brush ring and a dashed ring around the selected
  shape (positioned every rendered frame, so they never end up in PNG/video exports).
- `OhMyAscii` props: `tool: 'orbit' | 'brush'`, `brushRadius`, `onBrush(hit, phase)`.
  In brush mode drag paints instead of rotating, auto-motion pauses. `SourceSpec` gains
  `{ kind: 'scene', scene }` so exported code can render a saved scene.

## Studio

- Source → "Model, sculpt & paint in 3D" switches to the scene source (starter: sphere on a box with
  a cylinder cut through it).
- Model section: add-shape buttons, shape list (select, add/subtract, duplicate, delete), selected
  shape transform sliders + colour, blend slider, import OBJ/STL, clear sculpt / paint, export
  scene JSON and PLY point cloud.
- Canvas toolbar (scene source only): Orbit · Select · Paint · Clay · Carve (`o v b g e`), brush size,
  brush colour; `[`/`]` size, `d`/`⌫` duplicate/delete, alt-drag orbits. Painting switches colour mode to `source` so it's visible.
- Undo history snapshots `{cfg, scene}`; one stroke = one undo step.
- Session: scene saved under `ohmyascii:scene`. Share links carry prims + dabs; paint and imported
  meshes stay local.

## Tests

Vitest (`pnpm test`, `lib/ascii/scene.test.ts`): surface sampling, subtract/union culling, sculpt,
paint, OBJ/STL parsing, serialisation, no-holes coverage (z-buffer vs ray-marched SDF), incremental
update parity with full rebuilds.

## Not done / later

- Geometry builds on the main thread; a Web Worker would keep the UI at 60fps on dab-heavy scenes.
- Paint lives in world space, so moving a shape leaves its paint behind.
- No mesh (OBJ) export — only PLY points.
