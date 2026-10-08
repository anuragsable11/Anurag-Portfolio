/**
 * The samurai's layout and rig measurements, shared by the model, the poses
 * and the IK.
 *
 * Layout, standing, bottom to top (world units, floor at y = 0):
 *   0.04  sandals        1.15  hips / sash (HIP_Y)
 *   0.65  knees          1.87  shoulders
 *   2.32  eye line       2.95  helmet crown
 *   3.78  crest tips
 */

export const HIP_Y = 1.15
export const HEAD_Y = 2.22
// The resting grip: how the blade sits in the hand with the wrist at ease
// (tilted forward, swept out to his side). Every other blade angle is a
// turn of the wrist away from this one.
export const KATANA_TILT = -0.8
export const KATANA_SWEEP = 0.7

// Meditation: seconds for a sit / stand transition, and how long each pose
// holds before the cycle moves on. He only sits at all once the visitor has
// been idle for IDLE_SIT_AFTER seconds; FIRST_SIT_AT is the least he waits
// after a change of mood.
export const TRANSITION = 2.4
export const IDLE_SIT_AFTER = 40
export const FIRST_SIT_AT = 7
export const MEDITATE_FOR = 9
export const STAND_FOR = 13
// Seated, the legs attach lower on the pelvis (so the kusazuri drape over
// the thighs) and the whole figure drops to sit on its heels.
export const LEG_DROP = 0.18
export const SIT_DROP = 0.49

// Poses are authored in body space: origin at the hips, +Y up, +Z forward,
// +X toward the katana hand. Hands are IK targets for the centre of the fist;
// the blade is a direction plus the way its edge faces.
export const SHOULDER_X = 0.46
export const SHOULDER_Y = 0.72
export const UPPER_ARM = 0.56
export const FOREARM = 0.4
// From the katana hand down the grip to where the other hand closes.
export const GRIP_SPAN = 0.22
// From the katana hand to the point of the blade.
export const BLADE_LEN = 1.48

// Legs, in the figure's frame: the hip joints sit HIP_X either side of the
// centre at HIP_Y; thigh and shin are the same length; a flat foot holds its
// ankle ANKLE_Y above the floor. BOOT is the boot's box in the ankle's frame
// (+Z toward the toe), which keeps its lowest point on the floor however the
// foot is pitched.
export const HIP_X = 0.32
export const THIGH = 0.5
export const SHIN = 0.5
export const ANKLE_Y = 0.15
export const BOOT = { min: [-0.19, -0.12, -0.19], max: [0.19, 0.095, 0.39] }

// The wrist: how far the hand may turn from the resting grip, and how far
// the forearm rolls (pronation) to carry the rest of a turn.
export const WRIST_MAX = 1.45
export const PRONATE_MAX = 1.3
// The point of the blade never comes nearer the floor than this.
export const FLOOR_CLEAR = 0.1

// Where the camera looks, standing and seated.
export const STAND_TARGET_Y = 1.95
export const SIT_TARGET_Y = 1.62
