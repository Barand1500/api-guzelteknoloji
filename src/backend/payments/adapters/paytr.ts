import { createHmac, timingSafeEqual } from 'node:crypto';
import type {
  CallbackResult,
  FinalizeCallbackInput,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
} from '../types.js';

/**
 * PayTR iFrame — referans paytr.adapter.js
 * Kart PayTR iframe’de girilir; biz sadece token + HTML üretiriz.
 * POS: merchantId, securityKey=merchantKey, terminalPassword=merchantSalt
 *
 * Sonuç: kullanıcı ok/fail URL’ye döner (kesin değil); kesin sonuç
 * PayTR bildirim POST’u (hash) ile gelir → finalizeCallback.
 */

function hmacBase64(value: string, key: string) {
  return createHmac('sha256', key).update(value).digest('base64');
}

function safeEqualB64(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function looksLikePaytr(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
  apiUrl?: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.apiUrl || ''} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return blob.includes('paytr') || pos.infrastructureId === 'infra-paytr';
}

export const paytrGateway: PaymentGateway = {
  id: 'paytr',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const merchantId = input.pos.merchantId.trim();
    const merchantKey = input.pos.securityKey.trim();
    const merchantSalt = input.pos.terminalPassword.trim();
    if (!merchantId || !merchantKey || !merchantSalt) {
      return {
        kind: 'error',
        message: 'PayTR: Merchant ID / Key / Salt eksik (Sanal POS)',
      };
    }

    const email = (input.email || '').trim();
    if (!email) {
      return { kind: 'error', message: 'PayTR için e-posta zorunludur' };
    }

    const merchantOid = input.orderId;
    const paymentAmount = Math.round(input.amount * 100);
    const basket = [['Cari Odeme', input.amount.toFixed(2), 1]];
    const userBasket = Buffer.from(JSON.stringify(basket)).toString('base64');
    const userIp = (input.clientIp || '127.0.0.1').replace(/^::ffff:/, '');
    const noInstallment = '0';
    const maxInstallment = '0';
    const currency = 'TL';
    const testMode = '0';
    const returnUrl = input.okUrl;
    // Bildirim URL PayTR mağaza panelinde: {PUBLIC_API}/api/payments/3d/notify/paytr

    const hashStr =
      merchantId +
      userIp +
      merchantOid +
      email +
      String(paymentAmount) +
      userBasket +
      noInstallment +
      maxInstallment +
      currency +
      testMode;
    const paytrToken = hmacBase64(hashStr + merchantSalt, merchantKey);

    const postVals = new URLSearchParams({
      merchant_id: merchantId,
      user_ip: userIp,
      merchant_oid: merchantOid,
      email,
      payment_amount: String(paymentAmount),
      paytr_token: paytrToken,
      user_basket: userBasket,
      debug_on: '0',
      no_installment: noInstallment,
      max_installment: maxInstallment,
      user_name: (input.card.holder || 'Musteri').trim(),
      user_address: 'Turkiye',
      user_phone: '05000000000',
      merchant_ok_url: returnUrl,
      merchant_fail_url: input.failUrl || returnUrl,
      timeout_limit: '30',
      currency,
      test_mode: testMode,
    });

    try {
      const response = await fetch('https://www.paytr.com/odeme/api/get-token', {
        method: 'POST',
        body: postVals,
        signal: AbortSignal.timeout(25_000),
      });
      const text = await response.text();
      let result: { status?: string; reason?: string; token?: string };
      try {
        result = JSON.parse(text) as typeof result;
      } catch {
        return { kind: 'error', message: `PayTR yanıtı geçersiz: ${text.slice(0, 200)}` };
      }
      if (result.status !== 'success' || !result.token) {
        return { kind: 'error', message: `PayTR: ${result.reason || text.slice(0, 200)}` };
      }

      const token = result.token;
      const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <script src="https://www.paytr.com/js/iframeResizer.min.js" crossorigin="anonymous"></script>
</head>
<body style="margin:0;background:#fff;">
  <iframe src="https://www.paytr.com/odeme/guvenli/${token}" id="paytriframe" frameborder="0" scrolling="no" style="width:100%;min-height:650px;"></iframe>
  <script>try{iFrameResize({},'#paytriframe')}catch(e){}</script>
</body>
</html>`;

      return {
        kind: 'form',
        adapter: this.id,
        form: {
          actionUrl: `https://www.paytr.com/odeme/guvenli/${token}`,
          method: 'POST',
          fields: {},
          html,
        },
      };
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'PayTR token alınamadı',
      };
    }
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const merchantOid = (raw.merchant_oid || '').trim();
    const status = (raw.status || '').trim();
    const totalAmount = (raw.total_amount || '').trim();
    const hash = (raw.hash || '').trim();

    // Bildirim gövdesi → hash finalizeCallback’te (salt POS’ta)
    if (merchantOid && status && totalAmount && hash) {
      return {
        orderId: merchantOid,
        success: true,
        responseCode: status,
        message: 'PayTR bildirim — hash doğrulanacak',
        raw,
        needsProvision: true,
      };
    }

    // Kullanıcı return URL — sonuç bildirimle kesinleşir; durumu düşürme
    return {
      orderId: merchantOid,
      success: false,
      responseCode: 'pending-notify',
      message: 'PayTR sonucu bildirim ile kesinleşir; ödeme beklemede',
      raw,
      needsProvision: false,
      awaitingExternalConfirm: true,
    };
  },

  async finalizeCallback(input: FinalizeCallbackInput): Promise<CallbackResult> {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const merchantOid = (raw.merchant_oid || input.orderId || '').trim();
    const status = (raw.status || '').trim();
    const totalAmount = (raw.total_amount || '').trim();
    const hash = (raw.hash || '').trim();
    const merchantKey = input.pos.securityKey.trim();
    const merchantSalt = input.pos.terminalPassword.trim();

    if (!merchantOid || !status || !totalAmount || !hash) {
      return {
        orderId: merchantOid,
        success: false,
        responseCode: '',
        message: 'PayTR bildirim alanları eksik',
        raw,
        needsProvision: false,
      };
    }
    if (!merchantKey || !merchantSalt) {
      return {
        orderId: merchantOid,
        success: false,
        responseCode: '',
        message: 'PayTR Key/Salt eksik',
        raw,
        needsProvision: false,
      };
    }

    const expected = hmacBase64(merchantOid + merchantSalt + status + totalAmount, merchantKey);
    if (!safeEqualB64(expected, hash)) {
      return {
        orderId: merchantOid,
        success: false,
        responseCode: 'HASH',
        message: 'PayTR hash doğrulaması başarısız',
        raw,
        needsProvision: false,
      };
    }

    const basarili = status === 'success';
    return {
      orderId: merchantOid,
      success: basarili,
      responseCode: status,
      message: basarili ? 'Başarılı' : raw.failed_reason_msg || 'PayTR ödeme başarısız',
      raw,
      needsProvision: false,
    };
  },
};
