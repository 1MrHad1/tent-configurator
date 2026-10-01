/**
 * Second product, built to prove the engine is product-agnostic: a step-and-repeat backdrop
 * banner. Its GLB is generated here (no 3D files), using the same contract as the tent:
 * `extras.role = print | frame` on materials, `extras.part` on nodes, and a generated
 * surfaces file describing the printable UV regions.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { Document, NodeIO, type Material } from '@gltf-transform/core';

const FT = 0.3048;
const M_TO_IN = 39.3701;
const ATLAS = 1000;
const BOTTOM = 0.14;

const SIZES = [
  { variant: '8x8', width: 8 * FT, height: 8 * FT },
  { variant: '10x8', width: 10 * FT, height: 8 * FT },
];

type V3 = [number, number, number];

function addQuads(doc: Document, name: string, quads: { p: V3[]; n: V3; uv: [number, number][] }[], material: Material) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const q of quads) {
    const base = positions.length / 3;
    q.p.forEach((p, i) => {
      positions.push(...p);
      normals.push(...q.n);
      uvs.push(...q.uv[i]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const buffer = doc.getRoot().listBuffers()[0];
  const acc = (type: 'VEC3' | 'VEC2' | 'SCALAR', array: Float32Array<ArrayBuffer> | Uint16Array<ArrayBuffer>) =>
    doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', acc('VEC3', new Float32Array(positions)))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array(normals)))
    .setAttribute('TEXCOORD_0', acc('VEC2', new Float32Array(uvs)))
    .setIndices(acc('SCALAR', new Uint16Array(indices)))
    .setMaterial(material);
  return doc.createMesh(name).addPrimitive(prim);
}

/** Axis-aligned box as 6 quads (counter-clockwise seen from outside). */
function boxQuads(min: V3, max: V3) {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  const uv: [number, number][] = [
    [0, 1],
    [1, 1],
    [1, 0],
    [0, 0],
  ];
  return [
    { n: [0, 0, 1] as V3, p: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] as V3[], uv },
    { n: [0, 0, -1] as V3, p: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] as V3[], uv },
    { n: [1, 0, 0] as V3, p: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] as V3[], uv },
    { n: [-1, 0, 0] as V3, p: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] as V3[], uv },
    { n: [0, 1, 0] as V3, p: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] as V3[], uv },
    { n: [0, -1, 0] as V3, p: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] as V3[], uv },
  ];
}

async function main() {
  await mkdir('public/models', { recursive: true });
  await mkdir('src/products/backdrop-banner/generated', { recursive: true });
  const io = new NodeIO();
  const variants: Record<string, unknown> = {};

  for (const { variant, width: W, height: H } of SIZES) {
    const doc = new Document();
    doc.createBuffer();
    const scene = doc.createScene('banner');
    const print = doc.createMaterial('print').setExtras({ role: 'print' }).setRoughnessFactor(0.85).setMetallicFactor(0);
    const frame = doc.createMaterial('frame').setExtras({ role: 'frame' }).setMetallicFactor(0.8).setRoughnessFactor(0.4);

    // Each face gets its own atlas region with the banner's aspect ratio.
    const regionW = 470;
    const regionH = (regionW * H) / W;
    const regions = { front: [20, 20], back: [510, 20] } as const;
    const uvOf = (side: 'front' | 'back', fx: number, fy: number): [number, number] => [
      (regions[side][0] + fx * regionW) / ATLAS,
      (regions[side][1] + fy * regionH) / ATLAS,
    ];
    const [l, r, b, t, z] = [-W / 2, W / 2, BOTTOM, BOTTOM + H, 0.006];
    const banner = addQuads(
      doc,
      'banner',
      [
        // Front: u runs left->right, v top->bottom as seen from +z.
        { n: [0, 0, 1], p: [[l, b, z], [r, b, z], [r, t, z], [l, t, z]], uv: [uvOf('front', 0, 1), uvOf('front', 1, 1), uvOf('front', 1, 0), uvOf('front', 0, 0)] },
        // Back: seen from -z, so u runs from +x to -x to keep artwork readable.
        { n: [0, 0, -1], p: [[r, b, -z], [l, b, -z], [l, t, -z], [r, t, -z]], uv: [uvOf('back', 0, 1), uvOf('back', 1, 1), uvOf('back', 1, 0), uvOf('back', 0, 0)] },
      ],
      print,
    );

    const pole = 0.018;
    const frameQuads = [
      ...boxQuads([l - 2 * pole, 0, -pole], [l, t + 0.05, pole]),
      ...boxQuads([r, 0, -pole], [r + 2 * pole, t + 0.05, pole]),
      ...boxQuads([l - 2 * pole, t + 0.05, -pole], [r + 2 * pole, t + 0.05 + 2 * pole, pole]),
      ...boxQuads([l - 2 * pole - 0.04, 0, -0.32], [l + 0.04, 0.03, 0.32]),
      ...boxQuads([r - 0.04, 0, -0.32], [r + 2 * pole + 0.04, 0.03, 0.32]),
    ];
    const frameMesh = addQuads(doc, 'frame', frameQuads, frame);

    const root = doc.createNode(`BANNER_${variant}`);
    root.addChild(doc.createNode('banner').setMesh(banner).setExtras({ part: 'canopy' }));
    root.addChild(doc.createNode('frame').setMesh(frameMesh).setExtras({ part: 'frame' }));
    scene.addChild(root);
    await io.write(`public/models/banner-${variant}.glb`, doc);

    const rect = (x: number, y: number) => [
      [x, y],
      [x + regionW, y],
      [x + regionW, y + regionH],
      [x, y + regionH],
    ];
    const physical = { widthIn: Math.round(W * M_TO_IN * 10) / 10, heightIn: Math.round(H * M_TO_IN * 10) / 10 };
    variants[variant] = {
      model: `/models/banner-${variant}.glb`,
      surfaces: [
        { id: 'face-front', group: 'face', side: 'front', polygon: rect(...regions.front), uprightRotation: 0, physical },
        { id: 'face-back', group: 'face', side: 'back', polygon: rect(...regions.back), uprightRotation: 0, physical },
      ],
    };
    console.log(`banner ${variant}: public/models/banner-${variant}.glb`);
  }

  await writeFile(
    'src/products/backdrop-banner/generated/surfaces.json',
    JSON.stringify({ atlasSize: ATLAS, variants }, null, 2) + '\n',
  );
}

await main();
