import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL = process.env.IMAGE_MODEL || "gpt-image-1";

app.use(express.static("public"));
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  dest: path.join(os.tmpdir(), "photo-ready-new"),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const PUBLIC = path.resolve("public");
const SUIT_REF = path.join(PUBLIC, "assets", "suit-female-formal.jpg");
const HAIR20_REF = path.join(PUBLIC, "assets", "hair20-reference.jpg");
const STANDARD_REF = path.join(PUBLIC, "assets", "approved-result-2.png");

const STYLE_MAP = {
  original: "keep the original hairstyle unchanged",
  polite: "formal neat hairstyle suitable for an official application photo",
  tied: "hair tied back neatly and naturally",
  side: "hair swept neatly to one side",
  ponytail: "low professional ponytail",
  smooth: "sleek straight professional hairstyle",
  long: "long straight hair kept tidy behind shoulders",
  shoulder20: "hairstyle style 20: neat shoulder-length dark hair, natural soft layers, balanced volume, clean center-to-soft-side part, professional appearance"
};

function promptFor({ hairstyle = "shoulder20" }) {
  return `
Create a realistic Thai job-application ID portrait using the uploaded person's identity.

REFERENCE PRIORITY:
1. FIRST uploaded image = the customer's original portrait. Preserve identity and all face/makeup characteristics.
2. SECOND image = exact female formal suit template. Use this suit pattern; do not redesign the suit.
3. THIRD image = hairstyle style reference / style 20 guidance.
4. FOURTH image = approved composition reference. Match its framing, body scale and blue background.

IDENTITY LOCK:
- Keep the exact same person.
- Preserve facial proportions, eyes, nose, lips, eyebrows, makeup, skin tone, expression and recognizable marks.
- Do not beautify, slim, reshape jaw, enlarge eyes, alter nose or change makeup.
- Do not age or de-age.
- Face should look like the original photograph, not a newly invented face.

HAIR:
- ${STYLE_MAP[hairstyle] || STYLE_MAP.shoulder20}
- Modify hair only around the preserved face.
- Natural hairline, realistic strands, moderate volume.
- Do not cover important facial features.

CLOTHING:
- Use the same black women's suit jacket and white shirt pattern as the suit reference image.
- Keep the suit design stable between users.
- Natural neck connection and matching skin tone.
- Shoulders level and symmetrical.

COMPOSITION STANDARD — LOCK THIS:
- Final ratio exactly 3:4.
- Job-application framing, not a tight passport crop.
- Show full head, neck, shoulders and upper torso like the approved reference.
- Keep comfortable space above the head.
- Shoulder width and torso size should match the approved reference.
- Head must not become larger because the uploaded photo is close-up.
- Subject centered and facing forward.

BACKGROUND:
- Standard clean bright official blue matching the approved reference.
- Uniform flat blue, no objects, no texture, no shadows.

QUALITY:
- Photorealistic studio portrait.
- Natural skin texture and lighting.
- No painterly or plastic look.
- No text, watermark, border or accessories.
`;
}

app.get("/api/health", (_, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY), model: MODEL });
});

app.post("/api/generate", upload.single("image"), async (req, res) => {
  const temp = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: "กรุณาเลือกรูป" });
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "AI_NOT_CONFIGURED",
        message: "ยังไม่ได้เพิ่ม OPENAI_API_KEY แต่โค้ดและไฟล์อ้างอิงพร้อมแล้ว"
      });
    }

    const form = new FormData();
    form.append("model", MODEL);
    form.append("prompt", promptFor({ hairstyle: req.body.hairstyle || "shoulder20" }));
    form.append("size", "1024x1536");
    form.append("quality", "high");
    form.append("output_format", "png");
    if (MODEL === "gpt-image-1") form.append("input_fidelity", "high");

    const addImage = async (p, name, type="image/png") => {
      const bytes = await fs.promises.readFile(p);
      form.append("image[]", new Blob([bytes], { type }), name);
    };

    await addImage(req.file.path, req.file.originalname || "customer.jpg", req.file.mimetype || "image/jpeg");
    await addImage(SUIT_REF, "female-suit-reference.jpg", "image/jpeg");
    await addImage(HAIR20_REF, "hair20-reference.jpg", "image/jpeg");
    await addImage(STANDARD_REF, "approved-standard.png", "image/png");

    const api = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form
    });

    const data = await api.json();
    if (!api.ok) {
      return res.status(api.status).json({
        error: "OPENAI_ERROR",
        message: data?.error?.message || "สร้างภาพไม่สำเร็จ",
        details: data?.error || data
      });
    }

    let bytes;
    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url;
    if (b64) bytes = Buffer.from(b64, "base64");
    else if (url) {
      const r = await fetch(url);
      bytes = Buffer.from(await r.arrayBuffer());
    } else {
      return res.status(500).json({ error: "ไม่พบภาพจาก AI" });
    }

    // Force final output to exact 3:4, centered, matching the approved standard.
    const meta = await sharp(bytes).metadata();
    const w = meta.width || 1024;
    const h = meta.height || 1536;
    const targetRatio = 3 / 4;
    let cropW = w, cropH = Math.round(w / targetRatio);
    if (cropH > h) {
      cropH = h;
      cropW = Math.round(h * targetRatio);
    }
    const left = Math.max(0, Math.round((w - cropW) / 2));
    const top = Math.max(0, Math.round((h - cropH) / 2));
    const finalPng = await sharp(bytes)
      .extract({ left, top, width: cropW, height: cropH })
      .resize(1200, 1600, { fit: "fill" })
      .png()
      .toBuffer();

    res.json({ image: `data:image/png;base64,${finalPng.toString("base64")}` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "SERVER_ERROR", message: e?.message || "เกิดข้อผิดพลาด" });
  } finally {
    if (temp) fs.promises.unlink(temp).catch(() => {});
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Photo Ready running on ${PORT}`);
});
