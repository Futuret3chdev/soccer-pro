const PITCH_W = 68;
const PITCH_L = 105;

export { PITCH_W, PITCH_L };

export const STAND_TIER_COUNT = 5;

export function standTierRadii(tier) {
  return {
    rx: PITCH_L / 2 + 18 + tier * 4.5,
    rz: PITCH_W / 2 + 14 + tier * 3.6
  };
}

export function standRailY(tier) {
  return 1 + tier * 2.2;
}

export function standDeckTop(tier) {
  return standRailY(tier) - 0.35 + 0.275;
}