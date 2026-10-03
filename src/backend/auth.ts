import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { initDatabase, pool } from "./database.js";
import { InputError } from "./categories.js";

const secret = process.env.JWT_SECRET;
const adminEmail = (process.env.ADMIN_EMAIL || "admin@guzelteknoloji.com").trim().toLowerCase();
const adminPassword = process.env.ADMIN_PASSWORD;
if (!secret || !adminPassword) throw new Error("JWT_SECRET ve ADMIN_PASSWORD tanımlanmalı");
const adminHash = bcrypt.hashSync(adminPassword, 10);

type LoginSettings = { quickLoginEnabled: boolean; imageUrl: string };
const defaultSettings: LoginSettings = { quickLoginEnabled: true, imageUrl: "/login-character.jpg" };
type Challenge = { hash: Buffer; expiresAt: number; attempts: number; sentAt: number };
const challenges = new Map<string, Challenge>();
const codeHash = (value: string) => createHash("sha256").update(value).digest();

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return response.status(401).json({ success: false, message: "Oturum gerekli" });
  try {
    const user = jwt.verify(token, secret!) as { email?: string };
    if (user.email !== adminEmail) throw new Error("Hesap geçersiz");
    next();
  } catch {
    return response.status(401).json({ success: false, message: "Oturum süresi doldu" });
  }
}

export async function readLoginSettings(): Promise<LoginSettings> {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT quick_login_enabled,image_data FROM api_login_settings WHERE id=1");
  if (!rows[0]) return defaultSettings;
  return {
    quickLoginEnabled: Boolean(rows[0].quick_login_enabled),
    imageUrl: rows[0].image_data || defaultSettings.imageUrl,
  };
}

export async function writeLoginSettings(input: Partial<LoginSettings>) {
  const old = await readLoginSettings();
  const next = { ...old, ...input };
  if (typeof next.quickLoginEnabled !== "boolean") throw new InputError("Hızlı giriş ayarı geçersiz");
  if (typeof next.imageUrl !== "string" || next.imageUrl.length > 1_800_000 ||
      !(next.imageUrl === "/login-character.jpg" || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(next.imageUrl))) {
    throw new InputError("Görsel PNG, JPEG veya WebP olmalı ve 1.3 MB sınırını aşmamalı");
  }
  await pool.query(`INSERT INTO api_login_settings(id,quick_login_enabled,image_data)
    VALUES(1,?,?) ON DUPLICATE KEY UPDATE quick_login_enabled=VALUES(quick_login_enabled),image_data=VALUES(image_data)`,
  [next.quickLoginEnabled ? 1 : 0, next.imageUrl.startsWith("data:image/") ? next.imageUrl : null]);
  return readLoginSettings();
}

export const authRoutes = Router();
authRoutes.post("/auth/login", (request, response) => {
  const email = String(request.body?.email || "").trim().toLowerCase();
  const password = String(request.body?.password || "");
  if (email !== adminEmail || !bcrypt.compareSync(password, adminHash)) return response.status(401).json({ success: false, message: "Kullanıcı adı veya şifre hatalı" });
  return response.json({ success: true, token: jwt.sign({ email }, secret!, { expiresIn: "12h" }) });
});
authRoutes.get("/login/settings", async (_request, response) => response.json({ success: true, data: await readLoginSettings() }));
authRoutes.get("/admin/login-settings", requireAuth, async (_request, response) => response.json({ success: true, data: await readLoginSettings() }));
authRoutes.patch("/admin/login-settings", requireAuth, async (request, response) => response.json({ success: true, data: await writeLoginSettings(request.body || {}) }));

authRoutes.post("/auth/request-otp", async (request, response) => {
  if (!(await readLoginSettings()).quickLoginEnabled) return response.status(403).json({ success: false, message: "Hızlı giriş kapalı" });
  const email = String(request.body?.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new InputError("Geçerli bir e-posta adresi girin");
  const host = process.env.SMTP_HOST?.trim(), user = process.env.SMTP_USER?.trim(), pass = process.env.SMTP_PASS?.trim();
  if (!host || !user || !pass) return response.status(503).json({ success: false, message: "SMTP ayarları yapılmamış" });
  if (email !== adminEmail) return response.json({ success: true, message: "Adres yönetici hesabıysa kod gönderildi" });
  const previous = challenges.get(email);
  if (previous && Date.now() - previous.sentAt < 60_000) return response.status(429).json({ success: false, message: "Yeni kod için bir dakika bekleyin" });
  const code = String(randomInt(100000, 1000000));
  challenges.set(email, { hash: codeHash(code), expiresAt: Date.now() + 300_000, attempts: 0, sentAt: Date.now() });
  try {
    const smtpPort = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({ host, port: smtpPort, secure: smtpPort === 465, auth: { user, pass } });
    await transport.sendMail({ from: process.env.SMTP_FROM?.trim() || user, to: adminEmail,
      subject: "Güzel Teknoloji giriş doğrulama kodu", text: `Yönetim paneli giriş kodunuz: ${code}\nKod 5 dakika geçerlidir.` });
    return response.json({ success: true, message: "Doğrulama kodu gönderildi" });
  } catch (error) {
    challenges.delete(email);
    console.error("SMTP send failed", error);
    return response.status(502).json({ success: false, message: "E-posta gönderilemedi" });
  }
});

authRoutes.post("/auth/verify-otp", async (request, response) => {
  if (!(await readLoginSettings()).quickLoginEnabled) return response.status(403).json({ success: false, message: "Hızlı giriş kapalı" });
  const email = String(request.body?.email || "").trim().toLowerCase();
  const code = String(request.body?.code || "").trim();
  const challenge = challenges.get(email);
  if (!challenge || email !== adminEmail || Date.now() > challenge.expiresAt) {
    challenges.delete(email);
    return response.status(401).json({ success: false, message: "Kodun süresi doldu" });
  }
  if (!/^\d{6}$/.test(code)) throw new InputError("6 haneli kodu girin");
  challenge.attempts += 1;
  if (challenge.attempts > 5) { challenges.delete(email); return response.status(429).json({ success: false, message: "Çok fazla deneme" }); }
  if (!timingSafeEqual(challenge.hash, codeHash(code))) return response.status(401).json({ success: false, message: "Kod hatalı" });
  challenges.delete(email);
  return response.json({ success: true, token: jwt.sign({ email }, secret!, { expiresIn: "12h" }) });
});
