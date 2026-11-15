# Earlier native-only display experiment (superseded)

The native-only approach below was replaced by [responsive suit selection](suit-selection-responsive.md). Waiting for a native image did not satisfy immediate selection feedback, and the shared editor busy flag dimmed unrelated controls. Current selection uses a decoded garment preview immediately while native preparation runs separately.

The stage previously drew a small catalog preview and later replaced it with the native PNG. Those two sources can differ in edge alpha and sharpness. Both languages now draw native garment pixels from the first changed frame; small images remain in the catalog only. This preserves the existing placement, masks, full-resolution exports, suit permissions and Thai automatic fitting.

The first two choices are prefetched when their catalog opens. Pointer entry, focus and pointer down prefetch other choices. A decoded native-image cache is limited to four images / 32 MiB, and in-flight loads are deduplicated. A cold selection highlights immediately but retains the current stage until the native image is ready. Network delivery cannot be instantaneous on a first uncached load.

Rapid swaps transfer ownership of the previous provisional surface until the next source is ready. Superseded requests cannot commit; rejection or failure restores the last committed work. New surfaces are prepared before old surfaces are released. Save and download still wait for native source preparation and suit-policy approval.

Validation: production build; nine English placement/native-fidelity tests; four preview/cache/export-guard checks; six real-browser cases in `tests/suit-native-preview.browser.py` covering English/Thai desktop/mobile and Thai Easy mode. The browser checks hold native image responses, exercise rapid changes and late policy responses, verify English preview/commit pixel equality and rejection rollback, and block live API/AI/payment calls. The same native-display test fails against the original source because it displays the thumbnail while the native source is held.

Earlier browser tests that specifically expect a thumbnail to change the stage before a held native request completes describe the previous behavior. Use the native-display regression for this handoff contract. This change removes the thumbnail/full-resolution transition; it does not eliminate a first-time network wait or alter intentional Thai automatic head/collar fitting.
