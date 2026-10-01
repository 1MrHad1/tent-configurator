/**
 * A ProductDefinition is everything the configurator engine needs to know about one product.
 * The engine (2D editor, 3D viewer, compositor, PDF, pricing client, cart hand-off) only ever
 * reads this contract, so a new product is a new definition + model, not new engine code.
 */

export type Vec2 = [number, number];

/** One printable region of the product, in atlas units (see `atlasSize`). */
export interface SurfaceDef {
  id: string;
  group: string;
  side: string;
  /** Convex outline of the UV island, in atlas units (origin top-left, y down). */
  polygon: Vec2[];
  /** Rotation (deg, clockwise) that makes artwork read upright on the physical product. */
  uprightRotation: number;
  /** Printed size of the panel in its upright frame. */
  physical: { widthIn: number; heightIn: number };
}

/** Geometry that changes with the selected variant (each size is its own model and UV layout). */
export interface VariantGeometry {
  model: string;
  /** Optional greyscale map multiplied over the print in 3D only (baked folds and seams). */
  shadeMap?: string;
  surfaces: SurfaceDef[];
}

export interface OptionChoice {
  id: string;
  label: string;
  description?: string;
}

export interface OptionDef {
  id: string;
  label: string;
  choices: OptionChoice[];
  defaultChoice: string;
  /** Hide the option unless another option has one of these values. */
  visibleWhen?: { option: string; oneOf: string[] };
}

export interface Swatch {
  name: string;
  hex: string;
}

export interface FontDef {
  family: string;
  /** Weights the font is loaded in; the text panel only offers these. */
  weights: number[];
}

export interface CameraView {
  id: string;
  label: string;
  /** Camera position as a multiple of the model's bounding radius, relative to its centre. */
  direction: [number, number, number];
}

/** Declarative links between options and the 3D scene, applied generically by the viewer. */
export interface SceneRules {
  /** Show nodes tagged `extras.part === part` only for these option values. */
  partVisibility?: { part: string; option: string; visibleFor: string[] }[];
  /** Colour materials tagged `extras.role === role` from an option. */
  materialColor?: { role: string; option: string; colors: Record<string, string>; metalness?: number; roughness?: number }[];
}

export interface ProductDefinition {
  id: string;
  name: string;
  tagline: string;
  /** Size of the square coordinate space the surfaces are described in. */
  atlasSize: number;
  /** The option whose value picks the geometry (model + surfaces). */
  geometryOption: string;
  geometry: Record<string, VariantGeometry>;
  surfaceGroups: { id: string; label: string }[];
  surfaceLabels: Record<string, string>;
  options: OptionDef[];
  palette: Swatch[];
  defaultFill: string;
  fonts: FontDef[];
  views: CameraView[];
  scene: SceneRules;
  /** Surfaces that only exist for some option values (e.g. the back face of a single-sided banner). */
  surfaceAvailability?: { surface: string; option: string; availableFor: string[] }[];
  /** Colour shown on surfaces that are not printed with the current options. */
  unprintedFill?: string;
  limits: {
    maxUploadBytes: number;
    acceptedTypes: string[];
    /** Uploaded raster images are downscaled to this many pixels on the long edge. */
    maxImageEdge: number;
    maxLayersPerSurface: number;
  };
}
