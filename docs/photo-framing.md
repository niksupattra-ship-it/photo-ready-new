# Required upload framing

Both the main photo picker and Studio's replacement picker validate the prepared, display-oriented photo before replacing existing work. A failed or unavailable check blocks that upload. Reopening saved work does not revalidate or alter its original photo.

The bundled face landmarker measures forehead-to-chin height against the image height. Initial accepted range: 27–50%; face width must be at most 58% of image width. Require space above the forehead equal to at least 10% of face height, below the chin equal to at least 85%, and side margins. These are conservative framing heuristics for chest-up photos, not measurements of physical camera distance, actual chest/shoulder presence or neck posture. They can be tuned after real user examples.

Rejections use short Thai/English messages for too close, too far, cropped framing or missing face. Photo bytes remain unchanged; uploads are not silently cropped or zoomed to pass. Successful checks are cached by immutable Blob identity. Failed checks can retry.

Validation: `node --test tests/photo-framing.test.js` covers relative sizing, missing margins/face, concurrent checks and fail-closed retry. A Chromium check using the actual bundled MediaPipe model on three framings of a bundled portrait accepted 40% face height and rejected 65% and 18%. Vite production build passed.
