# V76
Based directly on the supplied V70 diagnostic project.

Only background-removal provider/dependencies changed:
- AI prompt/model/quality/input_fidelity are unchanged from V70.
- Post-AI remove.bg API is replaced by local MODNet Photographic ONNX.
- MODNet creates alpha only; source AI RGB is retained at its original dimensions.
- Expected diagnostic stage 02 stays 1024x1536 when stage 01 is 1024x1536.
- No REMOVEBG_API_KEY or per-image remove.bg credits are required.
- First use downloads the ~25 MB MODNet model to `.cache`; later calls reuse it for that running instance.

Model/project: MODNet, Apache-2.0.
