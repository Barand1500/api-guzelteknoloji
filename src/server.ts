import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readStore, writeStore, type RecordItem } from './store.js';
import { initDb, listCategories, pool } from './db.js';

const app = express();
const port = Number(process.env.PORT || 4010);
const secret = process.env.JWT_SECRET || 'change-this-secret';
const adminEmail = process.env.ADMIN_EMAIL || 'admin@guzelteknoloji.com';
const adminHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || '123456', 10);
const root = path.dirname(fileURLToPath(import.meta.url));

app.use(cors({ origin: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.resolve(root, '../public')));

type AuthRequest = Request & { user?: { email: string } };
function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ success: false, message: 'Oturum gerekli' });
  try {
    req.user = jwt.verify(token, secret) as { email: string };
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Oturum süresi doldu' });
  }
}

app.get('/health', async (_req, res) => {
  const store = await readStore();
  res.json({ success: true, enabled: store.enabled, service: 'guzel-teknoloji-api' });
});

app.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (email !== adminEmail.toLowerCase() || !bcrypt.compareSync(password, adminHash)) {
    return res.status(401).json({ success: false, message: 'Kullanıcı adı veya şifre hatalı' });
  }
  const token = jwt.sign({ email }, secret, { expiresIn: '12h' });
  res.json({ success: true, token, user: { email } });
});

app.get('/admin/state', auth, async (_req, res) => res.json({ success: true, data: await readStore() }));
app.patch('/admin/state', auth, async (req, res) => {
  const store = await readStore();
  if (typeof req.body?.enabled === 'boolean') store.enabled = req.body.enabled;
  await writeStore(store);
  res.json({ success: true, data: store });
});

function publicApiGuard(req: Request, res: Response, next: NextFunction) {
  void readStore().then((store) => {
    if (!store.enabled) return res.status(503).json({ success: false, message: 'API şu anda kapalı' });
    next();
  }).catch(() => res.status(500).json({ success: false, message: 'Veri deposu okunamadı' }));
}

app.get('/api/records', publicApiGuard, async (_req, res) => {
  const store = await readStore();
  res.json({ success: true, data: store.records.filter((item) => item.active) });
});
app.get('/admin/records', auth, async (_req, res) => res.json({ success: true, data: (await readStore()).records }));

app.get('/admin/categories', auth, async (_req, res) => res.json({ success: true, data: await listCategories() }));
app.post('/admin/categories', auth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const slug = String(req.body?.slug || name).trim().toLowerCase().replace(/[^a-z0-9ğüşöçı]+/gi, '-').replace(/^-|-$/g, '');
  if (!name || !slug) return res.status(400).json({ success: false, message: 'Kategori adı gerekli' });
  try { await initDb(); const [result] = await pool.query<any>(`INSERT INTO api_categories (name,slug,active) VALUES (?,?,1)`, [name, slug]); return res.status(201).json({ success: true, data: { id: result.insertId, name, slug, active: true } }); }
  catch { return res.status(400).json({ success: false, message: 'Bu kategori veya adres zaten kullanılıyor' }); }
});
app.patch('/admin/categories/:id', auth, async (req, res) => {
  await initDb(); await pool.query(`UPDATE api_categories SET name=COALESCE(?,name), active=COALESCE(?,active) WHERE id=?`, [req.body?.name ?? null, typeof req.body?.active === 'boolean' ? Number(req.body.active) : null, Number(req.params.id)]); res.json({ success: true });
});
app.delete('/admin/categories/:id', auth, async (req, res) => { await initDb(); await pool.query(`DELETE FROM api_categories WHERE id=?`, [Number(req.params.id)]); res.json({ success: true }); });

app.get('/admin/api-keys', auth, async (_req, res) => { await initDb(); const [rows] = await pool.query<any[]>(`SELECT id,project_name projectName,api_key apiKey,active,created_at createdAt FROM api_keys ORDER BY created_at DESC`); res.json({ success: true, data: rows }); });
app.post('/admin/api-keys', auth, async (req, res) => { const projectName=String(req.body?.projectName||'').trim(); if(!projectName)return res.status(400).json({success:false,message:'Proje adı gerekli'}); await initDb(); const item={id:randomUUID(),projectName,apiKey:`gtk_${randomUUID().replace(/-/g,'')}`,active:true}; await pool.query(`INSERT INTO api_keys (id,project_name,api_key,active) VALUES (?,?,?,1)`,[item.id,item.projectName,item.apiKey]); res.status(201).json({success:true,data:item}); });
app.patch('/admin/api-keys/:id', auth, async (req,res)=>{await initDb();await pool.query(`UPDATE api_keys SET active=? WHERE id=?`,[Number(Boolean(req.body?.active)),req.params.id]);res.json({success:true});});
app.delete('/admin/api-keys/:id', auth, async (req,res)=>{await initDb();await pool.query(`DELETE FROM api_keys WHERE id=?`,[req.params.id]);res.json({success:true});});

app.get('/admin/media', auth, async (_req,res)=>{await initDb();const [rows]=await pool.query<any[]>(`SELECT id,name,url,mime_type mimeType,active,created_at createdAt FROM api_media ORDER BY created_at DESC`);res.json({success:true,data:rows});});
app.post('/admin/media', auth, async (req,res)=>{const name=String(req.body?.name||'').trim(),url=String(req.body?.url||'').trim();if(!name||!url)return res.status(400).json({success:false,message:'Dosya adı ve URL gerekli'});await initDb();const id=randomUUID();await pool.query(`INSERT INTO api_media (id,name,url,mime_type,active) VALUES (?,?,?,?,1)`,[id,name,url,String(req.body?.mimeType||'image')]);res.status(201).json({success:true,data:{id,name,url,active:true}});});
app.delete('/admin/media/:id', auth, async (req,res)=>{await initDb();await pool.query(`DELETE FROM api_media WHERE id=?`,[req.params.id]);res.json({success:true});});

app.post('/admin/records', auth, async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const value = String(req.body?.value || '').trim();
  if (!name || !value) return res.status(400).json({ success: false, message: 'Ad ve değer zorunludur' });
  const store = await readStore();
  const item: RecordItem = { id: randomUUID(), categoryId: 0, name, value, active: req.body?.active !== false, updatedAt: new Date().toISOString() };
  store.records.unshift(item);
  await writeStore(store);
  res.status(201).json({ success: true, data: item });
});

app.patch('/admin/records/:id', auth, async (req, res) => {
  const store = await readStore();
  const item = store.records.find((record) => record.id === req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Kayıt bulunamadı' });
  if (req.body?.name !== undefined) item.name = String(req.body.name).trim();
  if (req.body?.value !== undefined) item.value = String(req.body.value).trim();
  if (req.body?.active !== undefined) item.active = Boolean(req.body.active);
  item.updatedAt = new Date().toISOString();
  await writeStore(store);
  res.json({ success: true, data: item });
});

app.delete('/admin/records/:id', auth, async (req, res) => {
  const store = await readStore();
  const before = store.records.length;
  store.records = store.records.filter((record) => record.id !== req.params.id);
  if (before === store.records.length) return res.status(404).json({ success: false, message: 'Kayıt bulunamadı' });
  await writeStore(store);
  res.json({ success: true });
});

app.get('/api/records/:name', publicApiGuard, async (req, res) => {
  const store = await readStore();
  const item = store.records.find((record) => record.active && record.name === req.params.name);
  if (!item) return res.status(404).json({ success: false, message: 'Veri bulunamadı' });
  res.json({ success: true, data: item });
});

app.get('/api/categories/:slug', publicApiGuard, async (req, res) => {
  await initDb();
  const [categories] = await pool.query<any[]>(`SELECT id,name,slug FROM api_categories WHERE slug=? AND active=1 LIMIT 1`, [req.params.slug]);
  const category = categories[0];
  if (!category) return res.status(404).json({ success: false, message: 'Kategori bulunamadı' });
  const [rows] = await pool.query<any[]>(`SELECT id,data,updated_at updatedAt FROM api_category_rows WHERE category_id=? AND active=1 ORDER BY updated_at DESC`, [category.id]);
  res.json({ success: true, category, data: rows.map((row) => ({ ...row, data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data })) });
});

const publicDir = path.resolve(root, '../public');
app.get(/^(?!\/api|\/admin|\/auth).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));
app.listen(port, () => console.log(`Güzel Teknoloji API http://localhost:${port}`));
