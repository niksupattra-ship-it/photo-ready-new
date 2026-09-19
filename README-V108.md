# V108 — Fix false face/ear preservation failure

The red error "ตรวจใบหน้า กรอบหน้า และใบหูต้นฉบับไม่ผ่าน" could occur even when face restoration was successful: V107 compared source RGB to output RGB for pixels with alpha >= 250. Canvas `source-over` legitimately blends a partially transparent source (alpha 250–254) with AI, so those RGB values are not identical.

V108 validates only genuinely opaque source-owned pixels (originalLayer alpha 255, aligned source alpha 255, protected/core/ear mask alpha 255). It keeps the minimum protected face coverage and still rejects any changed opaque source pixels. No changes to paid AI/background removal calls, hairstyle, uniform templates, or Final PNG download flow.

This fixes the identified false-positive verification path; real photo quality still needs browser testing.
