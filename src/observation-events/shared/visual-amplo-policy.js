import {pairCaptureWindow,CAPTURE_POLICY_VERSION} from './aspect-capture-policy.js';
export const VISUAL_ORB_POLICY_VERSION='SKYNOW_AMPLO_V1_'+CAPTURE_POLICY_VERSION;
// Reuse only capture widths, never activation, scoring or ranking rules.
export function visualAmploOrb(bodyA,bodyB,aspect){
 return pairCaptureWindow({bodyA,bodyB,aspect});
}
