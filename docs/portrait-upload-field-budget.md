# Multipart 413 field-count fix

The current photo request carries more than 20 small metadata fields when quality versions, hairstyle/face geometry and original-source identifiers are combined. The shared Multer parser still limited requests to 20 fields / 24 total parts and mapped all Multer errors to HTTP 413. As a result even a tiny image could fail with `LIMIT_FIELD_COUNT` before job creation, AI or credit reservation.

Use one shared immutable upload budget: 48 metadata fields / 52 parts, retaining 20 MiB per image, at most two files and the existing 1 MiB field-value cap. Do not increase image byte limits, strip quality versions, retry submissions automatically or add provider calls.

For Thai 413 and otherwise unknown processing failures, display title “ประมวลผลไม่สำเร็จ” and body “กรุณาตรวจสอบรูปหน้าตรงหรือเปลี่ยนรูป” as requested. Keep stage/status in the internal failure object for diagnostics; the modal renders that technical badge only in English. Preserve distinct credit/auth/recover-existing-job actions.

A real Express/Multer regression derives metadata field names from the actual client builder, reproduces the old 413 with a tiny file and checks acceptance through the shared new parser for one/two-image clients. Excess metadata/files remain rejected. Existing original-source reuse, ownership, no-ambiguous-retry and submission validation tests now run in prebuild. No live customer submission or provider/payment call is made.
