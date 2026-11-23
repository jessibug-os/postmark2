export const FACE_SIZE = 512;

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
