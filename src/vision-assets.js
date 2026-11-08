// Serve the exact pinned runtime and models from our own origin. Mobile clients
// must not depend on a separate CDN/storage connection to accept an AI result.
const VISION_ASSET_ROOT='/assets/vision/mediapipe-1.0.1';
export const VISION_WASM_ROOT=VISION_ASSET_ROOT+'/wasm';
export const FACE_LANDMARK_MODEL=VISION_ASSET_ROOT+'/face_landmarker.task';
export const PERSON_SEGMENTATION_MODEL=VISION_ASSET_ROOT+'/selfie_multiclass_256x256.tflite';
