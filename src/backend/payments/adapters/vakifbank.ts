import { createHash } from 'node:crypto';
import type {
  CallbackResult,
  FinalizeCallbackInput,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
} from '../types.js';

/**
 * VakıfBank MPI Enrollment → ACS → VPOS Sale
 * Referans: vakifbank.adapter.js (xml2js yerine regex parse)
 */

function amountDecimal(value: number): string {
  return Number(value || 0).toFixed(2);
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

function hashIso88599Base64(value: string): string {
  return createHash('sha256').update(String(value), 'utf8').digest('base64');
}

function markaKoduBul(cardNumber: string): string {
  const first = cardNumber.charAt(0);
  if (first === '5') return '200'; // Mastercard
  if (first === '9') return '300'; // Troy
  return '100'; // Visa default
}

async function postForm(url: string, data: Record<string, string>): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body: new URLSearchParams(data).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`VakıfBank enrollment başarısız: ${res.status}`);
  }
  return text;
}

async function postVposXml(url: string, xml: string): Promise<string> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'text/xml',
    },
    body: new URLSearchParams({ prmstr: xml }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`VakıfBank VPOS başarısız: ${res.status}`);
  }
  return text;
}

function merchantPassword(pos: { securityKey: string; terminalPassword: string }): string {
  return (pos.securityKey || pos.terminalPassword || '').trim();
}

function verifyParesHash(
  post: Record<string, string>,
  password: string,
): boolean {
  const incomingHash = (post.Hash || '').trim();
  if (!incomingHash) return false;

  const verifyId = (post.VerifyEnrollmentRequestId || '').trim();
  const merchantId = (post.MerchantId || '').trim();
  const currency = (post.PurchCurrency || '').trim();
  const amount = (post.PurchAmount || '').trim();
  const eci = (post.Eci || '').trim().padStart(2, '0');
  const cavv = (post.Cavv || '').trim();
  const mdStatus = (post.MdStatus || '').trim();
  const paresStatus = (post.ParesStatus || post.Status || '').trim();

  const plain =
    verifyId +
    merchantId +
    currency +
    amount +
    eci +
    cavv +
    mdStatus +
    paresStatus +
    password;

  return hashIso88599Base64(plain) === incomingHash;
}

export function looksLikeVakifBank(pos: {
  gateway3dUrl: string;
  xmlUrl: string;
  apiUrl: string;
  infrastructureId: string;
  bankName: string;
}): boolean {
  const blob =
    `${pos.gateway3dUrl} ${pos.xmlUrl} ${pos.apiUrl} ${pos.infrastructureId} ${pos.bankName}`.toLowerCase();
  return (
    blob.includes('vakif') ||
    blob.includes('vakıf') ||
    blob.includes('mpi_enrollment') ||
    blob.includes('mpiapi') ||
    blob.includes('onlineodeme.vakifbank') ||
    pos.infrastructureId === 'infra-vakifbank'
  );
}

export const vakifbankGateway: PaymentGateway = {
  id: 'vakifbank',

  async initiate3d(input: Initiate3dInput): Promise<Initiate3dResult> {
    const merchantId = input.pos.merchantId.trim();
    const terminalNo = input.pos.terminalSafeId.trim();
    const password = merchantPassword(input.pos);

    if (!merchantId || !terminalNo || !password) {
      return {
        kind: 'error',
        message: 'VakıfBank: Merchant ID / Terminal No / Merchant Password eksik',
      };
    }

    const enrollmentUrl =
      (input.pos.gateway3dUrl || '').trim() ||
      'https://3dsecure.vakifbank.com.tr/MPIAPI/MPI_Enrollment.aspx';

    if (!/^\d{15,16}$/.test(input.card.number)) {
      return { kind: 'error', message: 'Kart numarası geçersiz' };
    }
    if (!/^\d{4}$/.test(input.card.expiry)) {
      return { kind: 'error', message: 'Son kullanma MMYY olmalı' };
    }

    const mm = input.card.expiry.slice(0, 2);
    const yy = input.card.expiry.slice(2, 4);
    // Callback lookup odemeNo ile — timestamp ekleme
    const verifyId = input.orderId;
    const returnUrl = input.okUrl;
    const taksit = input.installment > 1 ? String(input.installment) : '';

    const enrollmentData: Record<string, string> = {
      MerchantId: merchantId,
      MerchantPassword: password,
      VerifyEnrollmentRequestId: verifyId,
      Pan: input.card.number,
      ExpiryDate: `${yy}${mm}`,
      PurchaseAmount: amountDecimal(input.amount),
      Currency: '949',
      BrandName: markaKoduBul(input.card.number),
      SuccessUrl: returnUrl,
      FailureUrl: input.failUrl || returnUrl,
    };
    if (taksit) enrollmentData.InstallmentCount = taksit;

    let raw: string;
    try {
      raw = await postForm(enrollmentUrl, enrollmentData);
    } catch (err) {
      return {
        kind: 'error',
        message: err instanceof Error ? err.message : 'VakıfBank enrollment hatası',
      };
    }

    const status = xmlTag(raw, 'Status');
    const acsUrl = xmlTag(raw, 'ACSUrl');
    const paReq = xmlTag(raw, 'PAReq');
    const termUrl = xmlTag(raw, 'TermUrl');
    const md = xmlTag(raw, 'MD');

    if (status !== 'Y' || !acsUrl || !paReq) {
      return {
        kind: 'error',
        message: `3D doğrulama başlatılamadı (Status: ${status || '-'})`,
      };
    }

    return {
      kind: 'form',
      adapter: this.id,
      form: {
        actionUrl: acsUrl,
        method: 'POST',
        fields: {
          PaReq: paReq,
          TermUrl: termUrl || returnUrl,
          MD: md,
        },
      },
    };
  },

  parseCallback(body: Record<string, unknown>, secretKey: string): CallbackResult {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const orderId =
      raw.VerifyEnrollmentRequestId ||
      raw.verifyEnrollmentRequestId ||
      raw.OrderId ||
      raw.orderId ||
      '';

    if (!verifyParesHash(raw, secretKey)) {
      return {
        orderId,
        success: false,
        responseCode: 'HASH',
        message: 'Hash hatası!',
        raw,
        needsProvision: false,
      };
    }

    const mdStatus = (raw.MdStatus || '').trim();
    const paresOk = mdStatus === '1' || mdStatus === '2' || mdStatus === '3' || mdStatus === '4';

    if (!paresOk) {
      return {
        orderId,
        success: false,
        responseCode: mdStatus || 'MD',
        message: raw.ErrorMessage || raw.ErrorMsg || '3D doğrulama başarısız',
        raw,
        needsProvision: false,
      };
    }

    return {
      orderId,
      success: true,
      responseCode: mdStatus,
      message: '3D doğrulandı — provizyon',
      raw,
      needsProvision: true,
      secure: {
        secureId: orderId,
        secureEcomInd: raw.Eci || '',
        secureData: raw.Cavv || '',
        secureMd: raw.MD || '',
        mdStatus,
      },
    };
  },

  async finalizeCallback(input: FinalizeCallbackInput): Promise<CallbackResult> {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const merchantId = input.pos.merchantId.trim();
    const terminalNo = input.pos.terminalSafeId.trim();
    const password = merchantPassword(input.pos);
    const transactionId =
      (raw.VerifyEnrollmentRequestId || '').trim() || input.orderId || `TX_${Date.now()}`;
    const taksit = (raw.InstallmentCount || '').trim();

    const vposUrl =
      (input.pos.xmlUrl || '').trim() ||
      (input.pos.apiUrl || '').trim() ||
      'https://onlineodeme.vakifbank.com.tr:4443/VposService/v3/Vposreq.aspx';

    const xml = `
<VposRequest>
    <MerchantId>${xmlEscape(merchantId)}</MerchantId>
    <Password>${xmlEscape(password)}</Password>
    <TerminalNo>${xmlEscape(terminalNo)}</TerminalNo>
    <TransactionType>Sale</TransactionType>
    <TransactionId>${xmlEscape(transactionId)}</TransactionId>
    <ClientIp>${xmlEscape(input.clientIp || '127.0.0.1')}</ClientIp>
    <ECI>${xmlEscape(raw.Eci || '')}</ECI>
    ${raw.Cavv ? `<CAVV>${xmlEscape(raw.Cavv)}</CAVV>` : ''}
    <MpiTransactionId>${xmlEscape(raw.VerifyEnrollmentRequestId || '')}</MpiTransactionId>
    <OrderId>${xmlEscape(raw.VerifyEnrollmentRequestId || transactionId)}</OrderId>
    ${taksit && Number(taksit) > 1 ? `<NumberOfInstallments>${xmlEscape(taksit)}</NumberOfInstallments>` : ''}
    <TransactionDeviceSource>0</TransactionDeviceSource>
</VposRequest>`;

    const vposRaw = await postVposXml(vposUrl, xml);
    const resultCode = xmlTag(vposRaw, 'ResultCode');
    const resultDetail = xmlTag(vposRaw, 'ResultDetail');
    const authCode = xmlTag(vposRaw, 'AuthCode');
    const rrn = xmlTag(vposRaw, 'Rrn');
    const ok = resultCode === '0000';

    return {
      orderId: transactionId,
      success: ok,
      responseCode: resultCode,
      message: ok ? 'Başarılı' : resultDetail || 'VakıfBank işlemi başarısız',
      raw: {
        ...raw,
        ResultCode: resultCode,
        ResultDetail: resultDetail,
        AuthCode: authCode,
        Rrn: rrn,
      },
      needsProvision: false,
    };
  },
};
