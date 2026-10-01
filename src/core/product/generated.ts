import { z } from 'zod';

/**
 * Schema of the files `npm run build:models` writes. Parsed at load time, so a bad model
 * export fails loudly at startup instead of rendering a broken configurator.
 */
const vec2 = z.tuple([z.number(), z.number()]);

const generatedSchema = z.object({
  atlasSize: z.number().positive(),
  variants: z.record(
    z.string(),
    z.object({
      model: z.string().min(1),
      shadeMap: z.string().optional(),
      surfaces: z
        .array(
          z.object({
            id: z.string(),
            group: z.string(),
            side: z.string(),
            polygon: z.array(vec2).min(3),
            uprightRotation: z.number(),
            physical: z.object({ widthIn: z.number().positive(), heightIn: z.number().positive() }),
          }),
        )
        .min(1),
    }),
  ),
});

export type GeneratedGeometry = z.infer<typeof generatedSchema>;

export function loadGeneratedGeometry(json: unknown): GeneratedGeometry {
  return generatedSchema.parse(json);
}
