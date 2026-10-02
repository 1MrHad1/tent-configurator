import { CameraControls, ContactShadows, Environment, Lightformer, useGLTF } from '@react-three/drei';
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber';
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Box3,
  CanvasTexture,
  Color,
  Mesh,
  MeshStandardMaterial,
  NeutralToneMapping,
  PerspectiveCamera,
  SRGBColorSpace,
  Sphere,
  Vector2,
  Vector3,
  type Object3D,
} from 'three';
import { imageLookup } from '../../core/assets/images';
import { geometryFor, isSurfaceAvailable } from '../../core/design/factory';
import type { Design } from '../../core/design/schema';
import { atlasToFrame, clamp, pointInPolygon } from '../../core/geometry';
import type { CameraView, ProductDefinition } from '../../core/product/types';
import { composeAtlas, frameOf, surfaceFill } from '../../core/render/composeAtlas';
import { layerAtPoint } from '../../core/render/hitTest';
import { getConfigurator, useConfigurator } from '../../core/state/store';
import { useRenderTick } from '../hooks/useRenderTick';
import { useServices } from '../services';
import { useViewerControls } from './viewerControls';

const CAPTURE_BACKGROUND = '#f2f2ef';

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div className="viewer-fallback">3D preview unavailable. The 2D editor still works.</div> : this.props.children;
  }
}

/**
 * The 3D preview. One WebGL canvas for the app's lifetime: it is the thumbnail in 2D mode and
 * the main view in 3D mode (only its CSS box changes), so switching modes never re-uploads
 * models or textures. Frames render on demand only.
 */
export function Viewer3D({ compact }: { compact: boolean }) {
  const [supported] = useState(hasWebGL);
  if (!supported) return <div className="viewer-fallback">Your browser has WebGL turned off, so the 3D preview is unavailable.</div>;
  return (
    <ViewerBoundary>
      <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        camera={{ fov: FOV, near: 0.05, far: 100, position: [4, 3, 5] }}
        gl={{ antialias: true, toneMapping: NeutralToneMapping, powerPreference: 'high-performance' }}
        className={compact ? 'viewer-canvas is-compact' : 'viewer-canvas'}
      >
        <Suspense fallback={null}>
          <Scene compact={compact} />
        </Suspense>
      </Canvas>
    </ViewerBoundary>
  );
}

function Scene({ compact }: { compact: boolean }) {
  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const geometry = geometryFor(product, design);
  const { texture, flush } = useAtlasTexture(product, design, geometry.shadeMap);
  const [bounds, setBounds] = useState<Sphere | null>(null);
  const controls = useRef<CameraControls>(null);

  const frameKey = product.scene.partVisibility?.map((r) => design.options[r.option]).join('|') ?? '';

  return (
    <>
      <hemisphereLight args={['#ffffff', '#cfc9bf', 0.85]} />
      <directionalLight position={[4, 8, 5]} intensity={1.7} />
      <directionalLight position={[-5, 3, -4]} intensity={0.45} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={1.6} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.1} position={[-6, 2, 4]} rotation-y={Math.PI / 3} scale={[6, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[6, 2, -4]} rotation-y={-Math.PI / 3} scale={[6, 4, 1]} />
      </Environment>
      <ProductModel key={geometry.model} url={geometry.model} texture={texture} product={product} design={design} onBounds={setBounds} controls={controls} />
      {bounds && (
        <ContactShadows
          key={`${geometry.model}:${frameKey}`}
          position={[0, 0.002, 0]}
          scale={bounds.radius * 4}
          resolution={512}
          blur={2.6}
          opacity={0.42}
          far={bounds.radius * 1.5}
          frames={1}
        />
      )}
      <CameraControls
        ref={controls}
        makeDefault
        enabled={!compact}
        minPolarAngle={0.05}
        maxPolarAngle={Math.PI / 2 - 0.04}
        minDistance={bounds ? bounds.radius * 1.2 : 1}
        maxDistance={bounds ? bounds.radius * 8 : 40}
        dollyToCursor
      />
      {bounds && <CameraDirector bounds={bounds} controls={controls} compact={compact} />}
      {bounds && <PreviewCapture bounds={bounds} flush={flush} />}
    </>
  );
}

/** Keeps the shared canvas texture in sync with the design (coalesced to one compose per frame). */
function useAtlasTexture(product: ProductDefinition, design: Design, shadeUrl?: string) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const tick = useRenderTick();
  const uvGrid = useViewerControls((s) => s.uvGrid);
  const [loadedShade, setLoadedShade] = useState<{ url: string; img: HTMLImageElement } | null>(null);

  const state = useMemo(() => {
    const small = gl.capabilities.maxTextureSize < 4096 || matchMedia('(max-width: 768px)').matches;
    const size = small ? 1024 : 2048;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const texture = new CanvasTexture(canvas);
    texture.flipY = false; // glTF UV convention
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    return { canvas, ctx: canvas.getContext('2d')!, texture, size };
  }, [gl]);

  // The shade map belongs to one model; a stale one is ignored rather than cleared in an effect.
  const shade = shadeUrl && loadedShade?.url === shadeUrl ? loadedShade.img : null;
  useEffect(() => {
    if (!shadeUrl) return;
    let current = true;
    const img = new Image();
    img.src = shadeUrl;
    img.decode().then(
      () => current && setLoadedShade({ url: shadeUrl, img }),
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [shadeUrl]);

  // `flush` is also called imperatively (before capturing previews), so it reads the latest
  // inputs from a ref that is synced after each render.
  const latest = useRef({ product, design, shade, uvGrid });
  useLayoutEffect(() => {
    latest.current = { product, design, shade, uvGrid };
  });

  const flush = useMemo(
    () => () => {
      const { product: p, design: d, shade: s, uvGrid: grid } = latest.current;
      composeAtlas(state.ctx, p, d, imageLookup(d.assets), { size: state.size, bleed: 5, shade: s, background: p.defaultFill, debugGrid: grid });
      state.texture.needsUpdate = true;
      invalidate();
    },
    [state, invalidate],
  );

  // Recompose (at most once per frame) whenever an input of the texture changes. The inputs
  // are read through `latest`, so they are listed here only as triggers.
  useEffect(() => {
    const frame = requestAnimationFrame(flush);
    return () => cancelAnimationFrame(frame);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [flush, product, design, shade, tick, uvGrid]);

  useEffect(() => () => state.texture.dispose(), [state]);
  return { texture: state.texture, flush };
}

function mixHex(a: string, b: string, t: number) {
  return '#' + new Color(a).lerp(new Color(b), t).getHexString();
}

function ProductModel({
  url,
  texture,
  product,
  design,
  onBounds,
  controls,
}: {
  url: string;
  texture: CanvasTexture;
  product: ProductDefinition;
  design: Design;
  onBounds: (s: Sphere) => void;
  controls: React.RefObject<CameraControls | null>;
}) {
  const { scene } = useGLTF(url, false, true);
  const invalidate = useThree((s) => s.invalidate);
  const drag = useRef<{ layerId: string; surfaceId: string } | null>(null);

  // Wire materials by role (glTF extras), never by mesh or material name.
  useLayoutEffect(() => {
    scene.traverse((object) => {
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as MeshStandardMaterial;
      if (material.userData.role === 'print' && material.map !== texture) {
        material.map = texture;
        material.color.set('#ffffff');
        material.needsUpdate = true;
      }
    });
    onBounds(new Box3().setFromObject(scene).getBoundingSphere(new Sphere()));
    invalidate();
  }, [scene, texture, onBounds, invalidate]);

  // Declarative scene rules: part visibility and material colours driven by options.
  useLayoutEffect(() => {
    const surfaces = geometryFor(product, design).surfaces.filter((s) => isSurfaceAvailable(product, s.id, design.options));
    const inner = surfaces.length ? mixHex(surfaceFill(product, design, surfaces[0].id), '#000000', 0.12) : '#cccccc';
    scene.traverse((object: Object3D) => {
      for (const rule of product.scene.partVisibility ?? []) {
        if (object.userData.part === rule.part) object.visible = rule.visibleFor.includes(design.options[rule.option]);
      }
      const mesh = object as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as MeshStandardMaterial;
      if (material.userData.role === 'print-inner') material.color.set(inner);
      for (const rule of product.scene.materialColor ?? []) {
        if (material.userData.role !== rule.role) continue;
        const color = rule.colors[design.options[rule.option]];
        if (color) {
          material.color.set(color);
          material.map = null; // the baked metal colour would fight the finish colour
          if (rule.metalness !== undefined) material.metalness = rule.metalness;
          if (rule.roughness !== undefined) material.roughness = rule.roughness;
          material.needsUpdate = true;
        }
      }
    });
    invalidate();
  }, [scene, product, design, invalidate]);

  /** UV hit -> surface + point in its frame. */
  const resolveHit = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const material = (event.object as Mesh).material as MeshStandardMaterial | undefined;
    if (material?.userData.role !== 'print' || !event.uv) return null;
    const { design: d, product: p } = getConfigurator();
    const point: [number, number] = [event.uv.x * p.atlasSize, event.uv.y * p.atlasSize];
    const surface = geometryFor(p, d).surfaces.find((s) => pointInPolygon(point, s.polygon) && isSurfaceAvailable(p, s.id, d.options));
    if (!surface) return null;
    return { surface, framePoint: atlasToFrame(frameOf(surface), point), design: d };
  };

  return (
    <primitive
      object={scene}
      onPointerDown={(event: ThreeEvent<PointerEvent>) => {
        if (getConfigurator().mode !== '3d') return;
        const hit = resolveHit(event);
        if (!hit) return;
        const frame = frameOf(hit.surface);
        const layer = layerAtPoint(frame, hit.design.surfaces[hit.surface.id].layers, hit.design.assets, hit.framePoint);
        const store = getConfigurator();
        if (!layer) {
          store.selectSurface(hit.surface.id);
          return;
        }
        // Drag artwork directly on the model.
        event.stopPropagation();
        store.selectLayer(layer.id);
        store.checkpoint();
        drag.current = { layerId: layer.id, surfaceId: hit.surface.id };
        if (controls.current) controls.current.enabled = false;
        (event.target as Element | null)?.setPointerCapture?.(event.pointerId);
      }}
      onPointerMove={(event: ThreeEvent<PointerEvent>) => {
        if (!drag.current) return;
        const hit = resolveHit(event);
        if (!hit || hit.surface.id !== drag.current.surfaceId) return;
        const frame = frameOf(hit.surface);
        getConfigurator().updateLayer(
          drag.current.layerId,
          { x: clamp(hit.framePoint[0] / frame.width, -0.5, 0.5), y: clamp(hit.framePoint[1] / frame.height, -0.5, 0.5) },
          { history: false },
        );
      }}
      onPointerUp={(event: ThreeEvent<PointerEvent>) => {
        if (!drag.current) return;
        drag.current = null;
        if (controls.current) controls.current.enabled = true;
        (event.target as Element | null)?.releasePointerCapture?.(event.pointerId);
      }}
    />
  );
}

const FOV = 32;

/**
 * Camera placement for a view: the view's direction sets the angle; the distance is derived
 * from the bounding sphere and field of view so every product size fills the frame the same way.
 */
function viewPosition(view: CameraView, bounds: Sphere, elevate = 0, margin = 1.08): [number, number, number, number, number, number] {
  const c = bounds.center;
  const dir = new Vector3(view.direction[0], view.direction[1] + elevate, view.direction[2]).normalize();
  const distance = (bounds.radius / Math.sin(((FOV / 2) * Math.PI) / 180)) * margin;
  return [c.x + dir.x * distance, c.y + dir.y * distance, c.z + dir.z * distance, c.x, c.y, c.z];
}

/** Moves the camera for view buttons, and in thumbnail mode follows the panel being edited. */
function CameraDirector({ bounds, controls, compact }: { bounds: Sphere; controls: React.RefObject<CameraControls | null>; compact: boolean }) {
  const product = useConfigurator((s) => s.product);
  const selectedSurfaceId = useConfigurator((s) => s.selectedSurfaceId);
  const request = useViewerControls((s) => s.request);
  const design = useConfigurator((s) => s.design);
  const first = useRef(true);

  useEffect(() => {
    const view = product.views.find((v) => v.id === request.viewId) ?? product.views[0];
    void controls.current?.setLookAt(...viewPosition(view, bounds), !first.current);
    first.current = false;
  }, [request, bounds, product, controls]);

  useEffect(() => {
    if (!compact) return;
    const surface = geometryFor(product, design).surfaces.find((s) => s.id === selectedSurfaceId);
    const view = product.views.find((v) => v.id === surface?.side) ?? product.views[0];
    void controls.current?.setLookAt(...viewPosition(view, bounds, surface?.group === 'roof' ? 1.4 : 0.25, 0.95), true);
    // Only re-aim when the panel changes, not on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, selectedSurfaceId, bounds, product, controls]);

  return null;
}

/** Off-screen renders for the PDF and cart preview, independent of the on-screen canvas size. */
function PreviewCapture({ bounds, flush }: { bounds: Sphere; flush: () => void }) {
  const { previews } = useServices();
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const product = useConfigurator((s) => s.product);

  useEffect(() => {
    previews.current = {
      async capture(viewIds) {
        flush();
        const width = 1200;
        const height = 800;
        const previousRatio = gl.getPixelRatio();
        const previousSize = gl.getSize(new Vector2());
        const previousBackground = scene.background;
        gl.setPixelRatio(1);
        gl.setSize(width, height, false);
        scene.background = new Color(CAPTURE_BACKGROUND);
        const camera = new PerspectiveCamera(FOV, width / height, 0.05, 100);
        const shots = viewIds.map((id) => {
          const view = product.views.find((v) => v.id === id) ?? product.views[0];
          const [px, py, pz, tx, ty, tz] = viewPosition(view, bounds, view.id === 'top' ? 0 : 0.1, 0.92);
          camera.position.set(px, py, pz);
          camera.lookAt(new Vector3(tx, ty, tz));
          camera.updateProjectionMatrix();
          gl.render(scene, camera);
          return { id: view.id, label: view.label, dataUrl: gl.domElement.toDataURL('image/jpeg', 0.9) };
        });
        gl.setPixelRatio(previousRatio);
        gl.setSize(previousSize.x, previousSize.y, false);
        scene.background = previousBackground;
        invalidate();
        return shots;
      },
    };
    return () => {
      previews.current = null;
    };
  }, [previews, gl, scene, invalidate, product, bounds, flush]);

  return null;
}
