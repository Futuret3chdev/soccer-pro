const PITCH_W = 68;
const PITCH_L = 105;

export { PITCH_W, PITCH_L };

export const STAND_TIER_COUNT = 4;

export function standTierRadii(tier) {
  return {
    rx: PITCH_L / 2 + 14 + tier * 5.2,
    rz: PITCH_W / 2 + 11 + tier * 4.4
  };
}

export function standRailY(tier) {
  return 1.2 + tier * 2.6;
}

export function standDeckTop(tier) {
  return standRailY(tier) - 0.35 + 0.275;
}