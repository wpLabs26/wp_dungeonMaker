const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'index-4.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);

// A minimal DOM runs the actual application handlers without a browser engine.
class Element {
  constructor(tag = 'div', fragment = false) {
    this.tagName = tag; this.fragment = fragment; this.children = [];
    this.style = {}; this.dataset = {}; this.attributes = {}; this.classes = new Set();
    this.value = ''; this.textContent = ''; this.innerHTML = ''; this.disabled = false;
    this.classList = {
      add: (...names) => names.forEach(n => this.classes.add(n)),
      remove: (...names) => names.forEach(n => this.classes.delete(n)),
      contains: name => this.classes.has(name),
      toggle: (name, force) => {
        const add = force === undefined ? !this.classes.has(name) : force;
        if (add) this.classes.add(name); else this.classes.delete(name);
        return add;
      }
    };
  }
  set className(value) { this.classes = new Set(value.split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  appendChild(child) {
    if (child.fragment) { this.children.push(...child.children); child.children = []; }
    else this.children.push(child);
    return child;
  }
  replaceChildren(...children) { this.children = []; children.forEach(c => this.appendChild(c)); }
  setAttribute(key, value) { this.attributes[key] = value; }
  click() { if (!this.disabled && this.onclick) return this.onclick({currentTarget: this, target: this}); }
}

function app() {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'HTML ids must be unique');
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const storage = new Map(), downloads = [], blobs = new Map();
  const descendants = element => [element, ...element.children.flatMap(descendants)];
  const allPieces = () => descendants(elements.palette).filter(element => element.classList.contains('piece'));
  const allWallShapes = () => descendants(elements.palette).filter(element => element.dataset.wallShape);
  const document = {
    getElementById: id => { assert.ok(elements[id], `Missing HTML element ${id}`); return elements[id]; },
    createDocumentFragment: () => new Element('fragment', true),
    createElement: tag => {
      const e = new Element(tag);
      if (tag === 'a') e.click = () => downloads.push({name: e.download, blob: blobs.get(e.href)});
      return e;
    },
    querySelectorAll: selector => {
      const pieces = allPieces();
      return selector.includes('#select') ? [...pieces, elements.select] : pieces;
    }
  };
  vm.runInNewContext(script, {
    document, Blob, console,
    localStorage: {setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) ?? null},
    URL: {createObjectURL: blob => { const key = `blob:${blobs.size}`; blobs.set(key, blob); return key; }, revokeObjectURL: () => {}},
    setTimeout: fn => fn()
  });
  return {
    e: elements, storage, downloads,
    click: id => elements[id].click(),
    size: side => { elements.tableSize.value = String(side); elements.tableSize.onchange(); },
    paint: (x, y) => elements.grid.children[y * Number(elements.tableSize.value) + x].click(),
    tool: index => allPieces()[index].click(),
    choose: key => {
      const piece = allPieces().find(e => e.dataset.piece === key);
      assert.ok(piece, `Missing piece ${key}`);
      piece.click();
    },
    pieces: allPieces,
    wallShapes: allWallShapes,
    wall: key => {
      const shape = allWallShapes().find(button => button.dataset.wallShape === key);
      assert.ok(shape, `Missing wall shape ${key}`);
      shape.click();
    },
    saved: () => { elements.save.click(); return JSON.parse(storage.get('wpdungeon-v1')); },
    import: async data => {
      elements.file.files = [{text: async () => JSON.stringify(data)}];
      await elements.file.onchange({target: elements.file});
    }
  };
}

async function main() {
  let scenarios = 0;
  const a = app();
  assert.equal(a.e.grid.children.length, 256);
  assert.equal(a.e.tableInfo.textContent, '256 squares');
  for (const side of [16, 20, 24]) assert.ok(html.includes(`option value="${side}"`));
  a.paint(15, 15); a.click('rotate');
  a.tool(4); a.paint(4, 2);
  const originalTiles = a.saved().tiles;
  a.size(20);
  assert.equal(a.e.grid.children.length, 400);
  assert.equal(a.e.grid.style.gridTemplateColumns, 'repeat(20,38px)');
  assert.deepEqual(a.saved().tiles, originalTiles);
  assert.match(a.e.grid.children[15 * 20 + 15].innerHTML, /rotate\(90deg\)/);
  a.size(24);
  assert.equal(a.e.grid.children.length, 576);
  assert.deepEqual(a.saved().tiles, originalTiles);
  scenarios++;

  a.paint(23, 23);
  const withEdge = a.saved();
  a.size(16);
  assert.equal(a.e.tableSize.value, '24');
  assert.match(a.e.status.textContent, /Cannot shrink/);
  assert.deepEqual(a.saved(), withEdge);
  a.click('undo'); // Rejected shrink must not add an undo entry.
  assert.equal(a.e.tableSize.value, '24');
  assert.deepEqual(a.saved().tiles, originalTiles);
  a.click('undo');
  assert.equal(a.e.tableSize.value, '20');
  a.click('redo');
  assert.equal(a.e.tableSize.value, '24');
  a.size(16);
  assert.equal(a.e.grid.children.length, 256);
  assert.deepEqual(a.saved().tiles, originalTiles);
  a.click('undo'); assert.equal(a.e.tableSize.value, '24');
  a.click('redo'); assert.equal(a.e.tableSize.value, '16');
  scenarios++;

  for (const [x, y] of [[23, 2], [2, 23]]) {
    const b = app(); b.size(24); b.paint(x, y);
    const before = b.saved(); b.size(20);
    assert.equal(b.e.tableSize.value, '24');
    assert.deepEqual(b.saved(), before, 'Both right and bottom edges must be protected');
  }
  scenarios++;

  for (const side of [16, 20, 24]) {
    const b = app(); b.size(side); b.paint(side - 1, side - 1); b.click('rotate');
    const saved = b.saved();
    b.click('new'); b.size(side === 16 ? 24 : 16); b.click('load');
    assert.deepEqual(b.saved(), saved);
    assert.equal(b.e.grid.children.length, side * side);
    b.click('new');
    assert.equal(b.e.tableSize.value, String(side), 'New keeps the chosen size');
    assert.equal(b.saved().tiles.length, 0);
    b.click('undo'); assert.deepEqual(b.saved(), saved);
  }
  scenarios++;

  const legacy = {format: 'wpdungeon', formatVersion: 1, width: 16, height: 16,
    tiles: [{x: 15, y: 14, type: 'door', rotation: 270}]};
  const b = app(); b.size(24);
  b.storage.set('wpdungeon-v1', JSON.stringify(legacy)); b.click('load');
  assert.deepEqual(b.saved(), legacy, 'Existing V1 saves remain readable');
  scenarios++;

  for (const side of [16, 20, 24]) {
    const c = app();
    const data = {format: 'wpdungeon', formatVersion: 1, width: side, height: side,
      tiles: [{x: side - 1, y: side - 1, type: 'floor', rotation: 270, variant: 'bridge'}]};
    await c.import(data);
    assert.deepEqual(c.saved(), data);
    assert.equal(c.e.tableSize.value, String(side));
    assert.equal(c.e.grid.children.length, side * side);
    c.click('export');
    const exported = JSON.parse(await c.downloads.at(-1).blob.text());
    assert.deepEqual(exported, data, 'Export must include the selected dimensions and edge tiles');
    assert.equal(c.downloads.at(-1).name, 'Dungeon_01.wpdungeon');
    c.click('select'); c.paint(side - 1, side - 1); c.click('step');
    assert.match(c.e.info.textContent, new RegExp(`Tile ${side - 1},${side - 1}`));
    assert.equal(c.e.marker.textContent, 'Bridge');
  }
  scenarios++;

  const c = app(); c.paint(7, 8); const before = c.saved();
  for (const data of [
    {...before, width: 32, height: 32},
    {...before, width: 24, height: 16},
    {...before, formatVersion: 999}
  ]) {
    await c.import(data);
    assert.deepEqual(c.saved(), before, 'Invalid imports must leave the current dungeon intact');
  }
  c.click('undo'); assert.equal(c.saved().tiles.length, 0, 'Invalid imports must not add history');
  scenarios++;

  const terrain = app();
  assert.deepEqual(terrain.e.palette.children.map(group => group.children[0].textContent), ['Floors', 'Walls', 'Features', 'Decorations']);
  const expectedPieces = ['floor', 'floorWood', 'floorEarth', 'floorPit', 'floorWater', 'wall', 'wallBrick', 'wallWood', 'bridge', 'start', 'end', 'door'];
  const decorKeys = ['waterfall', 'fountain', 'bones', 'barrel', 'crate', 'rubble', 'cobweb', 'torch', 'statue', 'column'];
  assert.deepEqual(terrain.pieces().map(piece => piece.dataset.piece), [...expectedPieces, ...decorKeys]);
  assert.ok(terrain.pieces().every(piece => !['enemy', 'treasure', 'trap', 'puzzle', 'stairs', 'pit'].includes(piece.dataset.piece)));
  const expectedTerrain = [
    ['floor', null], ['floor', 'timber'], ['floor', 'earth'], ['floor', 'pit'], ['floor', 'water'],
    ['wall', null], ['wall', 'brick'], ['wall', 'timber'],
    ['floor', 'bridge'], ['start', null], ['floor', 'end'], ['door', null]
  ].map(([type, variant], x) => ({x, y: 1, type, rotation: x === 8 ? 90 : 0,
    ...(variant ? {variant} : {}), ...(type === 'wall' ? {wallShape: 'straight'} : {})}));
  expectedPieces.forEach((key, x) => {
    terrain.choose(key); terrain.paint(x, 1);
    if (key === 'bridge') terrain.click('rotate');
    assert.equal(Boolean(terrain.e.step.disabled), key.startsWith('wall'), 'All wall styles block inspection');
    assert.equal(terrain.pieces().filter(piece => piece.classList.contains('active')).length, 1);
    assert.ok(terrain.e.grid.children[16 + x].innerHTML.includes(`tile-${key}`), 'The chosen texture must be rendered');
  });
  assert.deepEqual(terrain.saved().tiles, expectedTerrain);
  assert.match(terrain.e.grid.children[24].innerHTML, /rotate\(90deg\)/, 'Bridge artwork rotates with the bridge');
  terrain.size(24); assert.deepEqual(terrain.saved().tiles, expectedTerrain);
  terrain.click('undo'); assert.equal(terrain.e.tableSize.value, '16');
  assert.deepEqual(terrain.saved().tiles, expectedTerrain);
  const roundtrip = app(); await roundtrip.import(terrain.saved());
  assert.deepEqual(roundtrip.saved().tiles, expectedTerrain, 'Materials and Start/End/Bridge must survive import');
  roundtrip.click('select'); roundtrip.paint(1, 1); roundtrip.click('step');
  assert.equal(roundtrip.e.marker.textContent, 'Timber floor');
  assert.ok(roundtrip.e.marker.classList.contains('tile-floorWood'));
  scenarios++;

  const old = app();
  await old.import({format: 'wpdungeon', formatVersion: 1, width: 16, height: 16,
    tiles: ['enemy', 'treasure', 'trap', 'puzzle', 'stairs', 'poison', 'pit'].map((type, x) => ({x, y: 3, type, rotation: 90}))});
  assert.match(old.e.status.textContent, /6 old card\/stair markers changed to floor/);
  assert.match(old.e.status.textContent, /1 old pit tile restored as decorative pits/);
  assert.deepEqual(old.saved().tiles, [
    ...Array.from({length: 6}, (_, x) => ({x, y: 3, type: 'floor', rotation: 90})),
    {x: 6, y: 3, type: 'floor', rotation: 90, variant: 'pit'}
  ]);
  assert.match(old.e.grid.children[3 * 16 + 6].innerHTML, /tile-floorPit/);
  scenarios++;

  const walls = app(); walls.size(24);
  assert.deepEqual(walls.wallShapes().map(button => button.dataset.wallShape), ['horizontal', 'vertical', 'ne', 'se', 'sw', 'nw']);
  const wallDirections = [
    ['horizontal', 'straight', 0], ['vertical', 'straight', 90],
    ['ne', 'corner', 0], ['se', 'corner', 90],
    ['sw', 'corner', 180], ['nw', 'corner', 270]
  ];
  const wallMaterials = [['wall', null], ['wallBrick', 'brick'], ['wallWood', 'timber']];
  const expectedWalls = [];
  for (const [material, variant] of wallMaterials) {
    walls.choose(material);
    for (const [direction, wallShape, rotation] of wallDirections) {
      const x = expectedWalls.length;
      walls.wall(direction); walls.paint(x, 5);
      expectedWalls.push({x, y: 5, type: 'wall', rotation, ...(variant ? {variant} : {}), wallShape});
      const artwork = walls.e.grid.children[5 * 24 + x].innerHTML;
      assert.ok(artwork.includes(`wall-${wallShape}`));
      assert.ok(artwork.includes(`rotate(${rotation}deg)`));
      assert.equal(walls.e.step.disabled, true);
      assert.equal(walls.wallShapes().filter(button => button.classList.contains('active')).length, 1);
      assert.equal(walls.wallShapes().find(button => button.dataset.wallShape === direction).attributes['aria-pressed'], 'true');
    }
  }
  assert.deepEqual(walls.saved().tiles, expectedWalls, 'All six shapes must work in all three materials');
  walls.choose('floorEarth');
  assert.equal(walls.wallShapes().filter(button => button.classList.contains('active')).length, 0);
  walls.wall('ne'); walls.paint(0, 7);
  assert.deepEqual(walls.saved().tiles.at(-1), {x: 0, y: 7, type: 'wall', rotation: 0, variant: 'timber', wallShape: 'corner'}, 'Shape choice keeps the last wall material');
  walls.click('rotate');
  assert.match(walls.e.status.textContent, /Right\/down corner/);
  assert.equal(walls.saved().tiles.at(-1).rotation, 90);
  walls.click('undo'); assert.equal(walls.saved().tiles.at(-1).rotation, 0);
  walls.click('redo'); assert.equal(walls.saved().tiles.at(-1).rotation, 90);
  const shapedMap = walls.saved();
  walls.click('new'); walls.click('load');
  assert.deepEqual(walls.saved(), shapedMap);
  walls.size(20); assert.deepEqual(walls.saved().tiles, shapedMap.tiles);
  walls.click('undo'); assert.equal(walls.e.tableSize.value, '24');
  walls.size(16); assert.equal(walls.e.tableSize.value, '24', 'Resizing must protect walls near the edge');
  const restoredWalls = app(); await restoredWalls.import(shapedMap);
  assert.deepEqual(restoredWalls.saved(), shapedMap, 'Wall shape, direction, and material must round-trip');
  restoredWalls.click('export');
  assert.deepEqual(JSON.parse(await restoredWalls.downloads.at(-1).blob.text()), shapedMap);
  scenarios++;

  const solid = app();
  const oldWalls = {format: 'wpdungeon', formatVersion: 1, width: 16, height: 16, tiles: [
    {x: 12, y: 4, type: 'wall', rotation: 90},
    {x: 13, y: 4, type: 'wall', rotation: 180, variant: 'brick'}
  ]};
  await solid.import(oldWalls);
  assert.deepEqual(solid.saved(), oldWalls, 'Existing solid walls must not be reoriented or reshaped');
  assert.doesNotMatch(solid.e.grid.children[4 * 16 + 12].innerHTML, /wall-straight|wall-corner/);
  scenarios++;

  const scenery = app();
  decorKeys.forEach((key, n) => {
    if (n === 0) { scenery.choose('wallBrick'); scenery.wall('ne'); }
    else scenery.choose(n === 1 ? 'floorWater' : n === 2 ? 'floorWood' : 'floorEarth');
    scenery.paint(n + 2, 4);
  });
  const bareTerrain = scenery.saved().tiles;
  const expectedDecor = [];
  decorKeys.forEach((key, n) => {
    scenery.choose(key); scenery.paint(n + 2, 4);
    assert.deepEqual(scenery.saved().tiles, bareTerrain, 'Decorations cannot replace floors or walls');
    assert.equal(Boolean(scenery.e.step.disabled), n === 0, 'Only existing wall terrain may block inspection');
    assert.equal(scenery.e.rotateDecor.hidden, false);
    assert.equal(scenery.e.removeDecor.hidden, false);
    for (let turn = 0; turn < n % 4; turn++) scenery.click('rotateDecor');
    expectedDecor.push({x: n + 2, y: 4, type: key, rotation: (n % 4) * 90});
    assert.deepEqual(scenery.saved().tiles, bareTerrain, 'Rotating scenery cannot reorient terrain');
    assert.match(scenery.e.grid.children[4 * 16 + n + 2].innerHTML, /class="decor-art"/);
  });
  assert.deepEqual(scenery.saved().decorations, expectedDecor);
  scenery.click('select'); scenery.paint(3, 4); scenery.click('step');
  assert.equal(scenery.e.marker.textContent, 'Water');
  assert.equal(scenery.e.propPreview.hidden, false);
  assert.equal(scenery.e.propPreview.attributes['aria-label'], 'Water fountain decoration');
  scenery.click('exitView'); scenery.choose('floor'); scenery.paint(1, 1); scenery.click('step');
  assert.equal(scenery.e.propPreview.hidden, true, 'Inspection must clear the previous scenery preview');
  scenery.click('exitView');
  const decoratedMap = scenery.saved();
  scenery.click('new'); assert.equal(scenery.saved().decorations, undefined);
  scenery.storage.set('wpdungeon-v1', JSON.stringify(decoratedMap)); scenery.click('load');
  assert.deepEqual(scenery.saved(), decoratedMap);
  scenery.click('export');
  assert.deepEqual(JSON.parse(await scenery.downloads.at(-1).blob.text()), decoratedMap);
  const restoredScenery = app(); await restoredScenery.import(decoratedMap);
  assert.deepEqual(restoredScenery.saved(), decoratedMap);
  scenery.click('select'); scenery.paint(4, 4); scenery.click('removeDecor');
  assert.deepEqual(scenery.saved().tiles, decoratedMap.tiles, 'Remove decoration keeps its underlying floor');
  assert.equal(scenery.saved().decorations.length, 9);
  assert.equal(scenery.e.removeDecor.hidden, true);
  scenery.click('undo'); assert.deepEqual(scenery.saved(), decoratedMap);
  scenery.click('redo'); assert.equal(scenery.saved().decorations.length, 9);
  scenery.click('undo'); scenery.click('select'); scenery.paint(5, 4); scenery.click('delete');
  assert.ok(!scenery.saved().tiles.some(t => t.x === 5 && t.y === 4));
  assert.ok(!scenery.saved().decorations.some(t => t.x === 5 && t.y === 4));
  scenery.click('undo'); assert.deepEqual(scenery.saved(), decoratedMap);
  await restoredScenery.import(legacy);
  assert.deepEqual(restoredScenery.saved(), legacy, 'Importing an old map clears scenery from the preceding map');
  const drawings = scenery.pieces().filter(piece => decorKeys.includes(piece.dataset.piece)).map(piece => ({
    name: piece.dataset.piece, svg: piece.innerHTML.match(/<svg[\s\S]*<\/svg>/)[0]
  }));
  assert.equal(drawings.length, 10);
  scenarios++;

  const floating = app(); floating.choose('bones'); floating.paint(15, 15);
  assert.equal(floating.saved().tiles.length, 0, 'Placing scenery on empty space cannot create terrain');
  assert.equal(floating.e.step.disabled, true);
  assert.equal(floating.e.rotate.disabled, true);
  assert.equal(floating.e.rotateDecor.disabled, false);
  assert.equal(floating.e.delete.disabled, false);
  const oneProp = floating.saved().decorations;
  floating.size(20); assert.deepEqual(floating.saved().decorations, oneProp);
  floating.size(24); assert.deepEqual(floating.saved().decorations, oneProp);
  floating.choose('fountain'); floating.paint(23, 23);
  const twoProps = floating.saved(); floating.size(16);
  assert.equal(floating.e.tableSize.value, '24');
  assert.deepEqual(floating.saved(), twoProps, 'Shrinking cannot drop scenery, including props on empty cells');
  floating.click('undo'); assert.deepEqual(floating.saved().decorations, oneProp);
  floating.size(16); assert.deepEqual(floating.saved().decorations, oneProp);
  floating.click('undo'); assert.equal(floating.e.tableSize.value, '24');
  floating.click('select'); floating.paint(15, 15); floating.click('delete');
  assert.equal(floating.saved().decorations, undefined);
  floating.click('undo'); assert.deepEqual(floating.saved().decorations, oneProp);
  const beforeBadProps = floating.saved();
  await floating.import({...beforeBadProps, decorations: {type: 'bones'}});
  assert.deepEqual(floating.saved(), beforeBadProps, 'Malformed scenery imports leave the current map intact');
  const invalidProps = [...beforeBadProps.decorations,
    {x: 0, y: 0, type: 'enemy', rotation: 0},
    {x: 1, y: 0, type: 'constructor', rotation: 0},
    {x: 999, y: 0, type: 'bones', rotation: 0}];
  await floating.import({...beforeBadProps, decorations: invalidProps});
  assert.deepEqual(floating.saved(), beforeBadProps, 'Only known visual scenery inside the table is imported');
  scenarios++;

  console.log(`PASS: ${scenarios} interaction scenarios covering table sizes, wall shapes, floor pits/water, ten visual props, terrain preservation, scenery rotation/removal, history, saves/imports/exports, and old maps.`);
  console.log('JavaScript syntax: passed. Browser rendering: not exercised.');
}
module.exports = {app};
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
