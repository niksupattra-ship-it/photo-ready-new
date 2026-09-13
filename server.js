import "dotenv/config";
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json({ limit: "2mb" }));

const upload = multer({
  dest: path.join(os.tmpdir(), "photoid-studio-th"),
  limits: { fileSize: 15 * 1024 * 1024 }
});

const HAIR_PROMPTS = {
  "1": "short neat professional haircut",
  "2": "soft shoulder-length straight hair",
  "3": "chin-length bob haircut",
  "4": "long straight hair tucked behind ears",
  "5": "soft layered shoulder-length hair",
  "6": "low ponytail, tidy and professional",
  "7": "medium-length inward-curled hair",
  "8": "short pixie style, neat and formal",
  "9": "long hair tied back neatly",
  "10": "soft bob with side part",
  "11": "shoulder-length hair with natural volume",
  "12": "long straight hair with center part",
  "13": "medium-length soft waves, restrained",
  "14": "short layered professional hair",
  "15": "smooth low bun, official photo style",
  "16": "straight bob ending below jaw",
  "17": "shoulder-length straight hair with side part",
  "18": "long hair pulled behind shoulders",
  "19": "medium-length neat layered hair",
  "20": "neat shoulder-length dark hair, softly layered, natural volume, subtle side part, ears only slightly visible"
};

function buildPrompt({ hairStyle = "20", suit = "female-formal", background = "white" }) {
  const hair = HAIR_PROMPTS[String(hairStyle)] || HAIR_PROMPTS["20"];
  const suitText = suit === "female-formal"
    ? "formal Thai office portrait attire: conservative dark women's suit jacket over a clean light blouse, modest and official"
    : "formal conservative office attire";

  const bgMap = {
    white: "clean pure white studio background",
    blue: "clean official light blue studio background",
    gray: "clean very light gray studio background"
  };
  const bg = bgMap[background] || bgMap.white;

  return `
Edit the uploaded portrait into a realistic Thai official ID / application photo.

ABSOLUTE IDENTITY RULE:
- Preserve the person's identity, facial structure, eyes, nose, lips, eyebrows, skin tone, expression, age, and all recognizable facial details.
- Do NOT beautify, reshape, slim, enlarge eyes, alter jaw, change nose, change smile, or replace the face.
- Do NOT change the camera angle of the face.
- The result must still clearly be the exact same person.

HAIR:
- Change only the hairstyle to: ${hair}.
- Hair should look natural, realistic, tidy, and physically attached to the original head.
- Keep the hairline believable. Do not cover important facial features.
- Hair should not be excessively thick.

CLOTHING:
- Replace clothing below the neck with ${suitText}.
- Keep shoulders level and natural.
- Adjust the visible neck only as needed so it connects naturally between the unchanged face and the new clothing.
- Neck skin tone must match the face naturally.

COMPOSITION / DISTANCE:
- Vertical portrait.
- Head and upper shoulders visible.
- Keep the head smaller in frame than a tight passport crop: leave comfortable space above the hair and visible shoulder width.
- Eye line should sit slightly above the vertical center.
- Match a clean official-photo framing, not a close-up selfie.
- Subject centered, upright, looking forward.

BACKGROUND:
- ${bg}.
- No shadows, no objects, no text, no borders.

QUALITY:
- Photorealistic, studio lighting, neutral exposure, natural skin texture.
- No painterly effect, no cartoon look, no artificial plastic skin.
- Do not add accessories.
`;
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.IMAGE_MODEL || "gpt-image-1"
  });
});

app.post("/api/generate", upload.single("image"), async (req, res) => {
  const tempPath = req.file?.path;
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(503).json({
        error: "AI_NOT_CONFIGURED",
        message: "ยังไม่ได้ตั้งค่า OPENAI_API_KEY เว็บส่วนพรีวิวใช้งานได้ แต่ยังไม่เรียก AI"
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: "กรุณาอัปโหลดรูปใบหน้า" });
    }

    const prompt = buildPrompt({
      hairStyle: req.body.hairStyle,
      suit: req.body.suit,
      background: req.body.background
    });

    const fileBytes = await fs.promises.readFile(req.file.path);
    const form = new FormData();
    form.append("model", process.env.IMAGE_MODEL || "gpt-image-1");
    form.append("prompt", prompt);
    form.append("image", new Blob([fileBytes], { type: req.file.mimetype || "image/jpeg" }), req.file.originalname || "portrait.jpg");
    form.append("size", "1024x1536");
    form.append("quality", "high");
    form.append("output_format", "png");
    // Supported by gpt-image-1 and useful for face fidelity.
    if ((process.env.IMAGE_MODEL || "gpt-image-1") === "gpt-image-1") {
      form.append("input_fidelity", "high");
    }

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: form
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({
        error: "OPENAI_ERROR",
        message: data?.error?.message || "สร้างภาพไม่สำเร็จ",
        details: data?.error || data
      });
    }

    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url;
    if (b64) {
      return res.json({ image: `data:image/png;base64,${b64}` });
    }
    if (url) {
      return res.json({ image: url });
    }
    return res.status(500).json({ error: "ไม่พบข้อมูลภาพจาก API" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "SERVER_ERROR", message: err?.message || "เกิดข้อผิดพลาด" });
  } finally {
    if (tempPath) fs.promises.unlink(tempPath).catch(() => {});
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Photo ID Studio TH running on http://localhost:${port}`);
});
