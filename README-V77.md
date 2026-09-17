# V77

- Based on V76/V70 image pipeline.
- Replaces native `onnxruntime-node` with `onnxruntime-web` WASM to avoid the deployment-time NuGet/native-binary install failure.
- MODNet still predicts alpha only; RGB pixels from the V70 AI output are retained.
- No remove.bg credit is used for the post-AI background removal step.
- WASM is forced to one thread for Node/server compatibility.
