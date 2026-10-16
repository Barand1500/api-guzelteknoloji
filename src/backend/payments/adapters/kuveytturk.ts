import { createHash } from 'node:crypto';
import type {
  CallbackResult,
  FinalizeCallbackInput,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
} from '../types.js';

/**
 * Kuveyt Türk TDV2 — referans kuveytturk.adapter.js (xml2js yerine regex)
 * POS: merchantId=işyeri, terminalSafeId=müşteri no, terminalPassword=userName? 
 * Eski: customerId, merchantId, userName, password
 * Biz: terminalSafeId=customerId, merchantId=merchantId, posName/user→ terminalPassword alanı userName,
 *      securityKey=password
 */

function xmlEscape(v: string) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function amountKurus(value: number) {
  return String(Math.round(Number(value || 0) * 100));
}

function sha1Base64(value: string) {
  return createHash('sha1').update(String(value), 'utf8').digest('base64');
}

function xmlTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = String(xml || '').match(re);
  return (m?.[1] || '').trim();
}

async function postXml(url: string, xml: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/xml',
      'Content-Length': Buffer.byteLength(xml, 'utf8').toString(),
    },
    body: xml,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Kuveyt Türk isteği başarısız: ${res.status}`);
  return text;
}

export function looksLikeKuveytTurk(pos: {
  gateway3dUrl: string;
  infrastructureId: string;
  bankName: string;
  apiUrl?: string;
}): boolean {
  const blob = `${pos.gateway3dUrl} ${pos.apiUrl || ''} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return (
    blob.includes('kuveyt') ||
    blob.includes('kuveytturk') ||
    pos.infrastructureId === 'infra-kuveytturk'
  );
}

export const kuveytturkGateway: PaymentGateway = {
  id: 'kuveytturk',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const customerId = input.pos.terminalSafeId.trim();
    const merchantId = input.pos.merchantId.trim();
    const userName = input.pos.terminalPassword.trim();
    const password = input.pos.securityKey.trim();
    const gatewayUrl = (input.pos.gateway3dUrl || '').trim();

    if (!customerId || !merchantId || !userName || !password) {
      return {
        kind: 'error',
        message:
          'Kuveyt Türk: Müşteri No / İşyeri No / API Kullanıcı / Şifre eksik (Sanal POS)',
      };
    }
    if (!gatewayUrl) {
      return { kind: 'error', message: 'Kuveyt Türk: 3D ödeme URL bulunamadı' };
    }
    if (!/^\d{15,16}$/.test(input.card.number)) {
      return { kind: 'error', message: 'Kart numarası geçersiz' };
    }
    if (!/^\d{4}$/.test(input.card.expiry)) {
      return { kind: 'error', message: 'Son kullanma MMYY olmalı' };
    }

    const returnUrl = input.okUrl;
    const failUrl = input.failUrl || returnUrl;
    const tutar = amountKurus(input.amount);
    const hashedPassword = sha1Base64(password);
    const hashData = sha1Base64(
      `${merchantId}${input.orderId}${tutar}${returnUrl}${failUrl}${userName}${hashedPassword}`,
    );
    const ay = input.card.expiry.slice(0, 2);
    const yil = input.card.expiry.slice(2, 4);
    const installment = Math.max(1, input.installment);
    const installmentCount = installment === 1 ? 0 : installment;
    const email = (input.email || '').trim();
    const ip = (input.clientIp || '127.0.0.1').replace(/^::ffff:/, '');
    const holder = (input.card.holder || '').trim() || 'Musteri';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<KuveytTurkVPosMessage xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <APIVersion>TDV2.0.0</APIVersion>
  <OkUrl>${xmlEscape(returnUrl)}</OkUrl>
  <FailUrl>${xmlEscape(failUrl)}</FailUrl>
  <HashData>${xmlEscape(hashData)}</HashData>
  <MerchantId>${xmlEscape(merchantId)}</MerchantId>
  <CustomerId>${xmlEscape(customerId)}</CustomerId>
  <DeviceData>
    <DeviceChannel>02</DeviceChannel>
    <ClientIP>${xmlEscape(ip)}</ClientIP>
  </DeviceData>
  <CardHolderData>
    <BillAddrCountry>792</BillAddrCountry>
    <Email>${xmlEscape(email)}</Email>
  </CardHolderData>
  <UserName>${xmlEscape(userName)}</UserName>
  <CardNumber>${xmlEscape(input.card.number)}</CardNumber>
  <CardExpireDateYear>${xmlEscape(yil)}</CardExpireDateYear>
  <CardExpireDateMonth>${xmlEscape(ay)}</CardExpireDateMonth>
  <CardCVV2>${xmlEscape(input.card.cvc)}</CardCVV2>
  <CardHolderName>${xmlEscape(holder)}</CardHolderName>
  <TransactionType>Sale</TransactionType>
  <InstallmentCount>${installmentCount}</InstallmentCount>
  <Amount>${xmlEscape(tutar)}</Amount>
  <DisplayAmount>${xmlEscape(tutar)}</DisplayAmount>
  <CurrencyCode>0949</CurrencyCode>
  <MerchantOrderId>${xmlEscape(input.orderId)}</MerchantOrderId>
  <TransactionSecurity>3</TransactionSecurity>
</KuveytTurkVPosMessage>`;

    try {
      const html = await postXml(gatewayUrl, xml);
      if (!html.trim()) {
        return { kind: 'error', message: 'Kuveyt Türk boş yanıt döndü' };
      }
      return {
        kind: 'form',
        adapter: this.id,
        form: {
          actionUrl: gatewayUrl,
          method: 'POST',
          fields: {},
          html,
        },
      };
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'Kuveyt Türk 3D başlatılamadı',
      };
    }
  },

  parseCallback(body: Record<string, unknown>, _secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const authenticationResponse = (raw.AuthenticationResponse || '').trim();
    if (!authenticationResponse) {
      return {
        orderId: '',
        success: false,
        responseCode: '',
        message: 'AuthenticationResponse bulunamadı',
        raw,
        needsProvision: false,
      };
    }

    let decodedXml = authenticationResponse;
    try {
      decodedXml = decodeURIComponent(authenticationResponse);
    } catch {
      /* zaten düz xml olabilir */
    }

    const responseCode = xmlTag(decodedXml, 'ResponseCode');
    const responseMessage = xmlTag(decodedXml, 'ResponseMessage');
    const orderId = xmlTag(decodedXml, 'MerchantOrderId') || xmlTag(decodedXml, 'OrderId');
    const md = xmlTag(decodedXml, 'MD');

    if (responseCode !== '00') {
      return {
        orderId,
        success: false,
        responseCode,
        message: responseMessage || '3D doğrulama başarısız',
        raw: { ...raw, decodedXml },
        needsProvision: false,
      };
    }

    return {
      orderId,
      success: true,
      responseCode,
      message: 'Kuveyt 3D OK — provizyon bekleniyor',
      raw: { ...raw, decodedXml },
      needsProvision: true,
      secure: {
        secureId: md,
        secureEcomInd: '',
        secureData: decodedXml,
        secureMd: md,
        mdStatus: '1',
      },
    };
  },

  async finalizeCallback(input: FinalizeCallbackInput): Promise<CallbackResult> {
    const customerId = input.pos.terminalSafeId.trim();
    const merchantId = input.pos.merchantId.trim();
    const userName = input.pos.terminalPassword.trim();
    const password = input.pos.securityKey.trim();
    const provisionUrl = (input.pos.apiUrl || '').trim();
    if (!provisionUrl) {
      return {
        orderId: input.orderId,
        success: false,
        responseCode: '',
        message: 'Kuveyt Türk provizyon URL (apiUrl) bulunamadı',
        raw: {},
        needsProvision: false,
      };
    }

    const body: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.body)) {
      if (v == null) continue;
      body[k] = String(v);
    }
    let authXml = body.AuthenticationResponse || '';
    try {
      authXml = decodeURIComponent(authXml);
    } catch {
      /* */
    }
    const md = xmlTag(authXml, 'MD') || '';
    const installmentFromAuth = xmlTag(authXml, 'InstallmentCount');
    const amount = amountKurus(input.amount ?? 0);
    const hashedPassword = sha1Base64(password);
    const hashData = sha1Base64(
      `${merchantId}${input.orderId}${amount}${userName}${hashedPassword}`,
    );
    const installmentCount = installmentFromAuth || '0';

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<KuveytTurkVPosMessage xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <APIVersion>TDV2.0.0</APIVersion>
  <HashData>${xmlEscape(hashData)}</HashData>
  <MerchantId>${xmlEscape(merchantId)}</MerchantId>
  <CustomerId>${xmlEscape(customerId)}</CustomerId>
  <UserName>${xmlEscape(userName)}</UserName>
  <TransactionType>Sale</TransactionType>
  <InstallmentCount>${xmlEscape(installmentCount)}</InstallmentCount>
  <Amount>${xmlEscape(amount)}</Amount>
  <MerchantOrderId>${xmlEscape(input.orderId)}</MerchantOrderId>
  <TransactionSecurity>3</TransactionSecurity>
  <KuveytTurkVPosAdditionalData>
    <AdditionalData>
      <Key>MD</Key>
      <Data>${xmlEscape(md)}</Data>
    </AdditionalData>
  </KuveytTurkVPosAdditionalData>
</KuveytTurkVPosMessage>`;

    try {
      const provisionRaw = await postXml(provisionUrl, xml);
      const finalCode = xmlTag(provisionRaw, 'ResponseCode');
      const finalMessage = xmlTag(provisionRaw, 'ResponseMessage');
      const basarili = finalCode === '00';
      const orderIdOut = xmlTag(provisionRaw, 'OrderId') || input.orderId;
      const authCode =
        xmlTag(provisionRaw, 'ProvisionNumber') || xmlTag(provisionRaw, 'Stan') || '';
      const rrn = xmlTag(provisionRaw, 'RRN') || '';
      return {
        orderId: orderIdOut,
        success: basarili,
        responseCode: finalCode,
        message: basarili ? 'Başarılı' : finalMessage || 'İşlem başarısız',
        raw: {
          provisionRaw,
          AuthCode: authCode,
          Rrn: rrn,
          HostRefNum: rrn,
        },
        needsProvision: false,
      };
    } catch (err) {
      return {
        orderId: input.orderId,
        success: false,
        responseCode: '',
        message: err instanceof Error ? err.message : 'Kuveyt provizyon başarısız',
        raw: {},
        needsProvision: false,
      };
    }
  },
};
