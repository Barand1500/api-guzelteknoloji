import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  CallbackResult,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
} from '../types.js';

/**
 * NestPay / Payten 3D_PAY — referans isbankasi.adapter.js (hashAlgorithm ver3).
 * Garanti / Akbank / VakıfBank bu adapter’a girmez.
 */

function escapeHashValue(value: string): string {
  return String(value ?? '')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|');
}

/** ver3: alfabetik alanlar + storeKey → SHA512 hex → base64 */
function nestpayHashVer3(params: Record<string, string>, storeKey: string): string {
  const keys = Object.keys(params).sort((a, b) =>
    a.localeCompare(b, 'tr', { sensitivity: 'base' }),
  );

  let hashVal = '';
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower === 'hash' || lower === 'encoding') continue;
    hashVal += `${escapeHashValue(params[key] ?? '')}|`;
  }
  hashVal += escapeHashValue(storeKey);

  const hex = createHash('sha512').update(hashVal, 'utf8').digest('hex');
  return Buffer.from(hex, 'hex').toString('base64');
}

function mapStoreType(securityType: string): string {
  const t = securityType.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (t.includes(',')) {
    const parts = t.split(',').map((s) => s.trim()).filter(Boolean);
    for (const p of ['3D_PAY', '3DPAY', '3D_PAY_HOSTING', '3D_HOST', '3DHOST', '3D']) {
      if (parts.some((x) => x === p || x.replace(/_/g, '') === p.replace(/_/g, ''))) {
        return mapStoreType(p);
      }
    }
  }
  if (t === '3D_PAY' || t === '3DPAY') return '3d_pay';
  if (t === '3D_HOST' || t === '3DHOST' || t === '3D_PAY_HOSTING') return '3d_pay_hosting';
  if (t === '3D' || t === '3DMODEL' || t === '3D_MODEL') return '3d';
  return '3d_pay';
}

function currencyCode(code: string): string {
  const u = code.toUpperCase();
  if (u === 'TRY' || u === 'TL' || u === '949') return '949';
  if (u === 'USD' || u === '840') return '840';
  if (u === 'EUR' || u === '978') return '978';
  return '949';
}

export const nestpayGateway: PaymentGateway = {
  id: 'nestpay',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const clientId = input.pos.merchantId;
    const storeKey = input.pos.securityKey;
    if (!clientId || !storeKey) {
      return { kind: 'error', message: 'NestPay: işyeri no / mağaza anahtarı eksik' };
    }
    if (!input.pos.gateway3dUrl) {
      return { kind: 'error', message: 'NestPay: 3D geçit URL eksik (Banka Düzenle)' };
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

    const amount = input.amount.toFixed(2);
    const orderId = input.orderId;
    const returnUrl = input.okUrl;
    const mm = input.card.expiry.slice(0, 2);
    const yyFull = `20${input.card.expiry.slice(2, 4)}`;
    const taksit = input.installment > 1 ? String(input.installment) : '';
    const billName = (input.card.holder || 'Musteri').trim();

    // Düz "3d" yalnızca kimlik doğrular; Auth/çekim için 3d_pay zorunlu
    let storetype = mapStoreType(input.pos.securityType);
    if (storetype === '3d') {
      storetype = '3d_pay';
    }

    const params: Record<string, string> = {
      pan: input.card.number,
      cv2: input.card.cvc,
      Ecom_Payment_Card_ExpDate_Year: yyFull,
      Ecom_Payment_Card_ExpDate_Month: mm,
      clientid: clientId,
      amount,
      oid: orderId,
      okurl: returnUrl,
      failUrl: input.failUrl || returnUrl,
      callbackUrl: returnUrl,
      TranType: 'Auth',
      Instalment: taksit,
      currency: currencyCode(input.currencyCode),
      rnd: `${Date.now()}${Math.floor(Math.random() * 100000)}`,
      storetype,
      hashAlgorithm: 'ver3',
      lang: 'tr',
      BillToName: billName,
      BillToCompany: `${billName} Siparisi`,
    };

    params.HASH = nestpayHashVer3(params, storeKey);

    return {
      kind: 'form',
      adapter: this.id,
      form: {
        actionUrl: input.pos.gateway3dUrl,
        method: 'POST',
        fields: params,
      },
    };
  },

  parseCallback(body: Record<string, unknown>, secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const orderId = raw.oid || raw.Oid || raw.orderId || raw.OrderId || '';
    const procReturnCode = raw.ProcReturnCode || raw.procreturncode || '';
    const mdStatus = raw.mdStatus || '';
    const response = (raw.Response || raw.response || '').trim();

    // Referans: Response === Approved (hash doğrulama bankaya bırakılır)
    let hashOk = true;
    if (raw.HASHPARAMS && raw.HASH && secretKey && raw.hashAlgorithm !== 'ver3') {
      const plain =
        raw.HASHPARAMS.split(':')
          .filter(Boolean)
          .map((p) => raw[p] ?? '')
          .join('') + secretKey;
      const expected = createHash('sha1').update(plain, 'latin1').digest('base64');
      try {
        const a = Buffer.from(expected);
        const b = Buffer.from(raw.HASH);
        hashOk = a.length === b.length && timingSafeEqual(a, b);
      } catch {
        hashOk = false;
      }
    }

    const success =
      hashOk &&
      (procReturnCode === '00' || response === 'Approved') &&
      (mdStatus === '' || mdStatus === '1' || mdStatus === '2' || mdStatus === '3' || mdStatus === '4');

    const storetype = (raw.storetype || '').toLowerCase();
    const needsProvision = storetype === '3d' && success;

    return {
      orderId,
      success,
      responseCode: procReturnCode || response || '',
      message:
        raw.ErrMsg ||
        raw.errmsg ||
        raw.mdErrorMsg ||
        (success ? 'NestPay 3D başarılı' : 'NestPay 3D başarısız'),
      raw,
      needsProvision,
      secure: needsProvision
        ? {
            secureId: raw.xid || '',
            secureEcomInd: raw.eci || '',
            secureData: raw.cavv || '',
            secureMd: raw.md || '',
            mdStatus,
          }
        : undefined,
    };
  },
};

export function looksLikeNestPay(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  if (blob.includes('akbank') || blob.includes('virtualpospaymentgateway')) return false;
  if (blob.includes('garanti') || blob.includes('gt3dengine') || blob.includes('vpservlet')) {
    return false;
  }
  if (
    blob.includes('vakif') ||
    blob.includes('vakıf') ||
    blob.includes('mpi_enrollment') ||
    blob.includes('mpiapi')
  ) {
    return false;
  }
  return (
    blob.includes('nestpay') ||
    blob.includes('asseco') ||
    blob.includes('est3d') ||
    blob.includes('yapikredi') ||
    blob.includes('qnb') ||
    blob.includes('isbank') ||
    blob.includes('ziraat') ||
    blob.includes('halk') ||
    blob.includes('payten') ||
    /\/fim\/est3dgate/i.test(pos.gateway3dUrl) ||
    /3dgate|3dpay/i.test(pos.gateway3dUrl)
  );
}
