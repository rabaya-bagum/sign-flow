/** Ink colours offered when drawing or typing. Black is the default. (No Skia import: used by UI.) */
export const INK_COLORS = { black: '#111111', blue: '#1A3A8F' } as const;
export type InkColor = keyof typeof INK_COLORS;
