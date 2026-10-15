import mysql, { type Connection } from "mysql2/promise";
import type { PosCredentials } from "./types.js";
import { looksLikeAkbankV2 } from "./adapters/akbankV2.js";
import { looksLikeGaranti } from "./adapters/garanti.js";
import { looksLikeVakifBank } from "./adapters/vakifbank.js";

export type TenantDatabaseConfig = {
  companyId: string;
  companyName: string;
  domain: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
};

export async function openTenantDatabase(config: TenantDatabaseConfig): Promise<Connection> {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectTimeout: 8000,
    charset: "utf8mb4",
    multipleStatements: false,
  });
}

const norm = (value: unknown) => String(value || "")
  .toLocaleLowerCase("tr-TR")
  .replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]/g, "");

function preferredSecurityType(posType: string, bankTypes: string) {
  const parts = [posType, ...bankTypes.split(/[,;]+/)].map((s) => s.trim()).filter(Boolean);
  const normalized = (value: string) => value.toUpperCase().replace(/[\s-]+/g, "_");
  const preferred = ["3D_PAY", "3DPAY", "3D_PAY_HOSTING", "3D_HOST", "3DHOST", "3D_OOS_PAY", "3D_OOS", "3D_FULL", "3D_HALF", "3D"];
  for (const candidate of preferred) {
    const hit = parts.find((value) => {
      const current = normalized(value);
      return current === candidate || current.replace(/_/g, "") === candidate.replace(/_/g, "");
    });
    if (hit) return hit;
  }
  return parts[0] || "";
}

export async function resolveTenantPos(connection: Connection, requestedBankName: string) {
  const [bankRows] = await connection.query<any[]>(
    `SELECT id,adi,kisa_adi,guvenlik_tipleri,sanal_pos_3d_url,sanal_pos_api_url,sanal_pos_xml_url
     FROM bankalar WHERE (remove IS NULL OR remove=0)`,
  );
  const wanted = norm(requestedBankName);
  const exact = bankRows.filter((row) => norm(row.adi) === wanted || norm(row.kisa_adi) === wanted);
  const matches = exact.length ? exact : bankRows.filter((row) => {
    const name = norm(row.adi);
    const shortName = norm(row.kisa_adi);
    return wanted && (name.includes(wanted) || wanted.includes(name) || shortName.includes(wanted) || wanted.includes(shortName));
  });
  if (matches.length !== 1) throw new Error(matches.length ? "bank-match-ambiguous" : "bank-match-missing");
  let bank = matches[0];
  const findActivePos = async (bankId: number) => {
    const [rows] = await connection.query<any[]>(
      `SELECT id,pos_adi,altyapi_kodu,isyeri_no,terminal_safe_id,guvenlik_anahtari,terminal_sifresi,guvenlik_tipi
       FROM sanal_pos_tanimlari
       WHERE banka_id=? AND aktif=1 AND (remove IS NULL OR remove=0)
       ORDER BY varsayilan DESC,id ASC LIMIT 1`,
      [bankId],
    );
    return rows[0] as Record<string, any> | undefined;
  };
  let pos = await findActivePos(Number(bank.id));
  if (!pos) {
    const [redirects] = await connection.query<any[]>(
      "SELECT yonlenen_banka_id FROM ortak_sanal_pos WHERE banka_id=? AND aktif=1 AND (remove IS NULL OR remove=0) ORDER BY id ASC LIMIT 1",
      [bank.id],
    );
    const redirectId = Number(redirects[0]?.yonlenen_banka_id);
    if (redirectId) {
      const redirected = bankRows.find((row) => Number(row.id) === redirectId);
      if (redirected) {
        const redirectedPos = await findActivePos(redirectId);
        if (redirectedPos) { bank = redirected; pos = redirectedPos; }
      }
    }
  }
  if (!pos) {
    const [defaults] = await connection.query<any[]>(
      `SELECT banka_id FROM sanal_pos_tanimlari
       WHERE aktif=1 AND varsayilan=1 AND (remove IS NULL OR remove=0)
       ORDER BY id ASC LIMIT 1`,
    );
    if (defaults[0]?.banka_id) {
      const defaultBank = bankRows.find((row) => Number(row.id) === Number(defaults[0].banka_id));
      const defaultPos = await findActivePos(Number(defaults[0].banka_id));
      if (defaultBank && defaultPos) { bank = defaultBank; pos = defaultPos; }
    }
  }
  if (!pos) throw new Error("pos-missing");
  const credentials: PosCredentials = {
    bankId: Number(bank.id),
    bankName: String(bank.adi || bank.kisa_adi || "Banka"),
    posId: Number(pos.id),
    posName: String(pos.pos_adi || ""),
    infrastructureId: String(pos.altyapi_kodu || ""),
    merchantId: String(pos.isyeri_no || "").trim(),
    terminalSafeId: String(pos.terminal_safe_id || "").trim(),
    securityKey: String(pos.guvenlik_anahtari || "").trim(),
    terminalPassword: String(pos.terminal_sifresi || "").trim(),
    securityType: preferredSecurityType(String(pos.guvenlik_tipi || ""), String(bank.guvenlik_tipleri || "")),
    gateway3dUrl: String(bank.sanal_pos_3d_url || "").trim(),
    apiUrl: String(bank.sanal_pos_api_url || "").trim(),
    xmlUrl: String(bank.sanal_pos_xml_url || "").trim(),
  };
  if (!credentials.merchantId || !credentials.securityKey || !credentials.gateway3dUrl) {
    throw new Error("pos-credentials-incomplete");
  }
  if ((looksLikeAkbankV2(credentials) || looksLikeVakifBank(credentials)) && !credentials.terminalSafeId) {
    throw new Error("pos-terminal-missing");
  }
  if (looksLikeGaranti(credentials) && (!credentials.terminalSafeId || !credentials.terminalPassword)) {
    throw new Error("pos-garanti-credentials-incomplete");
  }
  return credentials;
}
