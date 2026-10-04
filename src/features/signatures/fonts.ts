import caveat from '../../../assets/fonts/Caveat-Medium.ttf';
import dancingScript from '../../../assets/fonts/DancingScript-SemiBold.ttf';
import greatVibes from '../../../assets/fonts/GreatVibes-Regular.ttf';

/**
 * Script fonts for typed signatures (SIL OFL 1.1, see assets/fonts). `key` is stored in
 * saved_signatures.font_key: never rename one. `family` is the expo-font name used for previews.
 */
export const SIGNATURE_FONTS = [
  { key: 'dancing-script', label: 'Dancing Script', family: 'SignFlowDancingScript', asset: dancingScript },
  { key: 'great-vibes', label: 'Great Vibes', family: 'SignFlowGreatVibes', asset: greatVibes },
  { key: 'caveat', label: 'Caveat', family: 'SignFlowCaveat', asset: caveat },
] as const;

export type SignatureFontKey = (typeof SIGNATURE_FONTS)[number]['key'];

export const FONT_FAMILIES = Object.fromEntries(SIGNATURE_FONTS.map((f) => [f.family, f.asset]));

export function fontByKey(key: string) {
  return SIGNATURE_FONTS.find((f) => f.key === key) ?? SIGNATURE_FONTS[0];
}
