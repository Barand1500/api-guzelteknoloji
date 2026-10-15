import { randomUUID } from "node:crypto";
import type { Connection } from "mysql2/promise";
import { InputError } from "../categories.js";
import { pool } from "../database.js";
import { tenantDatabaseForApiKeyId } from "../tahsilatAdminService.js";
import { paymentGatewayById, selectPaymentGateway } from "./adapters/index.js";
import { openTenantDatabase, resolveTenantPos } from "./tenantPos.js";
import type { CallbackResult, Initiate3dInput } from "./types.js";

let sessionsReady: Promise<void> | null = null;
async function ensureSessions() {
  if (!sessionsReady) {
    sessionsReady = pool.query(`CREATE TABLE IF NOT EXISTS api_payment_sessions (
      id CHAR(36) PRIMARY KEY,
      api_key_id CHAR(36) NOT NULL,
      order_id VARCHAR(255) NOT NULL,
      bank_name VARCHAR(255) NOT NULL,
      adapter_id VARCHAR(64) NOT NULL,
      pos_id BIGINT UNSIGNED NOT NULL,
      amount DECIMAL(20,6) NOT NULL,
      currency_code VARCHAR(12) NOT NULL,
      installment SMALLINT UNSIGNED NOT NULL,
      istek_no VARCHAR(255) NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'pending',
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_payment_session_order (order_id),
      INDEX idx_payment_session_expiry (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`).then(() => undefined).catch((error) => {
      sessionsReady = null;
      throw error;
    });
  }
  await sessionsReady;
}

function safeText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

export type StartPaymentInput = {
  orderId: string;
  bankName: string;
  amount: number;
  currencyCode: string;
  installment: number;
  card: { number: string; holder: string; expiry: string; cvc: string };
  clientIp?: string;
  email?: string;
  istekNo?: string;
};

export async function startTenantPayment(apiKeyId: string, input: StartPaymentInput, callbackBase: string) {
  const orderId = safeText(input.orderId, 255);
  const bankName = safeText(input.bankName, 255);
  const digits = safeText(input.card?.number, 32).replace(/\D/g, "");
  const expiry = safeText(input.card?.expiry, 8).replace(/\D/g, "");
  const cvc = safeText(input.card?.cvc, 8).replace(/\D/g, "");
  const amount = Number(input.amount);
  const installment = Math.trunc(Number(input.installment) || 1);
  if (!orderId || !bankName || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new InputError("Geçerli ödeme bilgileri gerekli");
  }
  if (digits.length < 15 || digits.length > 16 || expiry.length !== 4 || cvc.length < 3 || cvc.length > 4) {
    throw new InputError("Kart bilgileri geçersiz");
  }
  if (installment < 1 || installment > 36) throw new InputError("Taksit sayısı geçersiz");
  if (!/^[a-zA-Z0-9]{3,12}$/.test(safeText(input.currencyCode, 12))) throw new InputError("Para birimi geçersiz");

  const company = await tenantDatabaseForApiKeyId(apiKeyId);
  let tenant: Connection | null = null;
  try {
    tenant = await openTenantDatabase(company);
    const pos = await resolveTenantPos(tenant, bankName);
    const gateway = selectPaymentGateway(pos);
    if (!gateway) throw new InputError("Bu POS altyapısı merkezi ödeme hizmetinde desteklenmiyor", 422);
    const sessionId = randomUUID();
    const callback = `${callbackBase.replace(/\/$/, "")}/payments/callback/${sessionId}`;
    const gatewayInput: Initiate3dInput = {
      pos,
      orderId,
      amount,
      currencyCode: safeText(input.currencyCode, 12).toUpperCase(),
      installment,
      card: { number: digits, holder: safeText(input.card.holder, 255), expiry, cvc },
      okUrl: `${callback}?outcome=ok`,
      failUrl: `${callback}?outcome=fail`,
      clientIp: safeText(input.clientIp, 64) || undefined,
      email: safeText(input.email, 255) || undefined,
    };
    const result = await gateway.initiate3d(gatewayInput);
    if (result.kind === "error") throw new InputError(result.message, 422);
    await ensureSessions();
    await pool.query(
      `INSERT INTO api_payment_sessions
       (id,api_key_id,order_id,bank_name,adapter_id,pos_id,amount,currency_code,installment,istek_no,expires_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL 45 MINUTE))`,
      [sessionId, apiKeyId, orderId, pos.bankName, gateway.id, pos.posId, amount,
        safeText(input.currencyCode, 12).toUpperCase(), installment, safeText(input.istekNo, 255) || null],
    );
    console.info(`[central-payment] company=${company.companyId} stage=3ds-initiation result=form-ready adapter=${gateway.id}`);
    return { sessionId, adapter: gateway.id, bankId: pos.bankId, posId: pos.posId, bankName: pos.bankName, form: result.form };
  } catch (error) {
    if (error instanceof InputError) throw error;
    console.error(`[central-payment] company=${company.companyId} stage=3ds-initiation result=error`);
    throw new InputError("Merkezi ödeme başlatılamadı", 502);
  } finally {
    await tenant?.end().catch(() => undefined);
  }
}

function stringBody(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "")]));
}

function companyOrigin(domain: string) {
  const raw = domain.includes("://") ? domain : `https://${domain}`;
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("invalid-company-domain");
  return url.origin;
}

export async function completeTenantPayment(sessionId: string, outcome: "ok" | "fail", body: Record<string, unknown>) {
  await ensureSessions();
  const [rows] = await pool.query<any[]>("SELECT * FROM api_payment_sessions WHERE id=? LIMIT 1", [sessionId]);
  const session = rows[0];
  if (!session) throw new InputError("Ödeme oturumu bulunamadı", 404);
  const company = await tenantDatabaseForApiKeyId(String(session.api_key_id));
  let tenant: Connection | null = null;
  let claimed = false;
  try {
    tenant = await openTenantDatabase(company);
    // If the bank reports late, still process a cryptographically valid callback; dropping it
    // could leave a captured payment permanently pending in the tenant ledger.
    if (session.status === "pending") {
      const pos = await resolveTenantPos(tenant, String(session.bank_name));
      if (Number(pos.posId) !== Number(session.pos_id)) throw new InputError("Ödeme POS tanımı değişmiş; callback güvenli şekilde durduruldu", 409);
      const gateway = paymentGatewayById(String(session.adapter_id));
      if (!gateway) throw new InputError("Ödeme adapter'ı artık kullanılamıyor", 503);
      const parsed: CallbackResult = gateway.parseCallback(stringBody(body), pos.securityKey || pos.terminalPassword);
      if (parsed.orderId && parsed.orderId !== String(session.order_id)) {
        throw new InputError("Banka callback sipariş numarası eşleşmedi", 400);
      }
      const [claim] = await pool.query<any>(
        "UPDATE api_payment_sessions SET status='processing' WHERE id=? AND status='pending'",
        [sessionId],
      );
      if (!claim.affectedRows) {
        const origin = companyOrigin(company.domain);
        const target = session.istek_no
          ? `${origin}/pay/${encodeURIComponent(String(session.istek_no))}`
          : `${origin}/hareketler`;
        return { target, status: String(session.status) };
      }
      claimed = true;
      let verified = parsed;
      if (outcome === "ok" && parsed.success && parsed.needsProvision && gateway.finalizeCallback) {
        try {
          verified = await gateway.finalizeCallback({ body, pos, orderId: String(session.order_id) });
        } catch {
          verified = { ...parsed, success: false, needsProvision: false, message: "Provizyon tamamlanamadı" };
        }
      }
      const success = outcome === "ok" && verified.success && !verified.needsProvision;
      const summary = JSON.stringify({
        adapter: gateway.id,
        at: new Date().toISOString(),
        responseCode: safeText(verified.responseCode, 80),
        message: safeText(verified.message, 500),
        hashOk: Boolean(verified.success),
        needsProvision: Boolean(verified.needsProvision),
      });
      const [paymentRows] = await tenant.query<any[]>(
        "SELECT id,tutar FROM odemeler WHERE odeme_no=? AND durum=3 LIMIT 2",
        [String(session.order_id)],
      );
      if (paymentRows.length !== 1) throw new InputError("Ödeme kaydı tekil ve bekleyen durumda bulunamadı", 409);
      const [updated] = await tenant.execute<any>(
        `UPDATE odemeler SET durum=?, banka_cevabi=?, bank_error=?, tarih=IF(?=1,NOW(),tarih)
         WHERE odeme_no=? AND durum=3`,
        [success ? 1 : 0, summary, success ? null : safeText(verified.message || "Ödeme doğrulanamadı", 2000), success ? 1 : 0, String(session.order_id)],
      );
      if (!updated.affectedRows) throw new InputError("Ödeme kaydı bekleyen durumda bulunamadı", 409);
      if (success && session.istek_no) {
        await tenant.execute(
          `UPDATE odeme_istekleri SET durum=1, odeme_zamani=NOW(), tutar=?
           WHERE istek_no=? AND durum=0 AND (remove IS NULL OR remove=0)`,
          [Number(paymentRows[0].tutar), String(session.istek_no)],
        );
      }
      await pool.query("UPDATE api_payment_sessions SET status=? WHERE id=? AND status='processing'", [success ? "success" : "failure", sessionId]);
      claimed = false;
      console.info(`[central-payment] company=${company.companyId} stage=callback result=${success ? "success" : "failure"} adapter=${gateway.id}`);
    }
    const origin = companyOrigin(company.domain);
    const target = session.istek_no
      ? `${origin}/pay/${encodeURIComponent(String(session.istek_no))}`
      : `${origin}/hareketler`;
    return { target, status: String(session.status) };
  } catch (error) {
    if (claimed) {
      await pool.query("UPDATE api_payment_sessions SET status='review' WHERE id=? AND status='processing'", [sessionId]).catch(() => undefined);
    }
    if (error instanceof InputError) throw error;
    console.error(`[central-payment] company=${company.companyId} stage=callback result=error`);
    throw new InputError("Ödeme callback işlemi tamamlanamadı", 502);
  } finally {
    await tenant?.end().catch(() => undefined);
  }
}
