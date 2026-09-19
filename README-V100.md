# V100 — Hairline composition fix / review

- Fix a concrete V99 compositing bug: the entire restored original face layer could cover the newly selected hair along the forehead/temples. The original face is now subtracted only where donor hair exists, except the immutable central facial core.
- The front and back hair layers protect the central face core rather than masking the entire hairline.
- Retain and expose the AI hairstyle donor PNG for diagnosis without additional API calls.
- Preserve the locked transform, Clean Head cache, original restore and rollback on errors.

Limitations: no live OpenAI API image call was made. The image model receives a reference image, so pixel-exact matching to a selected hairstyle cannot be guaranteed. Verify the donor PNG and final output with the supplied long-hair photo before production.
