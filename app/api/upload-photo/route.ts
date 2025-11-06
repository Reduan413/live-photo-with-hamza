import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function POST(req: Request) {
  const { image } = await req.json();

  if (!image) {
    return NextResponse.json({ success: false, message: "No image provided" });
  }

  // Decode base64 image
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Save image to /public/uploads
  const uploadDir = path.join(process.cwd(), "public/uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

  const filePath = path.join(uploadDir, `photo-${Date.now()}.jpg`);
  fs.writeFileSync(filePath, buffer);

  return NextResponse.json({ success: true, filePath: `/uploads/${path.basename(filePath)}` });
}
