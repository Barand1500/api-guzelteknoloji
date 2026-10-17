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

/**
 * A modeli — ödeme motoru (yalnızca AnyPay Api Ayarları remote iken çağrılır).
 * - POS credential: firma tenant DB (AnyPay verisi)
 * - 3DS / banka I/O: bu API sunucusu (A)
 * - Kalıcı ödeme kaydı: AnyPay createPayment (B) yazar; burada sadece session
 * Local AnyPay yolu buraya uğramaz; Api kapalıysa bu fonksiyon hiç çağrılmaz.
 */
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
    // A sözleşmesi: AnyPay önce odeme (durum=3) yazar, sonra burayı çağırır.
    // Kayıt yokken bankaya gitme — callback'te satır bulunamaz.
    const [pendingPayments] = await tenant.query<any[]>(
      "SELECT id FROM odemeler WHERE odeme_no=? AND durum=3 LIMIT 2",
      [orderId],
    );
    if (pendingPayments.length !== 1) {
      throw new InputError(
        "Bekleyen ödeme kaydı bulunamadı. Önce AnyPay tarafında kayıt oluşturulmalı.",
        409,
      );
    }
    // Aynı odeme_no için ikinci canlı 3DS oturumu açma (çift tahsilat riski)
    await ensureSessions();
    const [liveSessions] = await pool.query<any[]>(
      `SELECT id FROM api_payment_sessions
       WHERE order_id=? AND status IN ('pending','processing') AND expires_at > NOW()
       LIMIT 1`,
      [orderId],
    );
    if (liveSessions.length > 0) {
      throw new InputError("Bu ödeme için zaten devam eden bir 3D oturumu var", 409);
    }
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

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Firma domain → güvenli origin (sadece https; localhost için http) */
function resolveCompanyOrigin(domain: string): string {
  const trimmed = String(domain || "").trim();
  if (!trimmed || trimmed.length > 255) {
    throw new InputError("Firma domain geçersiz", 503);
  }
  let url: URL;
  try {
    url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  } catch {
    throw new InputError("Firma domain geçersiz", 503);
  }
  const host = url.hostname.toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new InputError("Firma domain https olmalıdır", 503);
  }
  if (url.username || url.password) {
    throw new InputError("Firma domain geçersiz", 503);
  }
  // Yalnızca origin — path/query ile açık yönlendirme yok
  return url.origin;
}

/**
 * Callback sonrası AnyPay'e dönüş.
 * Sadece bilinen relative yollar: /pay/:istekNo veya /hareketler
 */
function resolveReturnTarget(origin: string, istekNo: unknown): string {
  const token = safeText(istekNo, 255);
  if (token && /^[a-zA-Z0-9_-]+$/.test(token)) {
    return `${origin}/pay/${encodeURIComponent(token)}`;
  }
  return `${origin}/hareketler`;
}

/**
 * Merkez 3DS callback (Api AÇIK yolu).
 * Yerel AnyPay /api/payments/3d/* buraya gelmez — sadece merkezi session UUID.
 */
export async function completeTenantPayment(sessionId: string, outcome: "ok" | "fail", body: Record<string, unknown>) {
  const id = String(sessionId || "").trim();
  if (!SESSION_UUID_RE.test(id)) {
    throw new InputError("Ödeme oturumu geçersiz", 400);
  }
  await ensureSessions();
  const [rows] = await pool.query<any[]>("SELECT * FROM api_payment_sessions WHERE id=? LIMIT 1", [id]);
  const session = rows[0];
  if (!session) throw new InputError("Ödeme oturumu bulunamadı", 404);
  const company = await tenantDatabaseForApiKeyId(String(session.api_key_id));
  const origin = resolveCompanyOrigin(company.domain);
  let tenant: Connection | null = null;
  let claimed = false;
  try {
    tenant = await openTenantDatabase(company);
    // Geç gelen banka callback'i de işlenir; aksi halde tahsilat tenant'ta asılı kalır.
    if (session.status === "pending") {
      const pos = await resolveTenantPos(tenant, String(session.bank_name));
      if (Number(pos.posId) !== Number(session.pos_id)) throw new InputError("Ödeme POS tanımı değişmiş; callback güvenli şekilde durduruldu", 409);
      const gateway = paymentGatewayById(String(session.adapter_id));
      if (!gateway) throw new InputError("Ödeme adapter'ı artık kullanılamıyor", 503);
      const parsed: CallbackResult = gateway.parseCallback(stringBody(body), pos.securityKey || pos.terminalPassword);
      // Adamlar URL’de odemeNo kullanır; YK xid = odemeNo+pad → startsWith kabul
      if (parsed.orderId) {
        const sessionOrder = String(session.order_id);
        const bankOrder = String(parsed.orderId);
        const orderOk =
          bankOrder === sessionOrder ||
          (sessionOrder.length >= 8 && bankOrder.startsWith(sessionOrder)) ||
          (bankOrder.length >= 8 && sessionOrder.startsWith(bankOrder));
        if (!orderOk) {
          throw new InputError("Banka callback sipariş numarası eşleşmedi", 400);
        }
      }
      const [claim] = await pool.query<any>(
        "UPDATE api_payment_sessions SET status='processing' WHERE id=? AND status='pending'",
        [id],
      );
      if (!claim.affectedRows) {
        // Başka worker aldı — güncel status ile güvenli dönüş
        const [fresh] = await pool.query<any[]>("SELECT status FROM api_payment_sessions WHERE id=? LIMIT 1", [id]);
        return {
          target: resolveReturnTarget(origin, session.istek_no),
          status: String(fresh[0]?.status || session.status),
        };
      }
      claimed = true;
      let verified = parsed;

      // PayTR (adamlar callback beklemede): kullanıcı dönüşü — bildirim+hash gelene kadar durum=3
      if (parsed.awaitingExternalConfirm) {
        const awaitSummary = JSON.stringify({
          source: "central",
          adapter: gateway.id,
          at: new Date().toISOString(),
          responseCode: safeText(parsed.responseCode, 80),
          message: safeText(parsed.message || "Banka bildirimi bekleniyor", 500),
          awaitingExternalConfirm: true,
          bankOrderId: safeText(parsed.orderId || session.order_id, 255) || undefined,
        });
        await tenant.execute(
          `UPDATE odemeler SET banka_cevabi=?, bank_error=? WHERE odeme_no=? AND durum=3`,
          [awaitSummary, "Banka bildirimi bekleniyor", String(session.order_id)],
        );
        // Oturumu pending'e geri al — bildirim (hash) aynı session URL ile gelsin
        await pool.query(
          "UPDATE api_payment_sessions SET status='pending' WHERE id=? AND status='processing'",
          [id],
        );
        claimed = false;
        console.info(
          `[central-payment] company=${company.companyId} stage=callback result=awaiting-notify adapter=${gateway.id}`,
        );
        return {
          target: resolveReturnTarget(origin, session.istek_no),
          status: "pending",
        };
      }

      if (outcome === "ok" && parsed.success && parsed.needsProvision && gateway.finalizeCallback) {
        try {
          verified = await gateway.finalizeCallback({
            body,
            pos,
            orderId: String(session.order_id),
            amount: Number(session.amount) || undefined,
          });
        } catch {
          verified = { ...parsed, success: false, needsProvision: false, message: "Provizyon tamamlanamadı" };
        }
      }
      // needsProvision kaldıysa (finalize yok) — başarısız yazma; adamlar 3D_PAY/finalize modeli
      if (verified.needsProvision) {
        verified = {
          ...verified,
          success: false,
          needsProvision: false,
          message: verified.message || "3D doğrulandı ancak provizyon tamamlanamadı",
        };
      }
      // Banka failUrl’e basmış olsa bile parse kesin başarıysa (00/Approved) kabul
      const strongOk =
        verified.success &&
        (verified.responseCode === "00" ||
          verified.responseCode === "000" ||
          verified.message === "Approved");
      const success =
        verified.success &&
        !verified.needsProvision &&
        (outcome === "ok" || strongOk);
      const authCode =
        verified.raw?.AuthCode ||
        verified.raw?.authCode ||
        verified.raw?.OnayKodu ||
        "";
      const referenceCode =
        verified.raw?.hostlogkey ||
        verified.raw?.HostRefNum ||
        verified.raw?.hostrefnum ||
        verified.raw?.Rrn ||
        verified.raw?.HostReferenceNumber ||
        verified.raw?.paymentId ||
        verified.raw?.TransId ||
        "";
      const summary = JSON.stringify({
        source: "central",
        adapter: gateway.id,
        at: new Date().toISOString(),
        responseCode: safeText(verified.responseCode, 80),
        message: safeText(verified.message, 500),
        hashOk: Boolean(verified.success),
        needsProvision: Boolean(verified.needsProvision),
        bankOrderId: safeText(verified.orderId || session.order_id, 255) || undefined,
        authCode: safeText(authCode, 80) || undefined,
        referenceCode: safeText(referenceCode, 120) || undefined,
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
      await pool.query("UPDATE api_payment_sessions SET status=? WHERE id=? AND status='processing'", [success ? "success" : "failure", id]);
      claimed = false;
      // AnyPay Log Kayıtları — ameliyat sonrası teşhis (merkezi mi, ne oldu)
      const logText = success
        ? `Ödeme - Merkezi API · BAŞARILI · #${session.order_id} · adapter=${gateway.id} · callback`
        : `Ödeme - Merkezi API HATA · #${session.order_id} · ${safeText(verified.message || "Ödeme doğrulanamadı", 400)} · adapter=${gateway.id}`;
      await tenant
        .execute("INSERT INTO log (kullanici_id, tarih, islem) VALUES (NULL, NOW(), ?)", [logText.slice(0, 65000)])
        .catch(() => undefined);
      console.info(`[central-payment] company=${company.companyId} stage=callback result=${success ? "success" : "failure"} adapter=${gateway.id}`);
      return {
        target: resolveReturnTarget(origin, session.istek_no),
        status: success ? "success" : "failure",
      };
    }
    // Zaten sonuçlanmış oturum — tekrar yazmadan AnyPay'e dön
    return {
      target: resolveReturnTarget(origin, session.istek_no),
      status: String(session.status),
    };
  } catch (error) {
    if (claimed) {
      await pool.query("UPDATE api_payment_sessions SET status='review' WHERE id=? AND status='processing'", [id]).catch(() => undefined);
    }
    if (error instanceof InputError) throw error;
    console.error(`[central-payment] company=${company.companyId} stage=callback result=error`);
    throw new InputError("Ödeme callback işlemi tamamlanamadı", 502);
  } finally {
    await tenant?.end().catch(() => undefined);
  }
}

export type ReversePaymentBody = {
  orderId: string;
  kind: "void" | "refund";
  amount?: number;
  referenceCode?: string;
  bankOrderId?: string;
  clientIp?: string;
};

/**
 * Merkezi iptal/iade — tenant POS + adapter.reverse.
 * AnyPay reversePayment (source=central) burayı çağırır.
 */
export async function reverseTenantPayment(apiKeyId: string, input: ReversePaymentBody) {
  const orderId = safeText(input.orderId, 255);
  const kind = input.kind === "refund" ? "refund" : "void";
  if (!orderId) throw new InputError("orderId gerekli", 400);

  await ensureSessions();
  const [sessions] = await pool.query<any[]>(
    `SELECT * FROM api_payment_sessions
     WHERE api_key_id=? AND order_id=? AND status='success'
     ORDER BY created_at DESC LIMIT 1`,
    [apiKeyId, orderId],
  );
  const session = sessions[0];
  if (!session) throw new InputError("Başarılı ödeme oturumu bulunamadı", 404);

  const company = await tenantDatabaseForApiKeyId(String(session.api_key_id));
  let tenant: Connection | null = null;
  try {
    tenant = await openTenantDatabase(company);
    const pos = await resolveTenantPos(tenant, String(session.bank_name));
    if (Number(pos.posId) !== Number(session.pos_id)) {
      throw new InputError("Ödeme POS tanımı değişmiş; iptal/iade durduruldu", 409);
    }
    const gateway = paymentGatewayById(String(session.adapter_id));
    if (!gateway?.reverse) {
      throw new InputError(
        `Bu adapter (${session.adapter_id}) için merkezi iptal/iade desteklenmiyor`,
        422,
      );
    }
    const result = await gateway.reverse({
      pos,
      orderId,
      kind,
      amount: input.amount != null ? Number(input.amount) : Number(session.amount) || undefined,
      clientIp: safeText(input.clientIp, 64) || undefined,
      referenceCode: safeText(input.referenceCode, 120) || undefined,
      bankOrderId: safeText(input.bankOrderId, 255) || orderId,
    });
    console.info(
      `[central-payment] company=${company.companyId} stage=reverse kind=${kind} result=${result.success ? "ok" : "fail"} adapter=${gateway.id}`,
    );
    return {
      success: result.success,
      message: result.message,
      responseCode: result.responseCode,
      referenceCode: result.referenceCode,
      adapter: gateway.id,
    };
  } catch (error) {
    if (error instanceof InputError) throw error;
    console.error(`[central-payment] company=${company.companyId} stage=reverse result=error`);
    throw new InputError("Merkezi iptal/iade tamamlanamadı", 502);
  } finally {
    await tenant?.end().catch(() => undefined);
  }
}
