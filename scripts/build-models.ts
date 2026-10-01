/**
 * Model pipeline: turns the supplied tent GLBs into web-ready assets plus product data.
 *
 *   assets-src/models/tent-<size>.glb  ->  public/models/tent-<size>.glb        (meshopt + WebP)
 *                                      ->  public/models/tent-<size>-shade.webp  (baked fabric shading)
 *                                      ->  src/products/canopy-tent/generated/surfaces.json
 *
 * The printable panels are not hand-traced. Each UV island of the print material is found
 * automatically and classified from its 3D normal (roof vs valance, front/back/left/right),
 * which also gives the rotation that makes artwork read upright on the tent and the
 * panel's physical size for the production PDF.
 *
 * Run with `npm run build:models` (Node 24 runs this TypeScript file directly).
 */
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { NodeIO, type Document, type Primitive } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

/** Atlas units: panel geometry is stored in a 1000×1000 space, independent of texture size. */
const ATLAS = 1000;
const M_TO_IN = 39.3701;

interface ModelSource {
  variant: string;
  file: string;
  /**
   * Footprint correction. The supplied 6.5×6.5 model has the same 1.53 m footprint as the
   * 5×5 (the 5×5 and 8×8 are true to size in feet), so it is widened on X/Z only.
   */
  footprintScale: number;
}

const FT = 0.3048;
const SOURCES: ModelSource[] = [
  { variant: '5x5', file: 'tent-5x5.glb', footprintScale: 1 },
  { variant: '6.5x6.5', file: 'tent-6.5x6.5.glb', footprintScale: (6.5 * FT) / 1.53 },
  { variant: '8x8', file: 'tent-8x8.glb', footprintScale: 1 },
];

/** Material name in the source file -> role the runtime looks for (via glTF extras). */
const MATERIAL_ROLES: Record<string, string> = {
  fabric_Mat: 'print',
  Inner_fabric: 'print-inner',
  Metal_mat: 'frame',
};

type Vec3 = [number, number, number];
type Vec2 = [number, number];

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...new Map(points.map((p) => [`${p[0].toFixed(4)},${p[1].toFixed(4)}`, p])).values()].sort(
    (a, b) => a[0] - b[0] || a[1] - b[1],
  );
  if (pts.length < 3) return pts;
  const c = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Vec2[] = [];
  const upper: Vec2[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && c(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && c(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Drops hull points that sit (almost) on the line between their neighbours. */
function simplify(poly: Vec2[], tolerance: number): Vec2[] {
  const out = [...poly];
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (area / (Math.hypot(c[0] - a[0], c[1] - a[1]) || 1) < tolerance) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

interface Surface {
  id: string;
  group: 'roof' | 'valance';
  side: 'front' | 'right' | 'back' | 'left';
  polygon: Vec2[];
  /** Degrees (canvas convention, clockwise) that make artwork read upright on the tent. */
  uprightRotation: number;
  /** Printed size of the panel's bounding box in its upright frame. */
  physical: { widthIn: number; heightIn: number };
}

function extractSurfaces(prim: Primitive, footprintScale: number): Surface[] {
  const pos = prim.getAttribute('POSITION')!.getArray()!;
  const uv = prim.getAttribute('TEXCOORD_0')!.getArray()!;
  const idx = prim.getIndices()!.getArray()!;
  const vCount = pos.length / 3;
  const P = (i: number): Vec3 => [pos[i * 3] * footprintScale, pos[i * 3 + 1], pos[i * 3 + 2] * footprintScale];
  const T = (i: number): Vec2 => [uv[i * 2], uv[i * 2 + 1]];

  // Union-find: vertices sharing a triangle or a UV coordinate belong to the same island.
  const parent = Int32Array.from({ length: vCount }, (_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  const seen = new Map<string, number>();
  for (let v = 0; v < vCount; v++) {
    const key = `${uv[v * 2].toFixed(5)},${uv[v * 2 + 1].toFixed(5)}`;
    const other = seen.get(key);
    if (other === undefined) seen.set(key, v);
    else union(v, other);
  }
  for (let t = 0; t < idx.length; t += 3) {
    union(idx[t], idx[t + 1]);
    union(idx[t + 2], idx[t + 1]);
  }
  const islands = new Map<number, number[]>();
  for (let t = 0; t < idx.length; t += 3) {
    const root = find(idx[t]);
    if (!islands.has(root)) islands.set(root, []);
    islands.get(root)!.push(t);
  }

  const surfaces: Surface[] = [];
  for (const tris of islands.values()) {
    let N: Vec3 = [0, 0, 0];
    let dPdu: Vec3 = [0, 0, 0];
    let dPdv: Vec3 = [0, 0, 0];
    const verts = new Set<number>();
    for (const t of tris) {
      const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
      verts.add(a).add(b).add(c);
      const e1 = sub(P(b), P(a));
      const e2 = sub(P(c), P(a));
      const [du1, dv1] = [T(b)[0] - T(a)[0], T(b)[1] - T(a)[1]];
      const [du2, dv2] = [T(c)[0] - T(a)[0], T(c)[1] - T(a)[1]];
      const det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) < 1e-12) continue;
      // Area-weighted tangent frame (how +u and +v run across the 3D surface).
      const s = Math.sign(det);
      dPdu = [0, 1, 2].map((k) => dPdu[k] + (e1[k] * dv2 - e2[k] * dv1) * s) as Vec3;
      dPdv = [0, 1, 2].map((k) => dPdv[k] + (e2[k] * du1 - e1[k] * du2) * s) as Vec3;
      N = [0, 1, 2].map((k) => N[k] + cross(e1, e2)[k]) as Vec3;
    }
    N = norm(N);
    dPdu = norm(dPdu);
    dPdv = norm(dPdv);

    const group = Math.abs(N[1]) > 0.3 ? 'roof' : 'valance';
    const side =
      Math.abs(N[2]) >= Math.abs(N[0]) ? (N[2] > 0 ? 'front' : 'back') : N[0] > 0 ? 'right' : 'left';

    // Upright frame as seen by someone standing outside that side of the tent.
    const worldUp: Vec3 = [0, 1, 0];
    const up = norm(sub(worldUp, scale(N, dot(worldUp, N))));
    const right = cross(scale(N, -1), up);
    const angle = (Math.atan2(dot(right, dPdv), dot(right, dPdu)) * 180) / Math.PI;
    const snapped = (((Math.round(angle / 90) * 90) % 360) + 360) % 360;
    const uprightRotation = snapped > 180 ? snapped - 360 : snapped;
    // u right / v down on a front-facing surface gives cross(dPdu, dPdv) opposite to N.
    if (dot(cross(dPdu, dPdv), N) > 0) {
      throw new Error(`Mirrored UV island on ${group}-${side}: artwork would print reversed`);
    }

    let [minR, maxR, minU, maxU] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const v of verts) {
      const r = dot(P(v), right);
      const u = dot(P(v), up);
      [minR, maxR, minU, maxU] = [Math.min(minR, r), Math.max(maxR, r), Math.min(minU, u), Math.max(maxU, u)];
    }

    const hull = simplify(convexHull([...verts].map(T)), 0.004);
    surfaces.push({
      id: `${group}-${side}`,
      group,
      side,
      polygon: hull.map(([x, y]) => [Math.round(x * ATLAS * 10) / 10, Math.round(y * ATLAS * 10) / 10]),
      uprightRotation,
      physical: {
        widthIn: Math.round((maxR - minR) * M_TO_IN * 10) / 10,
        heightIn: Math.round((maxU - minU) * M_TO_IN * 10) / 10,
      },
    });
  }

  const order = ['front', 'right', 'back', 'left'];
  surfaces.sort((a, b) => a.group.localeCompare(b.group) * -1 || order.indexOf(a.side) - order.indexOf(b.side));
  if (surfaces.length !== 8 || new Set(surfaces.map((s) => s.id)).size !== 8) {
    throw new Error(`Expected 8 distinct panels, got ${surfaces.map((s) => s.id).join(', ')}`);
  }
  return surfaces;
}

/**
 * The supplied base-colour texture is a flat yellow with seams and folds baked in. That
 * shading is kept as a greyscale multiply map so printed artwork still sits "in" the fabric.
 */
async function writeShadeMap(doc: Document, out: string) {
  const fabric = doc.getRoot().listMaterials().find((m) => MATERIAL_ROLES[m.getName()] === 'print');
  const image = fabric?.getBaseColorTexture()?.getImage();
  if (!image) throw new Error('Print material has no base-colour texture to derive shading from');
  const grey = sharp(Buffer.from(image)).greyscale().resize(1024, 1024);
  const { data } = await grey.clone().raw().toBuffer({ resolveWithObject: true });
  const sorted = Uint8Array.from(data).sort();
  const reference = sorted[Math.floor(sorted.length * 0.6)] || 255; // typical (un-creased) fabric
  await grey
    .linear(255 / reference, 0)
    .webp({ quality: 82 })
    .toFile(out);
}

async function main() {
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

  await mkdir('public/models', { recursive: true });
  const generated: Record<string, unknown> = {};

  for (const src of SOURCES) {
    const input = `assets-src/models/${src.file}`;
    const doc = await io.read(input);
    const root = doc.getRoot();

    const printPrim = root
      .listMeshes()
      .flatMap((m) => m.listPrimitives())
      .find((p) => MATERIAL_ROLES[p.getMaterial()?.getName() ?? ''] === 'print');
    if (!printPrim) throw new Error(`${src.file}: no print material`);
    const surfaces = extractSurfaces(printPrim, src.footprintScale);

    const shade = `public/models/tent-${src.variant}-shade.webp`;
    await writeShadeMap(doc, shade);

    for (const mat of root.listMaterials()) {
      const role = MATERIAL_ROLES[mat.getName()];
      if (!role) continue;
      mat.setExtras({ role });
      // The runtime supplies the printed texture, so the placeholder colour map is dropped.
      if (role === 'print') mat.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]);
    }
    for (const prim of root.listMeshes().flatMap((m) => m.listPrimitives())) {
      // COLOR_0..2 are constant white / unused channels: dead weight on the GPU.
      for (const semantic of prim.listSemantics()) {
        if (semantic.startsWith('COLOR_')) prim.setAttribute(semantic, null);
      }
    }
    for (const node of root.listNodes()) {
      if (node.getMesh()) {
        const roles = node.getMesh()!.listPrimitives().map((p) => MATERIAL_ROLES[p.getMaterial()?.getName() ?? '']);
        node.setExtras({ part: roles.includes('print') ? 'canopy' : 'frame' });
      } else if (src.footprintScale !== 1) {
        const [x, y, z] = node.getScale();
        node.setScale([x * src.footprintScale, y, z * src.footprintScale]);
      }
    }

    await doc.transform(
      prune(),
      dedup(),
      weld(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );

    const output = `public/models/tent-${src.variant}.glb`;
    await io.write(output, doc);
    const [before, after, shadeSize] = await Promise.all([stat(input), stat(output), stat(shade)]);
    console.log(
      `${src.variant.padEnd(8)} ${(before.size / 1e6).toFixed(1)} MB -> ${(after.size / 1e3).toFixed(0)} KB` +
        ` (+ ${(shadeSize.size / 1e3).toFixed(0)} KB shade map)`,
    );

    generated[src.variant] = {
      model: `/models/tent-${src.variant}.glb`,
      shadeMap: `/models/tent-${src.variant}-shade.webp`,
      surfaces,
    };
  }

  await writeFile(
    'src/products/canopy-tent/generated/surfaces.json',
    JSON.stringify({ atlasSize: ATLAS, variants: generated }, null, 2) + '\n',
  );
  console.log('wrote src/products/canopy-tent/generated/surfaces.json');
}

await main();
