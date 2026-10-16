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
 * QNB Finansbank Intertech 3DPay — referans qnb.adapter.js
 * NestPay değil. POS: merchantId, securityKey=3D şifre, terminalSafeId=UserCode, terminalPassword=UserPass
 */

function sha1Base64Hex(hashStr: string): string {
  const sha1Hex = createHash('sha1').update(hashStr, 'utf8').digest('hex');
  return Buffer.from(sha1Hex, 'hex').toString('base64');
}

export function looksLikeQnb(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return (
    blob.includes('qnb') ||
    blob.includes('finansbank') ||
    pos.infrastructureId === 'infra-qnb'
  );
}

export const qnbGateway: PaymentGateway = {
  id: 'qnb',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const merchantId = input.pos.merchantId.trim();
    const merchantPass = input.pos.securityKey.trim();
    const userCode = input.pos.terminalSafeId.trim();
    const userPass = input.pos.terminalPassword.trim();
    const actionUrl = (input.pos.gateway3dUrl || '').trim();

    if (!merchantId || !merchantPass || !userCode || !userPass) {
      return {
        kind: 'error',
        message: 'QNB: İşyeri No / 3D Şifre / API Kullanıcı / Şifre eksik (Sanal POS)',
      };
    }
    if (!actionUrl) {
      return { kind: 'error', message: 'QNB: ödeme URL bulunamadı' };
    }
    if (!/^\d{15,16}$/.test(input.card.number)) {
      return { kind: 'error', message: 'Kart numarası geçersiz' };
    }
    if (!/^\d{4}$/.test(input.card.expiry)) {
      return { kind: 'error', message: 'Son kullanma MMYY olmalı' };
    }

    const mbrId = '5';
    const secureType = '3DPay';
    const txnType = 'Auth';
    const installmentCount = input.installment <= 1 ? 0 : input.installment;
    const currency = '949';
    const okUrl = input.okUrl;
    const failUrl = input.failUrl || okUrl;
    const orderId = input.orderId;
    const purchAmount = input.amount.toFixed(2);
    const rnd = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const ay = input.card.expiry.slice(0, 2);
    const yil = input.card.expiry.slice(2, 4);

    const hashStr =
      mbrId +
      orderId +
      purchAmount +
      okUrl +
      failUrl +
      txnType +
      installmentCount +
      rnd +
      merchantPass;
    const hash = sha1Base64Hex(hashStr);

    const fields: Record<string, string> = {
      Pan: input.card.number,
      Cvv2: input.card.cvc,
      Expiry: `${ay}${yil}`,
      MbrId: mbrId,
      MerchantID: merchantId,
      UserCode: userCode,
      UserPass: userPass,
      SecureType: secureType,
      TxnType: txnType,
      InstallmentCount: String(installmentCount),
      Currency: currency,
      OkUrl: okUrl,
      FailUrl: failUrl,
      OrderId: orderId,
      PurchAmount: purchAmount,
      Lang: 'TR',
      Rnd: rnd,
      Hash: hash,
    };

    return {
      kind: 'form',
      adapter: this.id,
      form: { actionUrl, method: 'POST', fields },
    };
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }
    const dStatus = (raw['3DStatus'] || raw['3dStatus'] || '').trim();
    const procReturnCode = (raw.ProcReturnCode || '').trim();
    const basarili = dStatus === '1' && procReturnCode === '00';
    const orderId = raw.OrderId || raw.orderId || raw.RequestGuid || '';

    return {
      orderId,
      success: basarili,
      responseCode: procReturnCode || dStatus,
      message: basarili
        ? 'Başarılı'
        : raw.ErrMsg || raw.ErrorMessage || 'İşlem başarısız!',
      raw,
      needsProvision: false,
    };
  },

  /** NonSecure Void / Refund — referans qnb.adapter.js iptal/iade */
  async reverse(input: ReversePaymentInput): Promise<ReversePaymentResult> {
    const merchantId = input.pos.merchantId.trim();
    const userCode = input.pos.terminalSafeId.trim();
    const userPass = input.pos.terminalPassword.trim();
    const url = (input.pos.gateway3dUrl || input.pos.apiUrl || '').trim();
    const orderId = (input.bankOrderId || input.orderId || '').trim();

    if (!merchantId || !userCode || !userPass) {
      return { success: false, message: 'QNB iptal/iade: API kullanıcı bilgileri eksik' };
    }
    if (!url) return { success: false, message: 'QNB iptal/iade: API URL bulunamadı' };
    if (!orderId) return { success: false, message: 'QNB iptal/iade: sipariş no yok' };

    const fields: Record<string, string> = {
      MbrId: '5',
      MerchantID: merchantId,
      UserCode: userCode,
      UserPass: userPass,
      OrderId: orderId,
      SecureType: 'NonSecure',
      TxnType: input.kind === 'void' ? 'Void' : 'Refund',
      Currency: '949',
      Lang: 'TR',
    };
    if (input.kind === 'refund' && input.amount != null) {
      fields.PurchAmount = Number(input.amount).toFixed(2);
    }

    try {
      const body = new URLSearchParams(fields);
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(30_000),
      });
      const rawText = await response.text();
      if (!response.ok) {
        return { success: false, message: `QNB isteği başarısız: ${response.status}`, raw: rawText };
      }
      const parsed: Record<string, string> = {};
      rawText.split(';;').forEach((item) => {
        const index = item.indexOf('=');
        if (index === -1) return;
        const key = item.slice(0, index).trim();
        const value = item.slice(index + 1).trim();
        if (key) parsed[key] = value;
      });
      const code = parsed.ProcReturnCode || parsed.ResponseCode || parsed.Response || '';
      const ok = code === '00';
      return {
        success: ok,
        message: ok
          ? 'Başarılı'
          : parsed.ErrMsg || parsed.ErrorMessage || parsed.ResponseMsg || 'QNB işlemi başarısız',
        responseCode: code,
        authCode: parsed.AuthCode || undefined,
        referenceCode: parsed.HostRefNum || parsed.HostRefNumber || undefined,
        raw: { text: rawText, parsed },
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'QNB iptal/iade başarısız',
      };
    }
  },
};
