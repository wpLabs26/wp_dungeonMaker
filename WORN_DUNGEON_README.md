# WP Dungeon Builder V1.4 — Worn Dungeon map set version 1

This pack provides eight base-color surface textures, a shared object/material catalog, and a new `index-4.html` that saves a map-set identity. Version 3 stays available separately. The pack does **not** contain finished 3D models or change the existing Unity importer. Step In still uses its existing preview artwork.

## Files

- `index-4.html`: builder V1.4 with optional map-set metadata, still map format version 1. The Worn Dungeon asset set remains version 1 independently of the builder version.
- `assets/map-sets/catalog.json`: allowlist of installed map sets.
- `assets/map-sets/worn-dungeon-v1/manifest.json`: 28 object mappings, suggested materials and required prefab keys.
- `assets/map-sets/worn-dungeon-v1/textures/*.png`: eight square base-color textures.
- `assets/map-sets/worn-dungeon-v1/generation-prompts.json`: reproducible art direction and prompts.
- `tests/builder-checks.cjs` and `tests/map-set-checks.cjs`: dependency-free Node checks.
- `examples/Worn_Dungeon_Asset_Check.wpdungeon`: one sample with every surface, all wall directions, legacy full-cell walls and all ten decorations for importer review.

## Map sets and compatibility

New maps include:

```json
"mapSet": {"id": "worn-dungeon", "version": 1}
```

Geometry keeps its existing `type`, `variant`, `wallShape`, position and rotation. Scenery stays in the separate `decorations` list and stays visual only. Future sets can change textures and prefab bindings without changing those identities.

The builder preserves valid future map-set IDs and versions on import/export, save/load, resize and undo/redo. An old map without `mapSet` keeps that omission when re-exported. New clears the board and uses the current set, or Worn Dungeon when starting from a legacy map. There is no set picker yet because this pack contains one set.

This optional field is intended as an additive format extension. Builder compatibility has been checked; compatibility with the actual Unity loader still needs verification. Do not change the map format version or existing object names just to add a theme.

## Handoff for Codex in the Unity project

1. Inspect the working tabletop loader and the project's render pipeline before editing. Confirm version control or a backup. Preserve the existing Playground/Lab, Pac-Man, Escape Room and working tabletop scenes and systems. Any preview/demo must have its own newly named scene, such as `DungeonTexturePreview_Worn01`.
2. Import the PNGs as base-color textures in sRGB. Source images are 1254 × 1254; use Unity's 1024 maximum import size for this initial tabletop pack. They are intended for repeat wrapping. Inspect seams at 2×2 repetition and on the real mesh before production use, especially timber and water. These are generated color images, not measured PBR scans; there are no supplied normal, height, roughness or metallic maps.
3. Create materials with the existing pipeline's shader. Use the manifest's material IDs and suggested smoothness/metallic values as starting points, then tune under scene lighting. Unity `smoothness` here means 0=rough and 1=smooth. Do not import these color images as normal maps.
4. Bind each manifest `prefabKey` to an existing or newly made reusable 3D prefab. Straight walls, corner walls and old full-cell walls are separate geometries. A texture alone cannot supply the shapes of fountains, bones, doors or bridges.
5. Resolve the map's requested id **and** version through the catalog. Then match existing object fields to the catalog entry and select the prefab/material. Treat absent/null/empty variant and wallShape as the default. Preserve missing wallShape as the old solid wall. Ignore unknown map fields safely. Handle an unavailable set with a visible diagnostic and an explicit fallback policy.
6. Keep the loader's existing board scale and coordinate conversion. Verify horizontal/vertical walls and all four corners against the builder: NE=0, SE=90, SW=180, NW=270. Materials can share one texture across many props; UVs decide which parts of a mesh use it.
7. Create only visual scenery for the ten decorations. Pits and water remain visual-only choices. Card-driven enemies, chests, traps, poison and puzzles are outside this map builder.
8. Verify old maps, a new map tagged `worn-dungeon`, every wall shape and all ten props on PC, then on Quest. Water animation, waterfall flow and torch effects need separate shader/geometry work; the supplied water PNG is a static color base.

## Future Step In update

Use the same installed catalog and the same texture files when rendering the builder's Step In view. Keep map data independent of the renderer. Do not create a second set of theme-specific object names. The future renderer can resolve base-color textures now and reusable browser geometry later; exact lighting will depend on the renderer.

## Add another set later

Add a sibling folder with its own manifest and texture files, then add its id/version to `catalog.json`. Keep the existing gameplay/object identities. Increase a set's version when its asset contract changes so old maps can retain their intended appearance. A set picker and Step In renderer are future work.

## Manual GitHub upload

Extract this package and keep its folder structure when copying the contents into `wp_dungeonMaker`. Add the new `index-4.html` alongside the existing files. Keep `index-3.html` and the original root `index.html`. Upload the `assets` folder with its nested files. Committing to the Pages publishing branch is what makes an update publish. After deployment, open https://wplabs26.github.io/wp_dungeonMaker/index-4.html .

## Checks

Run from the repository folder:

```text
node tests/builder-checks.cjs
node tests/map-set-checks.cjs
```

The tests exercise the actual builder script in a simulated DOM and check catalog coverage, metadata preservation and local PNG files. They do not render a browser or run Unity. Final appearance, material tuning and mesh UVs need review in the actual project.
