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

function securityDataOf(password: string, terminalId: string): string {
  return sha1Upper(`${password}${padTerminalId9(terminalId)}`);
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
  const securityData = securityDataOf(opts.password, opts.terminalId);
  return sha1Upper(
    `${opts.terminalId}${opts.orderNumber}${opts.orderAmount}${opts.successUrl}${opts.failUrl}${opts.type}${opts.installmentStr}${opts.storeKey}${securityData}`,
  );
}

/** iptal/iade hash — referans garantiRefundVoidHash */
function refundVoidHash(opts: {
  orderNo: string;
  terminalId: string;
  amount: string;
  password: string;
}): string {
  const securityData = securityDataOf(opts.password, opts.terminalId);
  return sha1Upper(`${opts.orderNo}${opts.terminalId}${opts.amount}${securityData}`);
}

function xmlEscape(value: string): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function xmlTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = String(xml || '').match(re);
  return (m?.[1] || '').trim();
}

async function postGvpsXml(apiUrl: string, xml: string): Promise<string> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: xml }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Garanti API hatası: ${response.status}`);
  return raw;
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
    const proc = (raw.procreturncode || raw.ProcReturnCode || '').trim();
    const statusBlob = [
      raw.mderrormessage,
      raw.MdErrorMessage,
      raw.errmsg,
      raw.ErrMsg,
      raw.message,
      raw.Message,
      raw.hostmessage,
      raw.HostMessage,
      raw.gatewaymessage,
      raw.GatewayMessage,
    ]
      .filter(Boolean)
      .join(' ');

    // Klasik: Response=Approved · ProcReturnCode=00
    // Troy kart: TROY Gateway Result [Code: '000', Message: 'Success'] (Response boş kalabiliyor)
    const troyOk =
      /TROY\s+Gateway\s+Result/i.test(statusBlob) &&
      /Code:\s*'0{2,3}'/i.test(statusBlob) &&
      /Message:\s*'Success'/i.test(statusBlob);
    const basarili =
      response.toLowerCase() === 'approved' ||
      proc === '00' ||
      proc === '000' ||
      troyOk;

    const failMsg =
      raw.mderrormessage ||
      raw.MdErrorMessage ||
      raw.errmsg ||
      raw.ErrMsg ||
      response ||
      'Ödeme başarısız';

    return {
      orderId,
      success: basarili,
      responseCode: proc || response || (troyOk ? '000' : ''),
      message: basarili ? 'Approved' : failMsg,
      raw: {
        ...raw,
        AuthCode: raw.authcode || raw.AuthCode || raw.procreturncode || '',
        HostRefNum: raw.hostrefnum || raw.HostRefNum || '',
        RetrefNum: raw.retrefnum || raw.RetrefNum || '',
        Rrn: raw.retrefnum || raw.RetrefNum || raw.hostrefnum || raw.HostRefNum || '',
      },
      needsProvision: false,
    };
  },

  /** void / refund GVPS XML — referans garanti.adapter.js iptal/iade */
  async reverse(input: ReversePaymentInput): Promise<ReversePaymentResult> {
    const merchantId = input.pos.merchantId.trim();
    const terminalId =
      input.pos.terminalSafeId.replace(/\D/g, '').trim() || input.pos.terminalSafeId.trim();
    const password = input.pos.terminalPassword.trim();
    const apiUrl = (input.pos.apiUrl || input.pos.xmlUrl || '').trim();
    const orderNo = (input.bankOrderId || input.orderId || '').trim();
    const amount = amountCents(input.amount ?? 0);
    const ipAddress = (input.clientIp || '127.0.0.1').replace(/^::ffff:/, '');
    const refNum = (input.referenceCode || '').trim();

    if (!merchantId || !terminalId || !password) {
      return { success: false, message: 'Garanti iptal/iade: POS kimlik bilgileri eksik' };
    }
    if (!apiUrl) {
      return { success: false, message: 'Garanti iptal/iade: API URL bulunamadı (Banka Düzenle)' };
    }
    if (!orderNo) {
      return { success: false, message: 'Garanti iptal/iade: sipariş no yok' };
    }
    if (input.kind === 'void' && !refNum) {
      return { success: false, message: 'Garanti iptal için referans kodu (RetrefNum) bulunamadı' };
    }

    const hashData = refundVoidHash({ orderNo, terminalId, amount, password });

    const xml =
      input.kind === 'void'
        ? `<?xml version="1.0" encoding="ISO-8859-9"?>
<GVPSRequest>
  <Mode>PROD</Mode>
  <Version>v0.01</Version>
  <ChannelCode></ChannelCode>
  <Terminal>
    <ProvUserID>PROVRFN</ProvUserID>
    <HashData>${xmlEscape(hashData)}</HashData>
    <UserID>${xmlEscape(orderNo)}</UserID>
    <ID>${xmlEscape(terminalId)}</ID>
    <MerchantID>${xmlEscape(merchantId)}</MerchantID>
  </Terminal>
  <Customer>
    <IPAddress>${xmlEscape(ipAddress)}</IPAddress>
    <EmailAddress>noreply@tahsilat.anypay.com.tr</EmailAddress>
  </Customer>
  <Order>
    <OrderID>${xmlEscape(orderNo)}</OrderID>
    <GroupID></GroupID>
  </Order>
  <Transaction>
    <Type>void</Type>
    <InstallmentCnt></InstallmentCnt>
    <Amount>${xmlEscape(amount)}</Amount>
    <OriginalRetrefNum>${xmlEscape(refNum)}</OriginalRetrefNum>
    <CurrencyCode>949</CurrencyCode>
    <CardholderPresentCode>0</CardholderPresentCode>
    <MotoInd>N</MotoInd>
  </Transaction>
</GVPSRequest>`
        : `<?xml version="1.0" encoding="ISO-8859-9"?>
<GVPSRequest>
  <Mode>PROD</Mode>
  <Version>v0.01</Version>
  <Terminal>
    <ProvUserID>PROVRFN</ProvUserID>
    <HashData>${xmlEscape(hashData)}</HashData>
    <UserID>${xmlEscape(orderNo)}</UserID>
    <ID>${xmlEscape(terminalId)}</ID>
    <MerchantID>${xmlEscape(merchantId)}</MerchantID>
  </Terminal>
  <Customer>
    <IPAddress>${xmlEscape(ipAddress)}</IPAddress>
  </Customer>
  <Order>
    <OrderID>${xmlEscape(orderNo)}</OrderID>
  </Order>
  <Transaction>
    <Type>refund</Type>
    <Amount>${xmlEscape(amount)}</Amount>
    <CurrencyCode>949</CurrencyCode>
  </Transaction>
</GVPSRequest>`;

    try {
      const raw = await postGvpsXml(apiUrl, xml);
      const code = xmlTag(raw, 'Code') || xmlTag(raw, 'ResponseCode');
      const errorMessage =
        xmlTag(raw, 'ErrorMsg') || xmlTag(raw, 'ErrorMessage') || xmlTag(raw, 'SysErrMsg');
      const ok = code === '00';
      const retref = xmlTag(raw, 'RetrefNum') || xmlTag(raw, 'HostRefNum');
      return {
        success: ok,
        message: ok ? 'Başarılı' : errorMessage || 'Garanti işlemi başarısız',
        responseCode: code,
        authCode: xmlTag(raw, 'AuthCode') || undefined,
        referenceCode: retref || undefined,
        raw: { text: raw },
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Garanti iptal/iade başarısız',
      };
    }
  },
};
