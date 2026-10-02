import type Konva from 'konva';
import { useEffect, useMemo, useRef, type DragEvent } from 'react';
import { Group, Layer as KonvaLayer, Line, Rect, Shape, Stage, Text, Transformer } from 'react-konva';
import { createAsset } from '../../core/assets/upload';
import { imageLookup } from '../../core/assets/images';
import { geometryFor, isSurfaceAvailable } from '../../core/design/factory';
import type { Asset, Layer } from '../../core/design/schema';
import { clamp, pointInPolygon, type SurfaceFrame } from '../../core/geometry';
import type { SurfaceDef } from '../../core/product/types';
import { frameOf, surfaceFill } from '../../core/render/composeAtlas';
import { drawLayerContent, layerBox, type ImageLookup } from '../../core/render/drawLayer';
import { getConfigurator, useConfigurator } from '../../core/state/store';
import { useElementSize } from '../hooks/useElementSize';
import { useRenderTick } from '../hooks/useRenderTick';
import { useEditorView } from './editorView';

const ACCENT = '#2f6bff';
const flat = (points: [number, number][]) => points.flat();

/**
 * 2D editor. Panels are laid out as in the texture atlas (the flat "die-line" the customer
 * expects), but each panel is drawn in its physical frame with a uniform scale, so artwork
 * keeps its true proportions. Layers are Konva custom shapes whose sceneFunc calls the same
 * `drawLayerContent` the 3D texture uses: what you see here is what gets printed.
 */
export function Editor2D({ onUploadError }: { onUploadError: (message: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const size = useElementSize(containerRef);
  const tick = useRenderTick();

  const product = useConfigurator((s) => s.product);
  const design = useConfigurator((s) => s.design);
  const selectedSurfaceId = useConfigurator((s) => s.selectedSurfaceId);
  const selectedLayerId = useConfigurator((s) => s.selectedLayerId);
  const { selectSurface, selectLayer, addImage } = getConfigurator();
  const { zoom, pan, setPan, zoomAt } = useEditorView();

  const surfaces = geometryFor(product, design).surfaces;
  const images = useMemo(() => imageLookup(design.assets), [design.assets]);

  // Fit the atlas region that holds panels into the stage, then apply zoom/pan on top.
  const bounds = useMemo(() => {
    const pts = surfaces.flatMap((s) => s.polygon);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const pad = 22;
    return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + pad * 2, h: Math.max(...ys) - Math.min(...ys) + pad * 2 };
  }, [surfaces]);
  const margin = size.width < 640 ? 16 : 48;
  const fitScale = Math.max(0.05, Math.min((size.width - margin * 2) / bounds.w, (size.height - margin * 2) / bounds.h));
  const scale = fitScale * zoom;
  const stageX = size.width / 2 - (bounds.x + bounds.w / 2) * scale + pan[0];
  const stageY = size.height / 2 - (bounds.y + bounds.h / 2) * scale + pan[1];

  // Re-attach the transformer after any redraw that can replace or move the selected node.
  useEffect(() => {
    const transformer = transformerRef.current;
    const node = selectedLayerId ? stageRef.current?.findOne(`#${selectedLayerId}`) : undefined;
    transformer?.nodes(node ? [node] : []);
    transformer?.getLayer()?.batchDraw();
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [selectedLayerId, design, tick, size.width, size.height]);

  const atlasPointFromClient = (clientX: number, clientY: number): [number, number] | null => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return [(clientX - rect.left - stageX) / scale, (clientY - rect.top - stageY) / scale];
  };

  const onDrop = async (event: DragEvent) => {
    event.preventDefault();
    const point = atlasPointFromClient(event.clientX, event.clientY);
    const target = point ? surfaces.find((s) => pointInPolygon(point, s.polygon) && isSurfaceAvailable(product, s.id, design.options)) : undefined;
    for (const file of Array.from(event.dataTransfer.files)) {
      try {
        addImage(await createAsset(file, product), target?.id);
      } catch (error) {
        onUploadError((error as Error).message);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className="editor"
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      aria-label="2D design editor"
    >
      {size.width > 0 && (
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          x={stageX}
          y={stageY}
          scaleX={scale}
          scaleY={scale}
          draggable
          onDragEnd={(e) => {
            if (e.target === e.target.getStage()) setPan([pan[0] + e.target.x() - stageX, pan[1] + e.target.y() - stageY]);
          }}
          onWheel={(e) => {
            e.evt.preventDefault();
            const pointer = e.target.getStage()?.getPointerPosition();
            if (pointer) zoomAt(e.evt.deltaY < 0 ? 1.12 : 1 / 1.12, [pointer.x - size.width / 2, pointer.y - size.height / 2]);
          }}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === 'board') selectLayer(null);
          }}
          onTouchStart={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === 'board') selectLayer(null);
          }}
        >
          <KonvaLayer>
            <Rect name="board" x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h} fill="#ececef" cornerRadius={14} shadowColor="#000" shadowOpacity={0.08} shadowBlur={24} shadowOffsetY={6} />
            {surfaces.map((surface) => (
              <SurfaceNode
                key={surface.id}
                surface={surface}
                frame={frameOf(surface)}
                fill={surfaceFill(product, design, surface.id)}
                available={isSurfaceAvailable(product, surface.id, design.options)}
                layers={design.surfaces[surface.id]?.layers ?? []}
                assets={design.assets}
                images={images}
                label={product.surfaceLabels[surface.id] ?? surface.id}
                selected={surface.id === selectedSurfaceId}
                onSelect={() => selectSurface(surface.id)}
                tick={tick}
              />
            ))}
          </KonvaLayer>
          <KonvaLayer>
            <Transformer
              ref={transformerRef}
              rotateEnabled
              keepRatio
              flipEnabled={false}
              enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']}
              rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
              rotationSnapTolerance={4}
              borderStroke={ACCENT}
              anchorStroke={ACCENT}
              anchorFill="#ffffff"
              anchorSize={size.width < 640 ? 14 : 9}
              anchorCornerRadius={3}
              padding={3}
              ignoreStroke
              boundBoxFunc={(oldBox, newBox) => (Math.abs(newBox.width) < 6 || Math.abs(newBox.height) < 6 ? oldBox : newBox)}
            />
          </KonvaLayer>
        </Stage>
      )}
    </div>
  );
}

interface SurfaceNodeProps {
  surface: SurfaceDef;
  frame: SurfaceFrame;
  fill: string;
  available: boolean;
  layers: Layer[];
  assets: Record<string, Asset>;
  images: ImageLookup;
  label: string;
  selected: boolean;
  onSelect: () => void;
  tick: number;
}

function SurfaceNode({ frame, fill, available, layers, assets, images, label, selected, onSelect, tick }: SurfaceNodeProps) {
  const outline = flat(frame.localPolygon);
  const labelSize = Math.min(frame.height * 0.16, frame.width * 0.055);
  return (
    <Group x={frame.center[0]} y={frame.center[1]} rotation={frame.rotation} scaleX={frame.editorScale} scaleY={frame.editorScale}>
      <Line
        points={outline}
        closed
        fill={fill}
        opacity={available ? 1 : 0.5}
        stroke={selected ? ACCENT : '#8f9298'}
        strokeWidth={selected ? 2 : 1}
        strokeScaleEnabled={false}
        dash={selected ? undefined : [5, 4]}
        dashEnabled={!selected}
        onMouseDown={onSelect}
        onTap={onSelect}
      />
      {(layers.length === 0 || !available) && (
        <Text
          text={available ? label : `${label} · not printed`}
          x={-frame.width / 2}
          y={(frame.surface.group === 'roof' ? frame.height * 0.12 : 0) - labelSize / 2}
          width={frame.width}
          align="center"
          fontSize={labelSize}
          fontFamily="Inter"
          fontStyle="600"
          fill="#000"
          opacity={0.28}
          listening={false}
        />
      )}
      {available && (
        <Group
          clipFunc={(ctx) => {
            ctx.beginPath();
            frame.localPolygon.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            ctx.closePath();
          }}
        >
          {layers.map((layer) => (
            <LayerShape key={layer.id} layer={layer} frame={frame} assets={assets} images={images} tick={tick} />
          ))}
        </Group>
      )}
    </Group>
  );
}

function LayerShape({ layer, frame, assets, images }: { layer: Layer; frame: SurfaceFrame; assets: Record<string, Asset>; images: ImageLookup; tick: number }) {
  const box = layerBox(layer, frame, assets);
  const { selectLayer, checkpoint, updateLayer } = getConfigurator();

  const readPosition = (node: Konva.Node) => {
    const x = clamp(node.x() / frame.width, -0.5, 0.5);
    const y = clamp(node.y() / frame.height, -0.5, 0.5);
    node.position({ x: x * frame.width, y: y * frame.height });
    return { x, y };
  };

  return (
    <Shape
      id={layer.id}
      x={layer.x * frame.width}
      y={layer.y * frame.height}
      rotation={layer.rotation}
      width={box.width}
      height={box.height}
      offsetX={box.width / 2}
      offsetY={box.height / 2}
      fill="#000"
      draggable
      sceneFunc={(ctx) => {
        const native = ctx._context;
        native.save();
        native.translate(box.width / 2, box.height / 2);
        drawLayerContent(native, layer, frame, assets, images);
        native.restore();
      }}
      hitFunc={(ctx, shape) => {
        ctx.beginPath();
        ctx.rect(0, 0, box.width, box.height);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      }}
      onMouseDown={() => selectLayer(layer.id)}
      onTap={() => selectLayer(layer.id)}
      onDragStart={() => {
        selectLayer(layer.id);
        checkpoint();
      }}
      onDragMove={(e) => updateLayer(layer.id, readPosition(e.target), { history: false })}
      onTransformStart={() => checkpoint()}
      onTransform={(e) => {
        const node = e.target;
        const s = node.scaleX();
        node.scale({ x: 1, y: 1 });
        const sizePatch = layer.type === 'text' ? { fontSize: clamp(layer.fontSize * s, 0.005, 2) } : { width: clamp(layer.width * s, 0.01, 4) };
        updateLayer(layer.id, { ...sizePatch, rotation: Math.round(node.rotation() * 10) / 10, ...readPosition(node) }, { history: false });
      }}
    />
  );
}
