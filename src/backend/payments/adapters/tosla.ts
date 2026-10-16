import { createHash } from 'node:crypto';
import type {
  CallbackResult,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
  ReversePaymentInput,
  ReversePaymentResult,
} from '../types.js';

/**
 * Tosla — referans tosla.adapter.js
 * POS: merchantId=clientId, terminalSafeId=apiUser, securityKey=apiPass
 */

function istanbulTimeSpan(): string {
  const parts = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((x) => x.type === type)?.value || '';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

function toslaRnd(): string {
  return String(Math.floor(Math.random() * 900000000000) + 100000000000).slice(0, 24);
}

function toslaHash(opts: {
  apiPass: string;
  clientId: string;
  apiUser: string;
  rnd: string;
  timeSpan: string;
}): string {
  const hashString = `${opts.apiPass}${opts.clientId}${opts.apiUser}${opts.rnd}${opts.timeSpan}`;
  return createHash('sha512').update(hashString, 'utf8').digest('base64');
}

function baseUrlOf(pos: { gateway3dUrl: string; apiUrl: string }): string {
  const raw = (pos.gateway3dUrl || pos.apiUrl || 'https://entegrasyon.tosla.com/api/Payment/').trim();
  return raw.replace(/\/?$/, '/');
}

export function looksLikeTosla(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
  apiUrl?: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.apiUrl || ''} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return blob.includes('tosla') || pos.infrastructureId === 'infra-tosla';
}

export const toslaGateway: PaymentGateway = {
  id: 'tosla',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const clientId = input.pos.merchantId.trim();
    const apiUser = input.pos.terminalSafeId.trim();
    const apiPass = input.pos.securityKey.trim();
    if (!clientId || !apiUser || !apiPass) {
      return { kind: 'error', message: 'Tosla: Client ID / Api User / Api Pass eksik (Sanal POS)' };
    }
    if (!/^\d{15,16}$/.test(input.card.number)) {
      return { kind: 'error', message: 'Kart numarası geçersiz' };
    }
    if (!/^\d{4}$/.test(input.card.expiry)) {
      return { kind: 'error', message: 'Son kullanma MMYY olmalı' };
    }

    const baseUrl = baseUrlOf(input.pos);
    const amount = Math.round(input.amount * 100);
    const installmentCount = input.installment <= 1 ? 0 : input.installment;
    const rnd = toslaRnd();
    const timeSpan = istanbulTimeSpan();
    const orderId = String(input.orderId).slice(0, 20);
    const mm = input.card.expiry.slice(0, 2);
    const yy = input.card.expiry.slice(2, 4);
    const expireDate = `${mm}/${yy}`;

    const payload = {
      clientId: Number(clientId),
      apiUser,
      rnd,
      timeSpan,
      hash: toslaHash({ apiPass, clientId, apiUser, rnd, timeSpan }),
      callbackUrl: input.okUrl,
      orderId,
      amount,
      currency: 949,
      installmentCount,
      description: 'Cari Odeme',
      echo: input.orderId,
      extraParameters: '',
    };

    try {
      const response = await fetch(`${baseUrl}threeDPayment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(25_000),
      });
      const sessionResponse = (await response.json().catch(() => null)) as {
        Code?: number;
        code?: number;
        ThreeDSessionId?: string;
        threeDSessionId?: string;
      } | null;
      const code = Number(sessionResponse?.Code ?? sessionResponse?.code);
      const threeDSessionId =
        sessionResponse?.ThreeDSessionId || sessionResponse?.threeDSessionId || '';
      if (!response.ok || code !== 0 || !threeDSessionId) {
        return {
          kind: 'error',
          message: `Tosla ThreeDSessionId alınamadı: ${JSON.stringify(sessionResponse).slice(0, 300)}`,
        };
      }

      const actionUrl = `${baseUrl}ProcessCardForm`;
      const fields: Record<string, string> = {
        ThreeDSessionId: threeDSessionId,
        CardHolderName: (input.card.holder || 'Musteri').trim(),
        CardNo: input.card.number,
        ExpireDate: expireDate,
        Cvv: input.card.cvc,
      };

      return {
        kind: 'form',
        adapter: this.id,
        form: { actionUrl, method: 'POST', fields },
      };
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'Tosla 3D başlatılamadı',
      };
    }
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }
    const bankResponseCode = (raw.BankResponseCode || '').trim();
    const basarili = bankResponseCode === '00';
    const orderId = (raw.Echo || raw.OrderId || raw.TransactionId || '').trim();

    return {
      orderId,
      success: basarili,
      responseCode: bankResponseCode,
      message: basarili
        ? 'Başarılı'
        : raw.BankResponseMessage || 'İşlem başarısız',
      raw,
      needsProvision: false,
    };
  },

  /** void / refund — referans tosla.adapter.js */
  async reverse(input: ReversePaymentInput): Promise<ReversePaymentResult> {
    const clientId = input.pos.merchantId.trim();
    const apiUser = input.pos.terminalSafeId.trim();
    const apiPass = input.pos.securityKey.trim();
    const orderId = String(input.bankOrderId || input.orderId || '').slice(0, 20);
    if (!clientId || !apiUser || !apiPass) {
      return { success: false, message: 'Tosla iptal/iade: Client ID / Api User / Pass eksik' };
    }
    if (!orderId) return { success: false, message: 'Tosla iptal/iade: OrderId bulunamadı' };

    const rnd = toslaRnd();
    const timeSpan = istanbulTimeSpan();
    const baseUrl = baseUrlOf(input.pos);
    const endpoint = input.kind === 'void' ? 'void' : 'refund';
    const payload: Record<string, unknown> = {
      OrderId: orderId,
      ClientId: Number(clientId),
      ApiUser: apiUser,
      Rnd: rnd,
      TimeSpan: timeSpan,
      Hash: toslaHash({ apiPass, clientId, apiUser, rnd, timeSpan }),
      Echo: input.orderId || '',
    };
    if (input.kind === 'refund' && input.amount != null) {
      payload.Amount = Math.round(Number(input.amount) * 100);
    }

    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30_000),
      });
      const text = await response.text();
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return { success: false, message: `Tosla yanıtı geçersiz: ${text.slice(0, 200)}`, raw: text };
      }
      if (!response.ok) {
        return { success: false, message: `Tosla isteği başarısız: ${response.status}`, raw: data };
      }
      const code = Number(data.Code ?? data.code);
      const ok = code === 0;
      return {
        success: ok,
        message: ok
          ? 'Başarılı'
          : String(data.Message || data.message || data.BankResponseMessage || 'Tosla işlemi başarısız'),
        responseCode: String(code),
        authCode: data.AuthCode != null ? String(data.AuthCode) : undefined,
        referenceCode:
          data.HostReferenceNumber != null
            ? String(data.HostReferenceNumber)
            : data.TransactionId != null
              ? String(data.TransactionId)
              : undefined,
        raw: data,
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Tosla iptal/iade başarısız',
      };
    }
  },
};
