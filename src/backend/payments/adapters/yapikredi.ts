import { createHash } from 'node:crypto';
import type {
  CallbackResult,
  FinalizeCallbackInput,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
  ReversePaymentInput,
  ReversePaymentResult,
} from '../types.js';

/**
 * Yapı Kredi Posnet OOS — referans yapikredi.adapter.js
 * NestPay değil.
 * POS: merchantId, terminalSafeId=Terminal No, terminalPassword=Posnet ID, securityKey=ENC Anahtarı
 * xmlUrl = Posnet XML servis
 */

function xmlEscape(v: string) {
  return String(v ?? '')
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

function randomChars(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < len; i++) {
    s += chars[Math.floor(Math.random() * chars.length)];
  }
  return s;
}

function xidOlustur(odemeNo: string): string {
  const base = String(odemeNo).slice(0, 20);
  if (base.length >= 20) return base.slice(0, 20);
  return base + randomChars(20 - base.length);
}

function hashString(originalString: string): string {
  return createHash('sha256').update(originalString, 'utf8').digest('base64');
}

function amountKurus(value: number): string {
  return String(Number(value || 0).toFixed(2)).replace('.', '');
}

async function postXml(url: string, xml: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ xmldata: xml }).toString(),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Yapı Kredi XML isteği başarısız: ${res.status}`);
  return text;
}

function xmlServisUrl(pos: { xmlUrl: string; apiUrl: string }): string {
  return (pos.xmlUrl || pos.apiUrl || '').trim();
}

export function looksLikeYapiKredi(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
  xmlUrl?: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.xmlUrl || ''} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return (
    blob.includes('yapikredi') ||
    blob.includes('yapı kredi') ||
    blob.includes('yapi kredi') ||
    blob.includes('posnet') ||
    pos.infrastructureId === 'infra-yapikredi'
  );
}

export const yapikrediGateway: PaymentGateway = {
  id: 'yapikredi',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const merchantId = input.pos.merchantId.trim();
    const terminalId = input.pos.terminalSafeId.trim();
    const posnetId = input.pos.terminalPassword.trim();
    const encKey = input.pos.securityKey.trim();
    const xmlUrl = xmlServisUrl(input.pos);
    const gatewayUrl = (input.pos.gateway3dUrl || '').trim();

    if (!merchantId || !terminalId || !posnetId || !encKey) {
      return {
        kind: 'error',
        message:
          'Yapı Kredi: İşyeri / Terminal / Posnet ID / ENC Anahtarı eksik (Sanal POS)',
      };
    }
    if (!xmlUrl) {
      return { kind: 'error', message: 'Yapı Kredi: XML servis URL bulunamadı' };
    }
    if (!gatewayUrl) {
      return { kind: 'error', message: 'Yapı Kredi: 3D gateway URL bulunamadı' };
    }
    if (!/^\d{15,16}$/.test(input.card.number)) {
      return { kind: 'error', message: 'Kart numarası geçersiz' };
    }
    if (!/^\d{4}$/.test(input.card.expiry)) {
      return { kind: 'error', message: 'Son kullanma MMYY olmalı' };
    }

    const xid = xidOlustur(input.orderId);
    const amount = amountKurus(input.amount);
    const yil = input.card.expiry.slice(2, 4);
    const ay = input.card.expiry.slice(0, 2);
    const installment = String(input.installment || 1);

    const xml = `
<posnetRequest>
  <mid>${xmlEscape(merchantId)}</mid>
  <tid>${xmlEscape(terminalId)}</tid>
  <oosRequestData>
    <posnetid>${xmlEscape(posnetId)}</posnetid>
    <XID>${xmlEscape(xid)}</XID>
    <amount>${xmlEscape(amount)}</amount>
    <currencyCode>TL</currencyCode>
    <installment>${xmlEscape(installment)}</installment>
    <tranType>Sale</tranType>
    <cardHolderName>${xmlEscape(input.card.holder || 'Musteri')}</cardHolderName>
    <ccno>${xmlEscape(input.card.number)}</ccno>
    <expDate>${xmlEscape(yil + ay)}</expDate>
    <cvc>${xmlEscape(input.card.cvc)}</cvc>
  </oosRequestData>
</posnetRequest>`;

    try {
      const raw = await postXml(xmlUrl, xml);
      const approved = xmlTag(raw, 'approved');
      const respText = xmlTag(raw, 'respText');
      const data1 = xmlTag(raw, 'data1');
      const data2 = xmlTag(raw, 'data2');
      const sign = xmlTag(raw, 'sign');

      if (!data1 || !data2 || !sign) {
        return {
          kind: 'error',
          message:
            respText ||
            (approved === '0' ? 'Yapı Kredi OOS isteği reddedildi' : 'Yapı Kredi OOS yanıtı eksik'),
        };
      }

      const fields: Record<string, string> = {
        mid: merchantId,
        posnetID: posnetId,
        posnetData: data1,
        posnetData2: data2,
        digest: sign,
        merchantReturnURL: input.okUrl,
        lang: 'tr',
      };

      return {
        kind: 'form',
        adapter: this.id,
        form: { actionUrl: gatewayUrl, method: 'POST', fields },
      };
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'Yapı Kredi 3D başlatılamadı',
      };
    }
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const xid = (raw.Xid || raw.XID || raw.xid || '').trim();
    const bankPacket = (raw.BankPacket || '').trim();
    const merchantPacket = (raw.MerchantPacket || '').trim();
    const sign = (raw.Sign || '').trim();

    if (!bankPacket || !merchantPacket || !sign) {
      return {
        orderId: xid,
        success: false,
        responseCode: '',
        message: 'Yapı Kredi callback paketi eksik',
        raw,
        needsProvision: false,
      };
    }

    return {
      orderId: xid,
      success: true,
      responseCode: '',
      message: '3D dönüşü — resolve/provizyon bekleniyor',
      raw,
      needsProvision: true,
    };
  },

  async finalizeCallback(input: FinalizeCallbackInput): Promise<CallbackResult> {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const merchantId = input.pos.merchantId.trim();
    const terminalId = input.pos.terminalSafeId.trim();
    const posnetId = input.pos.terminalPassword.trim();
    const encKey = input.pos.securityKey.trim();
    const xmlUrl = xmlServisUrl(input.pos);

    if (!merchantId || !terminalId || !posnetId || !encKey || !xmlUrl) {
      return {
        orderId: input.orderId,
        success: false,
        responseCode: '',
        message: 'Yapı Kredi POS / XML URL eksik',
        raw,
        needsProvision: false,
      };
    }

    const xid = (raw.Xid || raw.XID || input.orderId || '').trim();
    const amount = (raw.Amount || '').trim() || amountKurus(input.amount ?? 0);
    const callbackMerchantId = (raw.MerchantId || merchantId).trim();

    const firstHash = hashString(`${encKey};${terminalId}`);
    const MAC = hashString(`${xid};${amount};TL;${callbackMerchantId};${firstHash}`);

    const resolveXml = `
<posnetRequest>
<mid>${xmlEscape(merchantId)}</mid>
<tid>${xmlEscape(terminalId)}</tid>
<oosResolveMerchantData>
<bankData>${xmlEscape(raw.BankPacket || '')}</bankData>
<merchantData>${xmlEscape(raw.MerchantPacket || '')}</merchantData>
<sign>${xmlEscape(raw.Sign || '')}</sign>
<mac>${xmlEscape(MAC)}</mac>
</oosResolveMerchantData>
</posnetRequest>`;

    const resolveRaw = await postXml(xmlUrl, resolveXml);
    const mdStatus = xmlTag(resolveRaw, 'mdStatus');

    if (mdStatus !== '1') {
      return {
        orderId: xid,
        success: false,
        responseCode: mdStatus,
        message: `3D mdStatus: ${mdStatus || '-'}`,
        raw: { ...raw, resolveRaw, mdStatus },
        needsProvision: false,
      };
    }

    const finalizeXml = `
<posnetRequest>
<mid>${xmlEscape(merchantId)}</mid>
<tid>${xmlEscape(terminalId)}</tid>
<oosTranData>
<bankData>${xmlEscape(raw.BankPacket || '')}</bankData>
<wpAmount>0</wpAmount>
<mac>${xmlEscape(MAC)}</mac>
</oosTranData>
</posnetRequest>`;

    const finalizeRaw = await postXml(xmlUrl, finalizeXml);
    const approved = xmlTag(finalizeRaw, 'approved');
    const authCode = xmlTag(finalizeRaw, 'authCode');
    const hostlogkey = xmlTag(finalizeRaw, 'hostlogkey');
    const respCode = xmlTag(finalizeRaw, 'respCode');
    const respText = xmlTag(finalizeRaw, 'respText');
    const ok = approved === '1';

    return {
      orderId: xid,
      success: ok,
      responseCode: respCode || approved,
      message: ok
        ? 'Başarılı'
        : `İşlem başarısız. Hata kodu: ${respCode || '-'} - ${respText || '-'}`,
      raw: {
        ...raw,
        AuthCode: authCode,
        hostlogkey,
        approved,
        respCode,
        respText,
      },
      needsProvision: false,
    };
  },

  /** reverse / return — referans yapikredi.adapter.js iptal/iade */
  async reverse(input: ReversePaymentInput): Promise<ReversePaymentResult> {
    const merchantId = input.pos.merchantId.trim();
    const terminalId = input.pos.terminalSafeId.trim();
    const xmlUrl = xmlServisUrl(input.pos);
    const hostLogKey = (input.referenceCode || '').trim();
    const islemNo = (input.bankOrderId || input.orderId || '').trim();

    if (!merchantId || !terminalId) {
      return { success: false, message: 'Yapı Kredi iptal/iade: İşyeri / Terminal eksik' };
    }
    if (!xmlUrl) return { success: false, message: 'Yapı Kredi XML servis URL bulunamadı' };
    if (!hostLogKey) {
      return { success: false, message: 'Yapı Kredi iptal/iade için referans kodu (hostLogKey) bulunamadı' };
    }

    const xml =
      input.kind === 'void'
        ? `
<posnetRequest>
    <mid>${xmlEscape(merchantId)}</mid>
    <tid>${xmlEscape(terminalId)}</tid>
    <reverse>
        <transaction>sale</transaction>
        <hostLogKey>${xmlEscape(hostLogKey)}</hostLogKey>
    </reverse>
</posnetRequest>`
        : `
<posnetRequest>
    <mid>${xmlEscape(merchantId)}</mid>
    <tid>${xmlEscape(terminalId)}</tid>
    <tranDateRequired>1</tranDateRequired>
    <return>
        <amount>${xmlEscape(amountKurus(input.amount ?? 0))}</amount>
        <currencyCode>TL</currencyCode>
        <hostLogKey>${xmlEscape(hostLogKey)}</hostLogKey>
    </return>
</posnetRequest>`;

    try {
      const raw = await postXml(xmlUrl, xml);
      const approved = xmlTag(raw, 'approved');
      const authCode = xmlTag(raw, 'authCode');
      const hostlogkey = xmlTag(raw, 'hostlogkey');
      const respText = xmlTag(raw, 'respText');
      const respCode = xmlTag(raw, 'respCode');
      const ok = approved === '1';
      return {
        success: ok,
        message: ok
          ? 'Başarılı'
          : respText || `Yapı Kredi işlemi başarısız${respCode ? ` (${respCode})` : ''}`,
        responseCode: respCode || approved,
        authCode: authCode || undefined,
        referenceCode: hostlogkey || hostLogKey,
        raw: { text: raw, islemNo },
      };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : 'Yapı Kredi iptal/iade başarısız',
      };
    }
  },
};
