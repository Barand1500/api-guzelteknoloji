import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import type {
  CallbackResult,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
  ReversePaymentInput,
  ReversePaymentResult,
} from '../types.js';

/**
 * Halk Öde (Halkode) paySmart3D — referans halkode.adapter.js
 * API JSON POST → HTML döner; form alanları değil html belgesi kullanılır.
 *
 * POS alan eşlemesi (eski degerler):
 * merchantId = Üye İşyeri Anahtarı (merchant_key)
 * securityKey = Uygulama Parolası (app_secret)
 * terminalSafeId = Uygulama Anahtarı (app_id / token)
 * terminalPassword = Uygulama İşyeri ID (opsiyonel)
 */

const PAY_SMART_3D_URL = 'https://app.halkode.com.tr/ccpayment/api/paySmart3D';
const HALKODE_TOKEN_URL = 'https://app.halkode.com.tr/ccpayment/api/token';
const HALKODE_REFUND_URL = 'https://app.halkode.com.tr/ccpayment/api/refund';

async function halkodeTokenAl(appKey: string, appSecret: string): Promise<string> {
  const response = await fetch(HALKODE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appKey, app_secret: appSecret }),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await response.json().catch(() => null)) as {
    data?: { token?: string };
    status_description?: string;
  } | null;
  if (!response.ok) throw new Error(`Halk Öde token alınamadı: ${response.status}`);
  const token = data?.data?.token;
  if (!token) throw new Error(data?.status_description || 'Halk Öde token alınamadı');
  return token;
}

function generateHashKey(
  total: string,
  installment: string,
  currencyCode: string,
  merchantKey: string,
  invoiceId: string,
  appSecret: string,
): string {
  const data = `${total}|${installment}|${currencyCode}|${merchantKey}|${invoiceId}`;
  const iv = randomBytes(16).toString('hex').slice(0, 16);
  const password = createHash('sha1').update(appSecret, 'utf8').digest('hex');
  const salt = randomBytes(4).toString('hex').slice(0, 4);
  const saltWithPassword = createHash('sha256').update(password + salt, 'utf8').digest('hex');
  // PHP openssl_encrypt pratikte 32 byte anahtar kullanır
  const key = Buffer.from(saltWithPassword.slice(0, 32), 'utf8');
  const cipher = createCipheriv('aes-256-cbc', key, Buffer.from(iv, 'utf8'));
  let encrypted = cipher.update(data, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return `${iv}:${salt}:${encrypted}`.replaceAll('/', '__');
}

export function looksLikeHalkode(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
  apiUrl?: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.apiUrl || ''} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return (
    blob.includes('halkode') ||
    blob.includes('halk öde') ||
    blob.includes('halk ode') ||
    pos.infrastructureId === 'infra-halkode'
  );
}

export const halkodeGateway: PaymentGateway = {
  id: 'halkode',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const merchantKey = input.pos.merchantId.trim();
    const appSecret = input.pos.securityKey.trim();
    if (!merchantKey || !appSecret) {
      return {
        kind: 'error',
        message: 'Halk Öde: üye işyeri anahtarı / uygulama parolası eksik (Sanal POS Tanımı)',
      };
    }
    if (!/^\d{15,16}$/.test(input.card.number)) {
      return { kind: 'error', message: 'Kart numarası geçersiz' };
    }
    if (!/^\d{4}$/.test(input.card.expiry)) {
      return { kind: 'error', message: 'Son kullanma MMYY olmalı' };
    }
    if (!/^\d{3,4}$/.test(input.card.cvc)) {
      return { kind: 'error', message: 'CVC geçersiz' };
    }

    const ay = input.card.expiry.slice(0, 2);
    const yil = input.card.expiry.slice(2, 4);
    const installmentsNumber = String(Math.max(1, input.installment));
    const total = input.amount.toFixed(2);
    const currencyCode = 'TRY';
    // Callback’te odemeNo eşleşsin diye invoice_id = orderId (max 32)
    const invoiceId = input.orderId.slice(0, 32);
    const adSoyad = (input.card.holder || '').trim() || 'Müşteri';
    const adParca = adSoyad.split(/\s+/).filter(Boolean);
    const name = adParca[0] || adSoyad;
    const surname = adParca.slice(1).join(' ') || name;
    const returnUrl = input.okUrl;

    const payload = {
      cc_holder_name: adSoyad,
      cc_no: input.card.number,
      expiry_month: ay,
      expiry_year: yil,
      cvv: input.card.cvc,
      currency_code: currencyCode,
      installments_number: installmentsNumber,
      invoice_id: invoiceId,
      invoice_description: 'Cari Ödeme',
      total,
      merchant_key: merchantKey,
      items: JSON.stringify([
        { name: 'Cari Ödeme', price: total, quantity: 1, description: 'Cari Ödeme' },
      ]),
      name,
      surname,
      hash_key: generateHashKey(
        total,
        installmentsNumber,
        currencyCode,
        merchantKey,
        invoiceId,
        appSecret,
      ),
      return_url: returnUrl,
      cancel_url: input.failUrl || returnUrl,
      transaction_type: 'Auth',
    };

    let response: Response;
    try {
      response = await fetch(PAY_SMART_3D_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/html,application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      return { kind: 'error', message: 'Halk Öde servisine ulaşılamadı' };
    }

    const html = await response.text();
    if (!response.ok || !html.trim()) {
      return {
        kind: 'error',
        message: `Halk Öde isteği başarısız: ${response.status} ${html.slice(0, 200)}`,
      };
    }

    return {
      kind: 'form',
      adapter: this.id,
      form: {
        // FE html varsa document.write kullanır; actionUrl yedek
        actionUrl: PAY_SMART_3D_URL,
        method: 'POST',
        fields: {},
        html,
      },
    };
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const mdStatus = (raw.md_status || '').trim();
    const paymentStatus = (raw.payment_status || '').trim();
    const basarili = (mdStatus === '1') && (paymentStatus === '1');
    const orderId =
      raw.invoice_id || raw.invoiceId || raw.order_id || raw.orderId || '';

    const invoiceId = (raw.invoice_id || raw.invoiceId || '').trim();
    return {
      orderId,
      success: basarili,
      responseCode: paymentStatus || mdStatus,
      message: basarili
        ? 'Başarılı'
        : raw.status_description ||
          raw.error ||
          raw.ErrMsg ||
          raw.error_message ||
          raw.message ||
          'İşlem başarısız',
      raw: {
        ...raw,
        AuthCode: raw.auth_code || raw.authCode || '',
        // reverse invoice_id ile gider
        Rrn: invoiceId,
        HostRefNum: invoiceId,
        invoice_id: invoiceId,
      },
      needsProvision: false,
    };
  },

  /**
   * iptal + iade aynı refund API — referans halkode.adapter.js
   * POS: merchantId=merchant_key, terminalSafeId=app_id, securityKey=app_secret
   */
  async reverse(input: ReversePaymentInput): Promise<ReversePaymentResult> {
    const merchantKey = input.pos.merchantId.trim();
    const appKey = input.pos.terminalSafeId.trim();
    const appSecret = input.pos.securityKey.trim();
    const invoiceId = (input.referenceCode || input.bankOrderId || input.orderId || '').trim();
    const amount = Number(input.amount || 0).toFixed(2);

    if (!merchantKey || !appSecret) {
      return { success: false, message: 'Halk Öde iptal/iade: merchant_key / app_secret eksik' };
    }
    if (!appKey) {
      return {
        success: false,
        message: 'Halk Öde iptal/iade: Uygulama Anahtarı (app_id) eksik — Terminal Safe ID',
      };
    }
    if (!invoiceId) {
      return { success: false, message: 'Halk Öde iptal/iade: invoice_id bulunamadı' };
    }

    try {
      const token = await halkodeTokenAl(appKey, appSecret);
      const response = await fetch(HALKODE_REFUND_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          invoice_id: invoiceId,
          merchant_key: merchantKey,
          amount,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await response.json().catch(() => null)) as {
        status_code?: number;
        status_description?: string;
        message?: string;
        order_no?: string;
        ref_number?: string;
        invoice_id?: string;
      } | null;
      if (!response.ok) {
        return {
          success: false,
          message: `Halk Öde refund isteği başarısız: ${response.status}`,
          raw: data,
        };
      }
      const ok = Number(data?.status_code) === 100;
      return {
        success: ok,
        message: ok
          ? 'Başarılı'
          : data?.status_description || data?.message || 'Halk Öde işlemi başarısız',
        responseCode: data?.status_code != null ? String(data.status_code) : undefined,
        authCode: data?.ref_number || undefined,
        referenceCode: data?.invoice_id || invoiceId,
        raw: data,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Halk Öde iptal/iade başarısız',
      };
    }
  },
};
