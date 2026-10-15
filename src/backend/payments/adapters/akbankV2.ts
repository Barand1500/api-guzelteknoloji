import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  CallbackResult,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
} from '../types.js';

/** Akbank V2 SecurePay — referans akbank.adapter.js (HMAC-SHA512, sabit hash sırası) */

const TXN_3D = '3000';
const SUCCESS_CODE = 'VPS-0000';
const PAYMENT_MODEL = '3D_PAY';

function hmacB64(data: string, secret: string): string {
  return createHmac('sha512', secret).update(data, 'utf8').digest('base64');
}

function random128(): string {
  return randomBytes(64).toString('hex');
}

function requestDateTime(): string {
  const d = new Date();
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2);
}

function currencyNumeric(code: string): string {
  const map: Record<string, string> = {
    TRY: '949',
    TL: '949',
    USD: '840',
    EUR: '978',
    GBP: '826',
    JPY: '392',
  };
  const u = code.toUpperCase();
  if (/^\d+$/.test(u)) return u;
  return map[u] ?? '949';
}

export const akbankV2Gateway: PaymentGateway = {
  id: 'akbank-v2',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const actionUrl = input.pos.gateway3dUrl.replace(/\/$/, '');

    if (!input.pos.merchantId || !input.pos.terminalSafeId || !input.pos.securityKey) {
      return { kind: 'error', message: 'Akbank POS kimlik bilgileri eksik' };
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

    const emailAddress = (input.email || '').trim();
    if (!emailAddress) {
      return { kind: 'error', message: 'Ödeme için e-posta bilgisi bulunamadı' };
    }

    const orderId = input.orderId;
    const amount = formatAmount(input.amount);
    const installCount = String(Math.max(1, input.installment));
    const currencyCode = currencyNumeric(input.currencyCode);
    const reward1 = '0.00';
    const reward2 = '0.00';
    const reward3 = '0.00';
    const randomNumber = random128();
    const reqDt = requestDateTime();
    const okUrl = input.okUrl;
    const failUrl = input.failUrl || okUrl;
    const cardNo = input.card.number;
    const expiredDate = input.card.expiry;
    const cvv = input.card.cvc;

    // Referans hash sırası (Object.values değil)
    const hashString =
      PAYMENT_MODEL +
      TXN_3D +
      input.pos.merchantId +
      input.pos.terminalSafeId +
      orderId +
      'TR' +
      amount +
      reward1 +
      reward2 +
      reward3 +
      currencyCode +
      installCount +
      okUrl +
      failUrl +
      emailAddress +
      cardNo +
      expiredDate +
      cvv +
      randomNumber +
      reqDt;

    const hash = hmacB64(hashString, input.pos.securityKey);

    const fields: Record<string, string> = {
      paymentModel: PAYMENT_MODEL,
      txnCode: TXN_3D,
      merchantSafeId: input.pos.merchantId,
      terminalSafeId: input.pos.terminalSafeId,
      orderId,
      lang: 'TR',
      amount,
      ccbRewardAmount: reward1,
      pcbRewardAmount: reward2,
      xcbRewardAmount: reward3,
      currencyCode,
      installCount,
      okUrl,
      failUrl,
      emailAddress,
      creditCard: cardNo,
      expiredDate,
      cvv,
      randomNumber,
      requestDateTime: reqDt,
      hash,
    };

    return {
      kind: 'form',
      adapter: this.id,
      form: { actionUrl, method: 'POST', fields },
    };
  },

  parseCallback(body: Record<string, unknown>, secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const orderId = raw.orderId || raw.OrderId || '';
    const responseCode = raw.responseCode || raw.ResponseCode || '';
    const responseMessage = (raw.responseMessage || raw.ResponseMessage || '').trim();
    const hashParams = raw.hashParams || '';
    const hash = raw.hash || '';

    let hashOk = false;
    if (hashParams && hash && secretKey) {
      const plain = hashParams
        .split('+')
        .filter(Boolean)
        .map((p) => raw[p] ?? '')
        .join('');
      const expected = hmacB64(plain, secretKey);
      try {
        const a = Buffer.from(expected);
        const b = Buffer.from(hash);
        hashOk = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        hashOk = false;
      }
    }

    // Referans: responseMessage BAŞARILI / SUCCESS; hash yoksa mesaja güven
    const msgOk =
      responseMessage === 'BAŞARILI' ||
      responseMessage === 'BASARILI' ||
      responseMessage.toUpperCase() === 'SUCCESS' ||
      responseCode === SUCCESS_CODE;

    const mdStatus = raw.mdStatus || '';
    const success =
      (hashOk || (!hashParams && msgOk)) &&
      msgOk &&
      (mdStatus === '' || mdStatus === '1');

    return {
      orderId,
      success,
      responseCode: responseCode || responseMessage,
      message:
        responseMessage ||
        raw.hostMessage ||
        (success ? '3D Secure başarılı' : '3D Secure başarısız'),
      raw,
      needsProvision: false,
    };
  },
};

/** URL / altyapı Akbank V2 mi? */
export function looksLikeAkbankV2(pos: {
  gateway3dUrl: string;
  apiUrl: string;
  infrastructureId: string;
  bankName: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.apiUrl} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return (
    blob.includes('akbank') ||
    blob.includes('virtualpospaymentgateway') ||
    /\/securepay\/?$/i.test(pos.gateway3dUrl.trim())
  );
}
