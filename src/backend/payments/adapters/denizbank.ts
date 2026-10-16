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
 * DenizBank Intertech 3DPay — referans denizbank.adapter.js
 * NestPay (ClientId/ver3) değil: ShopCode + SHA1(hex→base64) hash.
 *
 * POS alan eşlemesi (eski degerler sırası):
 * merchantId = Mağaza No (ShopCode)
 * terminalPassword = Kullanıcı şifresi (iptal/iade)
 * terminalSafeId = Kullanıcı kodu (iptal/iade)
 * securityKey = 3D Anahtar (merchantPass)
 */

function sha1Base64Hex(hashStr: string): string {
  const sha1Hex = createHash('sha1').update(hashStr, 'utf8').digest('hex');
  return Buffer.from(sha1Hex, 'hex').toString('base64');
}

function currencyCode(code: string): string {
  const u = code.toUpperCase();
  if (u === 'TRY' || u === 'TL' || u === '949') return '949';
  if (u === 'USD' || u === '840') return '840';
  if (u === 'EUR' || u === '978') return '978';
  return /^\d+$/.test(u) ? u : '949';
}

export function looksLikeDenizBank(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  if (
    blob.includes('akbank') ||
    blob.includes('garanti') ||
    blob.includes('vakif') ||
    blob.includes('vakıf') ||
    blob.includes('qnb') ||
    blob.includes('finansbank')
  ) {
    return false;
  }
  return (
    blob.includes('denizbank') ||
    blob.includes('deniz bank') ||
    blob.includes('intertech') ||
    pos.infrastructureId === 'infra-denizbank'
  );
}

export const denizbankGateway: PaymentGateway = {
  id: 'denizbank',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const shopCode = input.pos.merchantId.trim();
    const merchantPass = input.pos.securityKey.trim();
    const actionUrl = (input.pos.gateway3dUrl || '').trim();

    if (!shopCode || !merchantPass) {
      return {
        kind: 'error',
        message: 'DenizBank: mağaza no / 3D anahtar eksik (Sanal POS Tanımı)',
      };
    }
    if (!actionUrl) {
      return { kind: 'error', message: 'DenizBank: 3D ödeme URL bulunamadı (Banka Düzenle)' };
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

    const purchaseAmount = input.amount.toFixed(2);
    const orderId = input.orderId;
    const currency = currencyCode(input.currencyCode);
    const txnType = 'Auth';
    const taksit = Math.max(1, input.installment);
    const installmentCount = taksit === 1 ? '' : String(taksit);
    const rnd = `${Date.now()}${Math.floor(Math.random() * 100000)}`;
    const returnUrl = input.okUrl;
    const failUrl = input.failUrl || returnUrl;

    // Referans: ShopCode+OrderId+Amount+Ok+Fail+TxnType+Installment+Rnd+merchantPass
    const hashStr =
      shopCode +
      orderId +
      purchaseAmount +
      returnUrl +
      failUrl +
      txnType +
      installmentCount +
      rnd +
      merchantPass;
    const hash = sha1Base64Hex(hashStr);

    const ay = input.card.expiry.slice(0, 2);
    const yil = input.card.expiry.slice(2, 4);
    const adSoyad = (input.card.holder || '').trim();
    const email = (input.email || '').trim();

    const fields: Record<string, string> = {
      Pan: input.card.number,
      Cvv2: input.card.cvc,
      Expiry: `${ay}${yil}`,
      BonusAmount: '',
      CardType: '',
      CardHolderBillingAdressLine1: '',
      CardHolderBillingAdressLine2: '',
      CardHolderBillingAdressLine3: '',
      CardHolderBillingCountry: '',
      CardHolderBillingCity: '',
      billAddrPostCode: '',
      billAddrState: '',
      CardHolderMailAdress: email,
      CardHolderName: adSoyad,
      CardHolderShipingAdressLine1: '',
      CardHolderShipingAdressLine2: '',
      CardHolderShipingAdressLine3: '',
      CardHolderShipingCountry: '',
      CardHolderShipingCity: '',
      shipAddrPostCode: '',
      shipAddrState: '',
      HomePhone: '',
      MobilePhone: '',
      WorkPhone: '',
      addrMatch: '',
      chAccAgeInd: '',
      chAccChange: '',
      chAccChangeInd: '',
      chAccDate: '',
      chAccPwChange: '',
      chAccPwChangeInd: '',
      nbPurchaseAccount: '',
      paymentAccAge: '',
      paymentAccInd: '',
      provisionAttemptsDay: '',
      shipAddressUsage: '',
      shipAddressUsageInd: '',
      suspiciousAccActivity: '',
      shipNameIndicator: '',
      txnActivityDay: '',
      txnActivityYear: '',
      ShopCode: shopCode,
      PurchAmount: purchaseAmount,
      Currency: currency,
      OrderId: orderId,
      OkUrl: returnUrl,
      FailUrl: failUrl,
      Rnd: rnd,
      Hash: hash,
      TxnType: txnType,
      InstallmentCount: installmentCount,
      SecureType: '3DPay',
      Version3D: '2.0',
      Lang: 'tr',
    };

    return {
      kind: 'form',
      adapter: this.id,
      form: {
        actionUrl,
        method: 'POST',
        fields,
      },
    };
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const status3d = (raw['3DStatus'] || raw['3dStatus'] || '').trim();
    const procReturnCode = (raw.ProcReturnCode || raw.procReturnCode || '').trim();
    const basarili = status3d === '1' && procReturnCode === '00';
    const orderId = raw.OrderId || raw.orderId || raw.TransId || '';

    return {
      orderId,
      success: basarili,
      responseCode: procReturnCode || status3d,
      message: basarili
        ? 'Başarılı'
        : raw.ErrorMessage || raw.ErrMsg || raw.ErrorMsg || 'İşlem başarısız!',
      raw,
      needsProvision: false,
    };
  },

  /** NonSecure Void / Refund — Intertech (ShopCode + UserCode/UserPass) */
  async reverse(input: ReversePaymentInput): Promise<ReversePaymentResult> {
    const shopCode = input.pos.merchantId.trim();
    const userCode = input.pos.terminalSafeId.trim();
    const userPass = input.pos.terminalPassword.trim();
    const url = (input.pos.gateway3dUrl || input.pos.apiUrl || '').trim();
    const orderId = (input.bankOrderId || input.orderId || '').trim();

    if (!shopCode || !userCode || !userPass) {
      return {
        success: false,
        message: 'DenizBank iptal/iade: Kullanıcı kodu / şifre eksik (Terminal alanları)',
      };
    }
    if (!url) return { success: false, message: 'DenizBank iptal/iade: API URL bulunamadı' };
    if (!orderId) return { success: false, message: 'DenizBank iptal/iade: sipariş no yok' };

    const fields: Record<string, string> = {
      ShopCode: shopCode,
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
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(fields),
        signal: AbortSignal.timeout(30_000),
      });
      const rawText = await response.text();
      if (!response.ok) {
        return { success: false, message: `DenizBank isteği başarısız: ${response.status}`, raw: rawText };
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
          : parsed.ErrMsg || parsed.ErrorMessage || 'DenizBank işlemi başarısız',
        responseCode: code,
        authCode: parsed.AuthCode || undefined,
        referenceCode: parsed.HostRefNum || undefined,
        raw: { text: rawText, parsed },
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'DenizBank iptal/iade başarısız',
      };
    }
  },
};
