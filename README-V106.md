# V106 — Face/Ear Mask Intersection Fix

Base: V105. In `restoreSourceFaceOnAi`, explicitly set `destination-in` before drawing the feathered face/ear envelope. This ensures the mask is the intersection of aligned source skin, AI skin and the geometric envelope, not an added opaque oval. The protected central core is still added deliberately with `source-over` after excluding AI hair. No additional AI/background-removal calls.

Note: V105 already left the canvas in `destination-in` at this line; this change makes the operation explicit and prevents accidental regression. It is NOT a verified fix for all facial/ear seams or hair matching. Browser/image QA is still required.
