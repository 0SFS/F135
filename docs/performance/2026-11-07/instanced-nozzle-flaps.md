# Shared nozzle flap meshes, and instancing them behind a setting — 7 November 2026

Step 2 of [prompt 09](https://github.com/0SFS/fly/blob/main/docs/performance/2026-11-05/prompts/09-f35b-draws.md)
of fly's 5 November phone audit. Ledger: P-139. Baselines: F135 `79dc2b0`,
aircraft `270399c`, exhaust `838f4cf`, fly `a92c46e`, Babylon 8.56.2.
Commits: F135 `1d59f62`, F-35B `1339baa`, exhaust `c0967f3`, aircraft
`4cf11d0`, fly `3b0e369`. Push F135, F-35B, aircraft and fly together: without
aircraft's option, Babylon's default would load the new files as instances.

**Status:**

- The smaller engine files are committed. They draw the same picture as
  before, pixel for pixel.
- Drawing the flaps as instances, 120 fewer draws a pass, is a setting:
  **Model → Instanced repeated parts** (`osfs.aircraft.instancedParts`). It is
  off by default because it changes a few pixels on the nozzle's seams.
- Whether to turn it on is the user's decision.

## What changed

**F135 generator** (`scripts/f135Engine/glb.mjs`):

- Parts whose stored vertices, normals and material are identical now share
  one glTF mesh. A part that morphs never shares.
- The nozzle's 16 segments of each flap differ only in their parent nodes'
  poses. Its 128 parts (8 shapes, counting the divergent follower) become
  8 glTF meshes.
- Every node keeps its name, parent, pose and extras. The rig, the hot-surface
  glow and the exhaust depth pass still find each part by name.
- Accessor bounds are now those of the float32 values as stored, as glTF
  requires. Before, they were the float64 values before rounding. The
  difference is under one float32 step.

| File | Before | After | Change |
| --- | ---: | ---: | ---: |
| `F135-PW-600-installed.glb` | 1,066,152 B | 902,676 B | −163,476 B (−15.3 %) |
| `F135-PW-600-full.glb` | 1,892,588 B | 1,729,268 B | −163,320 B (−8.6 %) |

- The installed file has 146 parts in 26 glTF meshes, down from 146; the full
  file has 151 parts in 31.
- `manifest.json`, `src/generated/f135EngineData.ts` and the F-35B mod's
  `0sfs-mod.json` carry the new sizes and digests. Triangles are unchanged:
  12,976 installed, 24,408 full.

**Aircraft loader** (aircraft `src/createAircraftModel.ts`):

- A new option, `instancedParts`, sets Babylon's glTF `createInstances` for
  each file the model loads.
- **Off** (the default): each part that shares a glTF mesh loads as a mesh of
  its own. The loader still shares the vertex buffers. Meshes come in node
  order, as when each part had its own glTF mesh.
- **On**: they load as one mesh and 120 instances. Babylon draws each shared
  mesh and its visible instances in one draw, where the first segment would
  have drawn.
- No other 0SFS file shares a glTF mesh (all 53 GLBs checked), so the option
  changes nothing else today.

**fly:**

- Passes the setting to the model and marks it applied when a model is
  created.
- The dev model override loader forwards the same option.

**Exhaust** (`src/createEngineHotSurfaceGlow.ts`). With the setting on:

- An instance draws with its source mesh's material. So the glow binds the
  source and skips instances; binding an instance would do nothing.
- It compiles the instanced shader variant as well, from a hidden proxy with a
  hidden instance. Otherwise the first instanced frame would compile it.
- "Is this binding drawn?" counts the source's visible instances.

## Exactness

**The generator:**

- The F135 build test reproduces both GLBs byte for byte.
- It checks that exactly 8 glTF meshes are shared, each by 16 segments of one
  part, and that every other part has its own.
- It checks the bounds against the stored float32 values.
- A synthetic test checks the sharing key: the same stored float32 vertices
  share; a different material, normals, vertices, or a morphing part do not.

Generator mutants (`build/flap-instancing/mutants.py`), 7 of 7 caught:

| Mutant | Result |
| --- | --- |
| No sharing | caught |
| Material left out of the key | caught |
| Normals left out of the key | caught |
| Morphing parts shared | caught |
| Key on float64 values, not stored float32 | caught |
| Bounds from float64 values | caught |
| Wrong mesh count reported | caught |

Before the synthetic test, the three key mutants (material, normals, morph)
changed no bytes of today's files. They were equivalent on today's data, but
not in general.

**The setting**, 5 of 5 mutants caught:

- default on;
- the model ignoring the option;
- fly not passing the setting;
- the dev override dropping it, on the substituted path and on the public path.

The tests are in fly's `createAircraftModel.test.ts`,
`devModelOverride.test.ts` and `createFlightSimApp.test.ts`. The
`createAircraftModel` test loads the real installed file both ways:
128 segment meshes, 0 or 120 of them instances.

**The glow:** the exhaust's instanced-parts test catches all four of its
mutants:

- binding instances;
- not compiling the instanced variant;
- `drawn` ignoring instances;
- `setReflectionEnabled` ignoring instances.

## Pictures

The harness (`fly/build/flap-instancing/`) does the following:

- Loads the F-35B (HD) and the installed F135 through `createAircraftModel`,
  with the hot-surface glow bound on both regions.
- Renders 1280 × 720 in headless Chrome on the M5 (Metal), WebGL2 and WebGPU.
- Uses four poses: closed, open, vectored (pitch 0.6, yaw 0.15, half STOVL)
  and STOVL.
- Uses four views: the nozzle at 3.5 m, side, rear at 9 m, and chase at 24 m.
- With `--depth`, also renders the exhaust depth pass (`createEngineExhaustDepth`,
  camera-space depth in metres) behind a hidden 3 m plume box.
- Each variant runs in a fresh engine, in an interleaved order.

**Setting off against before:**

- Colour: 0 pixels differ in all 16 shots, on both backends.
- Exhaust depth texture: 0 texels differ in all 16 shots, on both backends.
- Draws are the same, colour and depth passes together: nozzle 423, side 325,
  rear and chase 415.
- Each variant against itself: 0.

**Setting on against before:**

- Colour: up to 20 pixels in a shot differ, by at most 5 of 255. Side views:
  0.
- The old file drawn in the instanced order (`old-grouped`) matches setting-on
  exactly on WebGL2. On WebGPU, three chase shots differ by 1–2 pixels of
  1/255, as much as the old file against itself there.
- So the changed pixels are two surfaces at the same depth on the seal and
  flap seams; a different draw order shows the other one.
- Drawing the instances one at a time through the uniform world matrix
  (`new-serial`) matches setting-on, apart from WebGPU's 1–2 chase pixels.
- Exhaust depth: up to 4,910 of 921,600 texels in the nozzle close-up differ,
  by at most 0.031 mm; in the chase view at 24 m, by at most 0.91 mm. That is
  about one depth step at that distance.
- One at a time and grouped give the same depth texture. So the depth change
  is the instanced shader's rounding of the world matrix, not the order.
- The plume samples that texture, so its path through the nozzle moves by
  under a millimetre. That was not rendered.

**Draws**, colour pass alone and with the depth pass:

| View | Before / off | On | Before / off, with depth | On, with depth |
| --- | ---: | ---: | ---: | ---: |
| Nozzle | 259 | 139 | 423 | 183 |
| Side | 167 | 47 | 325 | 85 |
| Rear | 260 | 140 | 415 | 175 |
| Chase | 260 | 140 | 415 | 175 |

## Frame time

These are fly built (`vite build`) and run by research's `profile.mjs`:

- F-35B at the default start, `?flightPerf=1`, 10 s cold.
- CPU profiler on, Chrome on the M5, about 59 frames/s (vsync) in every run.
- Means in ms a frame from the frame profiler.

**Before against setting on**, the earlier builds, interleaved old, new, new,
old:

| Run | render | render/draw | render targets | active meshes | main thread |
| --- | ---: | ---: | ---: | ---: | ---: |
| WebGPU before 1 | 4.100 | 1.960 | 0.995 | 0.385 | 40 % |
| WebGPU on 2 | 3.448 | 1.580 | 0.745 | 0.386 | 37 % |
| WebGPU on 3 | 3.454 | 1.522 | 0.768 | 0.386 | 36 % |
| WebGPU before 4 | 4.126 | 1.912 | 1.036 | 0.372 | 40 % |
| WebGL2 before 1 | 3.082 | 1.120 | 0.941 | 0.339 | 35 % |
| WebGL2 on 2 | 2.671 | 0.935 | 0.644 | 0.353 | 33 % |
| WebGL2 on 3 | 2.702 | 0.912 | 0.642 | 0.361 | 33 % |
| WebGL2 before 4 | 3.190 | 1.211 | 0.928 | 0.353 | 37 % |

- On WebGPU, render drops by about 0.66 ms a frame (16 %); on WebGL2, by about
  0.45 ms (14 %).
- Most of it is the draw and the render targets (the exhaust depth pass).
- Each arm against itself is within 0.03 ms (WebGPU) and 0.11 ms (WebGL2).

**Setting off against on**, the committed builds, `set.osfs.aircraft.instancedParts=off|on`
in the URL, same build:

WebGL2 calls counted in 10 s (the probe wraps the context's draw calls; about
600 frames):

| Setting | Plain draws | Instanced draws | Instances drawn | Main thread |
| --- | ---: | ---: | ---: | ---: |
| Off | 355,934 | 603 | 9,648 | 37 % |
| On | 211,387 | 10,234 | 163,744 | 33 % |

- Draws in all drop from 356,537 to 221,621 (−38 %).
- The 603 instanced draws with the setting off are the engine smoke's thin
  instances.
- With it on, about 16 more instanced draws a frame of 16 instances each:
  8 shared meshes in two passes.

WebGPU, interleaved off, on, on, off:

| Run | render | render/draw | render targets | active meshes | main thread |
| --- | ---: | ---: | ---: | ---: | ---: |
| Off 3 | 4.570 | 2.054 | 1.137 | 0.481 | 44 % |
| On 4 | 3.389 | 1.516 | 0.784 | 0.360 | 35 % |
| On 5 | 3.499 | 1.529 | 0.783 | 0.372 | 37 % |
| Off 6 | 4.178 | 1.915 | 1.065 | 0.378 | 40 % |

- Render drops by about 0.93 ms a frame (21 %), from a mean of 4.37 ms to
  3.44 ms.
- The off arm is noisier this time: its two runs differ by 0.39 ms (the first
  had 44 % main thread). Against the closer off run, on still saves 0.73 ms.
- The on runs agree within 0.11 ms.

These are M5 numbers. No phone was measured; the audit's phone figure for
the F-35B's render CPU is an estimate until one is.

## Left

- **The decision:** turn instanced parts on by default, or keep it off. On
  saves 120 draws a pass and about 0.45–0.93 ms of render a frame on the M5.
  It changes up to 20 pixels a shot on the nozzle's seams by up to 5 of 255,
  and the exhaust depth texture by under a millimetre. The L25 tolerance test
  would be the place to accept it.
- **A phone measurement:** with the setting off and on, interleaved.
- **The seams:** the changed pixels are surfaces at the same depth. Separating
  them in the generator would make either order give the same picture. That
  is a change to the model, which prompt 09 leaves to its step 3 and its
  visual review.
- The harness, the old files (`old/`) and the profile scripts stay in fly's
  ignored `build/flap-instancing/`. The mutant scripts are in F135's ignored
  `build/flap-instancing/`.
