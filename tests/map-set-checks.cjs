const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {app} = require('./builder-checks.cjs');

const root = path.join(__dirname, '..');
const catalogPath = path.join(root, 'assets', 'map-sets', 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const installed = catalog.sets.find(set => set.id === catalog.default.id && set.version === catalog.default.version);
assert.ok(installed, 'The default set must be installed');
const manifestPath = path.resolve(path.dirname(catalogPath), installed.manifest);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const normalize = value => value === undefined || value === null || value === '' ? null : value;
const matches = (entry, layer, object) => entry.layer === layer && Object.entries(entry.match).every(([key, value]) => normalize(object[key]) === value);

async function main() {
  const fresh = app();
  assert.deepEqual(fresh.saved().mapSet, {id: 'worn-dungeon', version: 1});
  const legacy = {format: 'wpdungeon', formatVersion: 1, width: 16, height: 16,
    tiles: [{x: 0, y: 0, type: 'wall', rotation: 90}]};
  await fresh.import(legacy);
  assert.deepEqual(fresh.saved(), legacy, 'Legacy maps must not gain a theme silently');
  fresh.click('new');
  assert.deepEqual(fresh.saved().mapSet, catalog.default, 'New from a legacy map chooses the default set');
  fresh.click('undo'); assert.deepEqual(fresh.saved(), legacy);
  fresh.click('redo'); assert.deepEqual(fresh.saved().mapSet, catalog.default);

  const future = {...legacy, mapSet: {id: 'frozen-crypt', version: 7}};
  const themed = app(); await themed.import(future);
  assert.deepEqual(themed.saved(), future, 'A future theme must survive import and save unchanged');
  themed.size(24); assert.deepEqual(themed.saved().mapSet, future.mapSet);
  themed.click('undo'); assert.deepEqual(themed.saved(), future);
  themed.click('redo'); assert.deepEqual(themed.saved().mapSet, future.mapSet);
  themed.click('new'); assert.deepEqual(themed.saved().mapSet, future.mapSet);
  themed.click('undo'); assert.equal(themed.saved().tiles.length, 1);
  const saved = themed.saved();
  const reloaded = app(); reloaded.storage.set('wpdungeon-v1', JSON.stringify(saved)); reloaded.click('load');
  assert.deepEqual(reloaded.saved(), saved);
  reloaded.click('export');
  assert.deepEqual(JSON.parse(await reloaded.downloads.at(-1).blob.text()), saved);

  const safe = app(); safe.paint(2, 3); const safeBefore = safe.saved();
  for (const mapSet of [null, [], 'worn-dungeon', {}, {id: '../other', version: 1},
    {id: 'Bad Name', version: 1}, {id: 'worn-dungeon', version: 0},
    {id: 'worn-dungeon', version: 1.5}, {id: 'worn-dungeon', version: Number.MAX_SAFE_INTEGER + 1}]) {
    await safe.import({...safeBefore, mapSet});
    assert.match(safe.e.status.textContent, /Invalid map set/);
    assert.deepEqual(safe.saved(), safeBefore, 'A malformed theme must leave the current dungeon intact');
  }
  safe.click('undo'); assert.equal(safe.saved().tiles.length, 0, 'Rejected imports must not create undo entries');

  assert.equal(manifest.id, installed.id);
  assert.equal(manifest.version, installed.version);
  assert.equal(new Set(manifest.objects.map(entry => entry.id)).size, manifest.objects.length);
  const materialIds = new Set(manifest.materials.map(material => material.id));
  const prefabKeys = new Set(manifest.prefabs.map(prefab => prefab.id));
  for (const entry of manifest.objects) {
    assert.ok(prefabKeys.has(entry.prefabKey));
    for (const id of entry.materialIds) assert.ok(materialIds.has(id), `Missing material ${id}`);
    if (entry.layer === 'decorations') assert.equal(entry.visualOnly, true);
  }

  const coverage = app(); let n = 0;
  const nonWalls = coverage.pieces().map(piece => piece.dataset.piece).filter(key => !key.startsWith('wall'));
  for (const key of nonWalls) { coverage.choose(key); coverage.paint(n % 16, Math.floor(n / 16)); n++; }
  for (const key of ['wall', 'wallBrick', 'wallWood']) {
    coverage.choose(key);
    for (const shape of ['horizontal', 'vertical', 'ne', 'se', 'sw', 'nw']) {
      coverage.wall(shape); coverage.paint(n % 16, Math.floor(n / 16)); n++;
    }
  }
  const map = coverage.saved();
  map.tiles.push(...[null, 'brick', 'timber'].map((variant, x) => ({x, y: 10, type: 'wall', rotation: 0, ...(variant ? {variant} : {})})));
  const seen = new Set();
  for (const layer of ['tiles', 'decorations']) {
    for (const object of map[layer] || []) {
      const candidates = manifest.objects.filter(entry => matches(entry, layer, object));
      assert.equal(candidates.length, 1, `Each exported object needs exactly one mapping: ${JSON.stringify(object)}`);
      seen.add(candidates[0].id);
    }
  }
  assert.equal(seen.size, manifest.objects.length, 'Every catalog entry must be reachable from existing map data');

  const example = JSON.parse(fs.readFileSync(path.join(root, 'examples', 'Worn_Dungeon_Asset_Check.wpdungeon'), 'utf8'));
  const demo = app(); await demo.import(example);
  assert.deepEqual(demo.saved(), example, 'The supplied review map must import without changes');
  const reviewCoverage = new Set();
  for (const layer of ['tiles', 'decorations']) {
    for (const object of example[layer] || []) {
      const entry = manifest.objects.find(candidate => matches(candidate, layer, object));
      assert.ok(entry, 'The sample must use catalogued objects only');
      reviewCoverage.add(entry.id);
    }
  }
  assert.equal(reviewCoverage.size, manifest.objects.length, 'The supplied review map must cover every mapping');

  const textureMaterials = manifest.materials.filter(material => material.baseColorTexture);
  assert.equal(textureMaterials.length, 8);
  for (const material of textureMaterials) {
    const file = path.resolve(path.dirname(manifestPath), material.baseColorTexture);
    assert.ok(file.startsWith(path.dirname(manifestPath) + path.sep));
    const png = fs.readFileSync(file);
    assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${material.id}: expected PNG`);
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    assert.equal(width, height, `${material.id}: expected a square texture`);
    assert.ok(width >= 512 && width <= 4096, `${material.id}: unexpected source resolution`);
    assert.equal(material.colorSpace, 'sRGB');
    assert.ok(material.smoothness >= 0 && material.smoothness <= 1);
  }
  console.log(`PASS: theme defaults, legacy omission, future set preservation, history, resizing, save/load/export, invalid imports, ${seen.size} object mappings and ${textureMaterials.length} PNG textures.`);
  console.log('No browser renderer or Unity runtime was exercised.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
