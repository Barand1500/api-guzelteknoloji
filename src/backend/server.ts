import "dotenv/config";
import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { authRoutes } from "./auth.js";
import { adminRoutes } from "./adminRoutes.js";
import { InputError } from "./categories.js";
import { initDatabase } from "./database.js";
import { publicRoutes } from "./publicRoutes.js";
import { searchRoutes } from "./search.js";
import { uploadDir } from "./uploads.js";

const app = express();
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 4010);
const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, "../../public");

app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));
app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadDir, { immutable: true, maxAge: "1y" }));
app.use(authRoutes, adminRoutes, searchRoutes, publicRoutes);
app.get(/^(?!\/api|\/admin|\/auth|\/uploads).*/, (_request, response) => response.sendFile(path.join(publicDir, "index.html")));

const errors: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof InputError) return void response.status(error.status).json({ success: false, message: error.message });
  if (error?.code === "ER_DUP_ENTRY") return void response.status(409).json({ success: false, message: "Bu ad veya kayıt zaten kullanılıyor" });
  if (error?.code === "ER_NO_REFERENCED_ROW_2") return void response.status(400).json({ success: false, message: "İlişkili kayıt bulunamadı" });
  if (error?.code === "ER_ROW_IS_REFERENCED_2") return void response.status(409).json({ success: false, message: "Bu kayıt başka bir tabloda kullanılıyor" });
  console.error(error);
  response.status(500).json({ success: false, message: "Sunucu işlemi tamamlayamadı" });
};
app.use(errors);

initDatabase().then(() => app.listen(port, () => console.log(`Güzel Teknoloji API http://localhost:${port}`)))
  .catch(error => { console.error("Veritabanı başlatılamadı", error); process.exitCode = 1; });
