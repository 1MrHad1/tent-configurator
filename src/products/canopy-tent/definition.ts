import { loadGeneratedGeometry } from '../../core/product/generated';
import type { ProductDefinition } from '../../core/product/types';
import generatedJson from './generated/surfaces.json';

const generated = loadGeneratedGeometry(generatedJson);

/**
 * The canopy tent, as data. Panel outlines, upright rotations and physical sizes come from
 * `generated/surfaces.json`, which `npm run build:models` extracts from the supplied GLBs.
 * Prices are deliberately absent: they come from the pricing API.
 */
export const canopyTent: ProductDefinition = {
  id: 'canopy-tent',
  name: 'Logo Canopy Tent',
  tagline: 'Dye-sublimation printed canopy, 600D polyester, hex aluminium frame',
  atlasSize: generated.atlasSize,
  geometryOption: 'size',
  geometry: generated.variants,
  surfaceGroups: [
    { id: 'roof', label: 'Roof panels' },
    { id: 'valance', label: 'Valances' },
  ],
  surfaceLabels: {
    'roof-front': 'Front roof',
    'roof-right': 'Right roof',
    'roof-back': 'Back roof',
    'roof-left': 'Left roof',
    'valance-front': 'Front valance',
    'valance-right': 'Right valance',
    'valance-back': 'Back valance',
    'valance-left': 'Left valance',
  },
  options: [
    {
      id: 'size',
      label: 'Size',
      defaultChoice: '8x8',
      choices: [
        { id: '5x5', label: "5' × 5'" },
        { id: '6.5x6.5', label: "6.5' × 6.5'" },
        { id: '8x8', label: "8' × 8'" },
      ],
    },
    {
      id: 'package',
      label: 'Package',
      defaultChoice: 'canopy-frame',
      choices: [
        { id: 'canopy-frame', label: 'Canopy + frame', description: 'Printed canopy, frame, roller bag, ropes and stakes' },
        { id: 'canopy-only', label: 'Canopy only', description: 'Printed top only, fits a compatible frame' },
      ],
    },
    {
      id: 'frameFinish',
      label: 'Frame finish',
      defaultChoice: 'silver',
      visibleWhen: { option: 'package', oneOf: ['canopy-frame'] },
      choices: [
        { id: 'silver', label: 'Silver aluminium' },
        { id: 'black', label: 'Black powder coat' },
      ],
    },
    {
      id: 'production',
      label: 'Production',
      defaultChoice: 'standard',
      choices: [
        { id: 'standard', label: 'Standard', description: 'Ships in 5 business days' },
        { id: 'rush', label: 'Rush', description: 'Ships in 2 business days' },
      ],
    },
  ],
  palette: [
    { name: 'Canopy Gold', hex: '#e9b44c' },
    { name: 'White', hex: '#ffffff' },
    { name: 'Royal Blue', hex: '#2647c8' },
    { name: 'Forest Green', hex: '#2e6b3f' },
    { name: 'Red', hex: '#c8322b' },
    { name: 'Black', hex: '#161616' },
    { name: 'Orange', hex: '#e2652a' },
    { name: 'Sky', hex: '#5fb4e6' },
    { name: 'Hot Pink', hex: '#d63c7e' },
    { name: 'Charcoal', hex: '#3d4249' },
    { name: 'Purple', hex: '#5d3a9b' },
    { name: 'Teal', hex: '#11867f' },
  ],
  defaultFill: '#e9b44c',
  fonts: [
    { family: 'Inter', weights: [400, 700] },
    { family: 'Oswald', weights: [400, 700] },
    { family: 'Bebas Neue', weights: [400] },
    { family: 'Montserrat', weights: [400, 700] },
    { family: 'Playfair Display', weights: [400, 700] },
    { family: 'Pacifico', weights: [400] },
  ],
  views: [
    { id: 'orbit', label: 'Orbit', direction: [1.55, 0.95, 1.85] },
    { id: 'front', label: 'Front', direction: [0, 0.35, 2.6] },
    { id: 'back', label: 'Back', direction: [0, 0.35, -2.6] },
    { id: 'left', label: 'Left', direction: [-2.6, 0.35, 0] },
    { id: 'right', label: 'Right', direction: [2.6, 0.35, 0] },
    { id: 'top', label: 'Top', direction: [0, 2.7, 0.001] },
  ],
  scene: {
    partVisibility: [{ part: 'frame', option: 'package', visibleFor: ['canopy-frame'] }],
    materialColor: [
      { role: 'frame', option: 'frameFinish', colors: { silver: '#d4d7dc', black: '#2a2b30' }, metalness: 0.45, roughness: 0.32 },
    ],
  },
  limits: {
    maxUploadBytes: 10 * 1024 * 1024,
    acceptedTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'],
    maxImageEdge: 2400,
    maxLayersPerSurface: 12,
  },
};
