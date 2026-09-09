# Image Rasterizer handoff

Implementation and visibility/toolbar follow-up complete; files frozen for root integration. Root owns repository publishing and commits. No commits/pushes were made by this implementation agent, and no GitHub Actions files were created.

## API

- Package: `@zachshotamartin/image-rasterizer`.
- Named exports: `mountExperiment(element, options = {})`, `metadata` from `src/index.js`.
- CSS export: `@zachshotamartin/image-rasterizer/style.css` → `src/style.css`.
- Synchronous mount returns `{ dispose() }`; disposal is idempotent.
- Use `{ embedded: true }` in Portfolio to omit the standalone heading. The same rendering/controls run standalone and embedded.
- `assetBase` needs no special handling: scene meshes/textures are generated in packaged modules, and the worker is bundled using `new URL('./render.worker.js', import.meta.url)`.
- No runtime dependencies, network requests, backend, uploads, AI model, API cost, or GPU rendering. Vite 8.2.2 and Playwright are development dependencies. Node 22 is required.
- Standalone development URL: `http://127.0.0.1:5183`.
- `.image-rasterizer` exposes `data-render-state="pending|rendering|ready|paused|error"` and `data-completed-frames` starting at 0. Scheduling marks pending synchronously (paused if not visible). Wait for ready before asserting updated pixels. The counter increments only after an accepted frame is drawn. Capture and browser helpers use these attributes rather than export availability.

## Implemented

CPU transform → six-plane homogeneous clipping → perspective divide → top-left pixel-center coverage → Z buffer → perspective-correct color/UV/normal interpolation → Lambert shading or diagnostics. Canvas 2D displays ImageData from a worker.

Four presets: the default geometric still life, a smooth torus (1,280 triangles with analytic normals and UVs plus two ground triangles), perspective checker, and overlapping meshes. Includes orbit by drag/sliders/keyboard, camera distance, resolution, shaded/wireframe/depth/normals/UV views, perspective toggle, nearest/bilinear texture filtering, optional auto rotation, actual per-pixel inspection, validated OBJ/image import, PNG export and reset.

Worker requests debounce and terminate superseded work. Results carry IDs; stale replies are ignored. Hidden/offscreen tools pause. Dispose stops workers/timers, disconnects observers, aborts listeners, releases pointer capture, revokes download URLs and removes owned DOM. Inspection reuses existing buffers and does not allocate a new frame or trigger rasterization.

Visibility initializes from actual element bounds with the observer's 80px margin. Batched IntersectionObserver records use the final entry for the single observed target, so an offscreen/onscreen batch cannot leave rendering stuck paused. Paused status is explicit and queued work resumes when visible.

There is no Cancel render button. Internal stale-work/disposal cancellation remains. Export PNG becomes enabled after the first complete frame and stays enabled during later pending/rendering/paused/error states. Export copies saved completed pixels into a temporary canvas and uses that frame's saved scene, view and dimensions in its filename. Steady rotation does not alternate the status with Rasterizing or rewrite identical status text. CPU statistics continue updating.

## Verification (2026-09-09)

Executed with `/opt/homebrew/opt/node@22/bin` first on PATH:

- `npm test`: **24 passed**. Projection planes, homogeneous near/all-plane clipping, clipped attributes, nonfinite/behind-camera rejection, exact diagonal/horizontal/vertical shared-edge ownership, winding, depth order, depth interpolation, perspective weights and actual UV changes, degenerate/offscreen triangles, texture filters, resolution/triangle/sample budgets, full preset framing, outward octahedron normals, torus topology/unit normals/UVs/finite buffers, OBJ indexing/normalization/guards, image header bounds, and initial viewport/margin/collapsed geometry.
- `npm run test:browser`: **11 passed**, Chromium. Real worker frame, camera keys/drag, resolution and every mode, perspective/filter differences, pixel inspection and PNG download, OBJ/PNG imports and malformed file errors, reset, 390px no horizontal overflow and correct canvas aspect, worker mount/dispose tracking, superseded pending-worker cancellation, richer torus controls, deterministic batched false/true visibility, initially offscreen resume, five auto-rotation frames without disabled/status/cancel flashing, and an exported PNG decoded and pixel-hash matched to its old completed frame while different scene/view/dimensions are pending.
- `npm run build`: **passed**, Vite 8.2.2. Standalone bundle approximately 23.9 kB JS + 7.6 kB CSS + 5.0 kB worker before gzip.
- `npm run capture`: **passed**; actual images visually inspected. The octahedron's original inward face winding was caught during visual review, corrected, and covered with a regression test.

## Examples

Primary showcase files are `examples/torus.png` and `examples/perspective.png`. Both show the entire actual CPU output with no geometry clipping or letterboxing. Also included: `geometry.png`, `torus-wireframe.png`, full tool screenshots (`torus-interface.png`, `geometry-interface.png`, `perspective-interface.png`), and `mobile.png` at 390px.

Canvas screenshots are 1014 × 762 (the actual displayed canvas at a 1600px desktop viewport); full tool screenshots are 1320 × 1380. The raster itself is 800 × 600. The 4:3 output aspect is preserved rather than stretching it to a marketing-image ratio. The capture script drives real controls and worker output; it does not replace pixels or use generated artwork. Geometry is deterministic; interface render-time measurements naturally vary by run.

## Root integration / limits

- Root owns GitHub repository creation, commits, immutable package integration and publication.
- Import CSS once and pass `embedded: true`; dispose on unmount. No external assets need copying for runtime use. Host must support a module worker (Vite handles bundling).
- CSS is scoped under `.image-rasterizer`, inherits host fonts and uses the shared forest/sage palette. Empty raster pixels, the canvas wrapper and `--ir-bg` use exact `#142321` (RGB 20, 35, 33), matching MeshWorkshop. Primary torus, perspective and wireframe captures were regenerated from the real renderer and visually inspected after this match. Canvas stays 4:3, including on desktop, and the inspector reticle remains visible.
- Maximum 2,000 input triangles, 800 × 600 pixels, 24 million candidate samples per frame. Budget is checked before pixel loops. OBJ polygons must be planar, convex and simple; concave/nonplanar/zero-area/self-intersecting faces fail clearly. No opaque fan approximation of unsupported faces.
- Texture headers are checked before decoding; limits are 8 MB / 4,096px per side, then downsample to 512px. OBJ is limited to 2 MB / 12,000 vertex attributes each.
- One sample per pixel, opaque surfaces, one directional light, no shadows/mipmaps/gamma-correct filtering. CPU work can be slower than GPU rendering; timings are measured renderer duration, not FPS.
- Original code and original procedural model/texture assets, MIT LICENSE. No borrowed source requiring an extra NOTICE. Primary algorithm references are linked in README.
