import { createHash } from 'node:crypto';
import type {
  CallbackResult,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
} from '../types.js';

/**
 * Garanti BBVA — referans api.anypay.com.tr garanti.adapter.js ile aynı protokol.
 * - secure3dsecuritylevel: 3D_PAY (bankadaki 3D_OOS_PAY etiketi kullanılmaz)
 * - Hash: SHA1 (SHA512 / apiversion 512 değil)
 * - Hash içinde currency yok; terminalId formda pad’siz, securityData’da 9 hane
 */

function sha1Upper(value: string): string {
  return createHash('sha1').update(String(value), 'utf8').digest('hex').toUpperCase();
}

function amountCents(amount: number): string {
  return String(Math.round(amount * 100));
}

function currencyCode(code: string): string {
  const u = code.toUpperCase();
  if (u === 'TRY' || u === 'TL' || u === '949') return '949';
  if (u === 'USD' || u === '840') return '840';
  if (u === 'EUR' || u === '978') return '978';
  return /^\d+$/.test(u) ? u : '949';
}

function padTerminalId9(raw: string): string {
  return String(raw).replace(/\D/g, '').padStart(9, '0').slice(-9);
}

function resolveMode(gateway3dUrl: string): 'PROD' | 'TEST' {
  const u = gateway3dUrl.toLowerCase();
  if (u.includes('sanalposprovtest') || /\/test(\/|$)/.test(u)) return 'TEST';
  return 'PROD';
}

/** Referans: sha1(password + terminalId9) sonra sha1(terminalId + order + amount + ok + fail + type + taksit + storeKey + securityData) */
function garantiHash(opts: {
  terminalId: string;
  orderNumber: string;
  orderAmount: string;
  successUrl: string;
  failUrl: string;
  type: string;
  installmentStr: string;
  storeKey: string;
  password: string;
}): string {
  const terminalIdNew = padTerminalId9(opts.terminalId);
  const securityData = sha1Upper(`${opts.password}${terminalIdNew}`);
  return sha1Upper(
    `${opts.terminalId}${opts.orderNumber}${opts.orderAmount}${opts.successUrl}${opts.failUrl}${opts.type}${opts.installmentStr}${opts.storeKey}${securityData}`,
  );
}

export function looksLikeGaranti(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
  securityType?: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.infrastructureId} ${pos.bankName} ${pos.securityType || ''}`.toLowerCase();
  if (blob.includes('akbank') || blob.includes('virtualpospaymentgateway')) return false;
  if (blob.includes('est3dgate') || blob.includes('asseco') || blob.includes('nestpay')) {
    if (!blob.includes('garanti.com')) return false;
  }
  return (
    blob.includes('garanti') ||
    blob.includes('gt3dengine') ||
    blob.includes('vpservlet') ||
    pos.infrastructureId === 'infra-garanti'
  );
}

export const garantiGateway: PaymentGateway = {
  id: 'garanti',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const merchantId = input.pos.merchantId.trim();
    const terminalId = input.pos.terminalSafeId.replace(/\D/g, '').trim() || input.pos.terminalSafeId.trim();
    const storeKey = input.pos.securityKey.trim();
    const password = input.pos.terminalPassword.trim();

    if (!merchantId || !terminalId || !storeKey) {
      return {
        kind: 'error',
        message: 'Garanti: işyeri no / terminal no / mağaza anahtarı eksik',
      };
    }
    if (!password) {
      return {
        kind: 'error',
        message: 'Garanti: terminal şifresi eksik (Sanal POS Tanımı)',
      };
    }
    if (!input.pos.gateway3dUrl) {
      return { kind: 'error', message: 'Garanti: 3D geçit URL eksik (Banka Düzenle)' };
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

    const orderNumber = input.orderId;
    const orderAmount = amountCents(input.amount);
    const type = 'sales';
    const installmentStr = input.installment > 1 ? String(input.installment) : '';
    const successUrl = input.okUrl;
    const failUrl = input.failUrl;
    const currency = currencyCode(input.currencyCode);

    const mm = String(Number(input.card.expiry.slice(0, 2) || 0)).padStart(2, '0');
    const yy = input.card.expiry.slice(2, 4);

    const secure3dhash = garantiHash({
      terminalId,
      orderNumber,
      orderAmount,
      successUrl,
      failUrl,
      type,
      installmentStr,
      storeKey,
      password,
    });

    // Referans alanları birebir
    const fields: Record<string, string> = {
      secure3dsecuritylevel: '3D_PAY',
      cardnumber: input.card.number,
      cardexpiredatemonth: mm,
      cardexpiredateyear: yy,
      cardcvv2: input.card.cvc,
      mode: resolveMode(input.pos.gateway3dUrl),
      apiversion: 'v0.01',
      terminalprovuserid: 'PROVAUT',
      terminaluserid: 'PROVAUT',
      terminalmerchantid: merchantId,
      txntype: type,
      txnamount: orderAmount,
      txncurrencycode: currency,
      txninstallmentcount: installmentStr,
      orderid: orderNumber,
      terminalid: terminalId,
      successurl: successUrl,
      errorurl: failUrl,
      customeremailaddress: input.email || 'musteri@anypay.com.tr',
      customeripaddress: input.clientIp || '127.0.0.1',
      secure3dhash,
    };

    return {
      kind: 'form',
      adapter: this.id,
      form: {
        actionUrl: input.pos.gateway3dUrl,
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

    const orderId =
      raw.orderid || raw.orderId || raw.oid || raw.Oid || '';
    const response = (raw.response || raw.Response || '').trim();
    const basarili = response === 'Approved';

    return {
      orderId,
      success: basarili,
      responseCode: raw.procreturncode || raw.ProcReturnCode || response,
      message: basarili
        ? 'Approved'
        : raw.mderrormessage ||
          raw.MdErrorMessage ||
          raw.errmsg ||
          raw.ErrMsg ||
          'Ödeme başarısız',
      raw,
      needsProvision: false,
    };
  },
};
