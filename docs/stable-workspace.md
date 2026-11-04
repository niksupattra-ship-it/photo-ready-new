# Keep the photo viewport stable during outfit and insignia selection

The reproduction kept CSS zoom at 100%, yet the canvas changed size or position because the layout changed. On desktop, showing selection feedback reduced the measured canvas width from 682.5 to 659.25 pixels. In the 390px Easy-mode viewport, opening choices reduced the canvas element width from 360 to approximately 218.86 pixels. These are local browser-fixture measurements, not user-photo changes.

The Studio feedback row now reserves a fixed 50px desktop / 36px touch area even when its message is empty. Idle feedback is visually hidden; longer messages scroll inside the reserved row. Showing or clearing a message therefore does not take height away from the workspace.

In finished touch Easy mode, choice panels float above the resting tabs/actions instead of occupying a new grid row. The download action has the same height whether choices are open or closed, and grid children have explicit shrink bounds to avoid horizontal overflow. Initial upload wizards, processing overlays and the separate manual-adjustment sheet retain their existing behavior. Menus can cover the lower portion of the photo while open, preserving the photo's scale instead of shrinking it.

The only editor JavaScript change is the feedback container's idle visibility attribute. Canvas zoom/pan handlers, auto suit fitting, provisional previews, committed layers, rights checks and export code are unchanged. Manual zoom is still available; this change removes layout-induced resizing during normal choice selection.

Verification:

- `tests/stable-workspace.browser.py`: 16 cases covering suit/chest selection, Studio/Easy and viewport widths 320, 390, 820 and 1440. It measures the visible canvas before menu opening, throughout provisional rendering and after native commit, with less than 1px tolerance for geometry changes. The fixture holds full-resolution requests to exercise both phases.
- Long feedback remains scrollable without resizing the canvas. Studio's user-initiated 1.1× wheel zoom is preserved when feedback visibility changes. Manual zoom is not an Easy-mode assertion.
- Default build, English coverage, original garment-preview/export guards and government catalog checks pass.
- Built-browser interface checks pass for the homepage portraits, Thai/English controls and all 36 Studio garment choices. The government workflow still shows 4 male and 4 female choices for either portrait type.
- Source upload / actual 2256×3072 PNG download passes at desktop and mobile widths with mocked rights, including one mocked credit per work and free repeated delivery.

All browser requests use local assets and API fixtures. No paid AI, real payment, email, customer account, managed Environment configuration, hosting configuration or build configuration is changed. Deployment results must be checked for the resulting commit separately.
