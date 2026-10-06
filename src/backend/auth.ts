import { Router, type NextFunction, type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
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
type SmtpSettings = { host: string; port: number; secure: boolean; user: string; from: string; password: string };
type PublicSmtpSettings = Omit<SmtpSettings, "password"> & { passwordConfigured: boolean; encryptionKeyConfigured: boolean };

function smtpEncryptionKey() {
  const encoded = process.env.SMTP_SETTINGS_ENCRYPTION_KEY?.trim();
  if (!encoded) throw new InputError("SMTP şifresini veritabanında şifrelemek için SMTP_SETTINGS_ENCRYPTION_KEY tanımlanmalı", 503);
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new InputError("SMTP_SETTINGS_ENCRYPTION_KEY geçerli 32 bayt Base64 anahtarı olmalı", 503);
  return key;
}

function encryptSmtpPassword(password: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", smtpEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

function decryptSmtpPassword(row: { password_ciphertext?: string | null; password_iv?: string | null; password_tag?: string | null }) {
  if (!row.password_ciphertext || !row.password_iv || !row.password_tag) return "";
  const decipher = createDecipheriv("aes-256-gcm", smtpEncryptionKey(), Buffer.from(row.password_iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.password_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(row.password_ciphertext, "base64")), decipher.final()]).toString("utf8");
}

async function readSmtpSettings(): Promise<{ settings: SmtpSettings; publicSettings: PublicSmtpSettings }> {
  await initDatabase();
  const [rows] = await pool.query<any[]>("SELECT * FROM api_smtp_settings WHERE id=1");
  const row = rows[0];
  const envPort = Number(process.env.SMTP_PORT || 587);
  const envPassword = process.env.SMTP_PASS || "";
  const settings: SmtpSettings = {
    host: row?.host || process.env.SMTP_HOST?.trim() || "",
    port: row?.port ? Number(row.port) : envPort,
    secure: row ? Boolean(row.secure) : (process.env.SMTP_SECURE ? process.env.SMTP_SECURE.toLowerCase() === "true" : envPort === 465),
    user: row?.user || process.env.SMTP_USER?.trim() || "",
    from: row?.from_address || process.env.SMTP_FROM?.trim() || process.env.SMTP_USER?.trim() || "",
    password: row?.password_ciphertext ? decryptSmtpPassword(row) : envPassword,
  };
  const publicSettings: PublicSmtpSettings = {
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    user: settings.user,
    from: settings.from,
    passwordConfigured: Boolean(settings.password),
    encryptionKeyConfigured: Boolean(process.env.SMTP_SETTINGS_ENCRYPTION_KEY),
  };
  return { settings, publicSettings };
}

function smtpTransport(settings: SmtpSettings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    requireTLS: !settings.secure && settings.port === 587,
    auth: settings.user && settings.password ? { user: settings.user, pass: settings.password } : undefined,
  });
}

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

async function writeSmtpSettings(input: Partial<SmtpSettings>): Promise<PublicSmtpSettings> {
  const current = await readSmtpSettings();
  const next: SmtpSettings = {
    ...current.settings,
    host: String(input.host ?? current.settings.host).trim(),
    port: Number(input.port ?? current.settings.port),
    secure: input.secure ?? current.settings.secure,
    user: String(input.user ?? current.settings.user).trim(),
    from: String(input.from ?? current.settings.from).trim(),
  };
  const password = typeof input.password === "string" ? input.password : "";
  if (!next.host || next.host.length > 255 || /[\s/\\]/.test(next.host) ||
      !Number.isInteger(next.port) || next.port < 1 || next.port > 65535 ||
      typeof next.secure !== "boolean" || !next.user || next.user.length > 255 ||
      !next.from || next.from.length > 255 || password.length > 1024) {
    throw new InputError("SMTP sunucu, port, kullanıcı ve gönderen bilgilerini kontrol edin");
  }
  const [rows] = await pool.query<any[]>("SELECT password_ciphertext,password_iv,password_tag FROM api_smtp_settings WHERE id=1");
  let encrypted = rows[0] || { password_ciphertext: null, password_iv: null, password_tag: null };
  if (password) encrypted = encryptSmtpPassword(password);
  await pool.query(`INSERT INTO api_smtp_settings
    (id,host,port,secure,user,from_address,password_ciphertext,password_iv,password_tag)
    VALUES(1,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE host=VALUES(host),port=VALUES(port),secure=VALUES(secure),user=VALUES(user),
      from_address=VALUES(from_address),password_ciphertext=VALUES(password_ciphertext),
      password_iv=VALUES(password_iv),password_tag=VALUES(password_tag)`,
  [next.host, next.port, next.secure ? 1 : 0, next.user, next.from,
    encrypted.password_ciphertext, encrypted.password_iv, encrypted.password_tag]);
  return (await readSmtpSettings()).publicSettings;
}

async function sendSmtpTest(recipient: string) {
  const to = String(recipient || "").trim().toLowerCase();
  if (to.length > 255 || !/^\S+@\S+\.\S+$/.test(to)) throw new InputError("Geçerli bir alıcı e-posta adresi girin");
  const { settings } = await readSmtpSettings();
  if (!settings.host || !settings.user || !settings.password) throw new InputError("Önce geçerli SMTP bilgilerini kaydedin");
  const transport = smtpTransport(settings);
  await transport.verify();
  await transport.sendMail({
    from: settings.from,
    to,
    subject: "Güzel Teknoloji SMTP test mesajı",
    text: "SMTP ayarlarınız başarıyla doğrulandı.",
  });
  return { sentTo: to };
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
authRoutes.get("/admin/smtp-settings", requireAuth, async (_request, response) => response.json({ success: true, data: (await readSmtpSettings()).publicSettings }));
authRoutes.patch("/admin/smtp-settings", requireAuth, async (request, response) => response.json({ success: true, data: await writeSmtpSettings(request.body || {}) }));
authRoutes.post("/admin/smtp-settings/test", requireAuth, async (request, response) => response.json({ success: true, data: await sendSmtpTest(request.body?.to) }));

authRoutes.post("/auth/request-otp", async (request, response) => {
  if (!(await readLoginSettings()).quickLoginEnabled) return response.status(403).json({ success: false, message: "Hızlı giriş kapalı" });
  const email = String(request.body?.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new InputError("Geçerli bir e-posta adresi girin");
  const { settings } = await readSmtpSettings();
  if (!settings.host || !settings.user || !settings.password) return response.status(503).json({ success: false, message: "SMTP ayarları yapılmamış" });
  if (email !== adminEmail) return response.json({ success: true, message: "Adres yönetici hesabıysa kod gönderildi" });
  const previous = challenges.get(email);
  if (previous && Date.now() - previous.sentAt < 60_000) return response.status(429).json({ success: false, message: "Yeni kod için bir dakika bekleyin" });
  const code = String(randomInt(100000, 1000000));
  challenges.set(email, { hash: codeHash(code), expiresAt: Date.now() + 300_000, attempts: 0, sentAt: Date.now() });
  try {
    const transport = smtpTransport(settings);
    await transport.sendMail({ from: settings.from, to: adminEmail,
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
