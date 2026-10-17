import { createHash } from 'node:crypto';
import type {
  CallbackResult,
  FinalizeCallbackInput,
  Initiate3dInput,
  Initiate3dResult,
  PaymentGateway,
  PosCredentials,
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

function resolveGvpsUrl(pos: PosCredentials): string {
  const explicit = (pos.apiUrl || pos.xmlUrl || '').trim();
  if (explicit) return explicit;
  return resolveMode(pos.gateway3dUrl) === 'TEST'
    ? 'https://sanalposprovtest.garanti.com.tr/VPServlet'
    : 'https://sanalposprov.garanti.com.tr/VPServlet';
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
    const acqReturn = (raw.acqreturncode || raw.acqReturnCode || raw.AcqReturnCode || '').trim();
    const returnCode = (raw.returncode || raw.returnCode || raw.ReturnCode || '').trim();
    const approvedFlag = (raw.approved || raw.Approved || '').trim().toLowerCase();
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

    const troyMsgOk =
      /TROY\s+Gateway\s+Result/i.test(statusBlob) &&
      /Code:\s*'0{2,3}'/i.test(statusBlob) &&
      /Message:\s*'Success'/i.test(statusBlob);
    const authCode = (raw.authcode || raw.AuthCode || '').trim();
    const hostRef = (raw.hostrefnum || raw.HostRefNum || '').trim();
    const retRef = (raw.retrefnum || raw.RetrefNum || '').trim();
    const hasCaptureProof = Boolean(authCode || hostRef || retRef);
    const md = (raw.mdstatus || raw.mdStatus || raw.MdStatus || '').trim();
    const mdFail = md !== '' && !['1', '2', '3', '4'].includes(md);
    const mdAuthOk = ['1', '2', '3', '4'].includes(md);
    // proc=92 vb. banka reddi — Troy metni yanıltıcı olabilir (3DS OK, çekim değil)
    const hardFail = proc !== '' && proc !== '00' && proc !== '000';
    const classicOk =
      !hardFail &&
      (response.toLowerCase() === 'approved' ||
        proc === '00' ||
        proc === '000' ||
        acqReturn === '00' ||
        acqReturn === '000' ||
        returnCode === '00' ||
        returnCode === '000' ||
        approvedFlag === 'true' ||
        approvedFlag === '1' ||
        approvedFlag === 'yes');
    // Troy: mesaj OK + gerçek çekim kanıtı (auth/ref) veya klasik 00 — tek başına yetmez
    const troyOk = troyMsgOk && !hardFail && (classicOk || hasCaptureProof);
    const cavv = (raw.cavv || raw.Cavv || '').trim();
    const eci = (raw.eci || raw.Eci || '').trim();
    const xid = (raw.xid || raw.Xid || raw.XID || '').trim();
    const mdToken = (raw.md || raw.MD || '').trim();
    const hasSecure = Boolean(cavv && mdToken && xid);
    // 3D model: SMS OK, Approved yok → GVPS sales ile çek
    const needsProvision = !classicOk && !troyOk && !hardFail && !mdFail && mdAuthOk && hasSecure;
    const challengeOnly =
      /Challenge\s+authentication\s+via\s+ACS/i.test(statusBlob) &&
      !classicOk &&
      !troyOk &&
      !needsProvision;
    const basarili = !mdFail && !hardFail && (classicOk || troyOk || needsProvision);

    let reason = 'ok';
    if (mdFail) reason = `mdStatus_fail:${md || '?'}`;
    else if (hardFail && proc === '92')
      reason = troyMsgOk
        ? 'proc_92_declined_troy_msg_not_capture'
        : 'proc_92_declined';
    else if (hardFail) reason = `proc_declined:${proc}`;
    else if (basarili && classicOk) reason = 'classic_approved_or_00';
    else if (basarili && troyOk) reason = 'troy_success_with_capture';
    else if (needsProvision) reason = 'md_ok_needs_gvps_provision';
    else if (troyMsgOk && !hasCaptureProof)
      reason = 'troy_success_without_auth_or_ref';
    else if (challengeOnly) reason = 'acs_challenge_no_payment_result';
    else if (/not\s+authenticated/i.test(statusBlob)) reason = 'not_authenticated';
    else reason = 'no_approved_no_00_no_capture';

    const failMsg =
      hardFail && proc === '92'
        ? 'Garanti kod 92: çekim reddedildi (PROVAUT şifre/hash/terminal veya bankada 3DPay tanımı)'
        : hardFail
          ? `Garanti kod ${proc}: işlem reddedildi`
          : challengeOnly
            ? '3DS Challenge döndü ama ödeme sonucu yok'
            : troyMsgOk && !hasCaptureProof
              ? 'Troy Success var ama Auth/HostRef yok — para çekilmedi'
              : raw.mderrormessage ||
                raw.MdErrorMessage ||
                raw.errmsg ||
                raw.ErrMsg ||
                response ||
                'Ödeme başarısız';

    const fieldSnap: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (/card|cvv|pan|number|expire|password|hash/i.test(k)) continue;
      const t = String(v).trim();
      if (!t) continue;
      fieldSnap[k] = t.length > 120 ? `${t.slice(0, 120)}…` : t;
    }

    console.info(
      `[garanti-callback] order=${orderId || '-'} success=${basarili && !needsProvision} reason=${reason}` +
        ` response=${response || '-'} proc=${proc || '-'} md=${md || '-'}` +
        ` auth=${authCode ? 'yes' : 'no'} hostRef=${hostRef ? 'yes' : 'no'} retRef=${retRef ? 'yes' : 'no'}` +
        ` troyMsg=${troyMsgOk ? 'yes' : 'no'} needsProvision=${needsProvision} secure=${hasSecure}`,
    );

    return {
      orderId,
      success: basarili,
      responseCode: proc || acqReturn || returnCode || response || (troyOk ? '000' : '') || md,
      message: basarili && !needsProvision ? 'Approved' : needsProvision ? '3D OK — GVPS provizyon' : failMsg,
      raw: {
        ...raw,
        AuthCode: authCode,
        HostRefNum: hostRef,
        RetrefNum: retRef,
        Rrn: retRef || hostRef,
        _diag: JSON.stringify({
          reason,
          response: response || null,
          proc: proc || null,
          acqReturn: acqReturn || null,
          returnCode: returnCode || null,
          approvedFlag: approvedFlag || null,
          mdStatus: md || null,
          hardFail,
          hasAuthCode: Boolean(authCode),
          hasHostRef: Boolean(hostRef),
          hasRetRef: Boolean(retRef),
          hasSecure,
          troyMsgOk,
          classicOk,
          troyOk,
          needsProvision,
          challengeOnly,
          fields: fieldSnap,
        }),
      },
      needsProvision,
      secure: needsProvision
        ? {
            secureId: xid,
            secureEcomInd: eci,
            secureData: cavv,
            secureMd: mdToken,
            mdStatus: md,
          }
        : undefined,
    };
  },

  /** 3D model: SMS sonrası GVPS sales — para burada çekilir */
  async finalizeCallback(input: FinalizeCallbackInput): Promise<CallbackResult> {
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.body)) {
      if (v == null) continue;
      raw[k] = String(v);
    }

    const merchantId = input.pos.merchantId.trim();
    const terminalId =
      input.pos.terminalSafeId.replace(/\D/g, '').trim() || input.pos.terminalSafeId.trim();
    const password = input.pos.terminalPassword.trim();
    const orderNo = (raw.orderid || raw.orderId || raw.oid || input.orderId || '').trim();
    const amount =
      (raw.txnamount || raw.txnAmount || '').trim() ||
      (input.amount != null ? amountCents(input.amount) : '');
    const currency = (raw.txncurrencycode || raw.txnCurrencyCode || '949').trim() || '949';
    const installment = (raw.txninstallmentcount || raw.txnInstallmentCount || '').trim();
    const cavv = (raw.cavv || raw.Cavv || '').trim();
    const eci = (raw.eci || raw.Eci || '').trim();
    const xid = (raw.xid || raw.Xid || raw.XID || '').trim();
    const mdToken = (raw.md || raw.MD || '').trim();
    const ip = (input.clientIp || raw.customeripaddress || '127.0.0.1').replace(/^::ffff:/, '');
    const email = (raw.customeremailaddress || 'musteri@anypay.com.tr').trim();
    const apiUrl = resolveGvpsUrl(input.pos);

    if (!merchantId || !terminalId || !password) {
      return {
        orderId: orderNo,
        success: false,
        responseCode: 'CFG',
        message: 'Garanti provizyon: POS kimlik / şifre eksik',
        raw,
        needsProvision: false,
      };
    }
    if (!orderNo || !amount || !cavv || !mdToken || !xid) {
      return {
        orderId: orderNo,
        success: false,
        responseCode: '3D',
        message: 'Garanti provizyon: 3D alanları eksik (cavv/md/xid/tutar)',
        raw,
        needsProvision: false,
      };
    }

    const hashData = refundVoidHash({ orderNo, terminalId, amount, password });
    const mode = resolveMode(input.pos.gateway3dUrl);
    const xml = `<?xml version="1.0" encoding="ISO-8859-9"?>
<GVPSRequest>
  <Mode>${mode}</Mode>
  <Version>v0.01</Version>
  <Terminal>
    <ProvUserID>PROVAUT</ProvUserID>
    <HashData>${xmlEscape(hashData)}</HashData>
    <UserID>PROVAUT</UserID>
    <ID>${xmlEscape(terminalId)}</ID>
    <MerchantID>${xmlEscape(merchantId)}</MerchantID>
  </Terminal>
  <Customer>
    <IPAddress>${xmlEscape(ip)}</IPAddress>
    <EmailAddress>${xmlEscape(email)}</EmailAddress>
  </Customer>
  <Card>
    <Number></Number>
    <ExpireDate></ExpireDate>
    <CVV2></CVV2>
  </Card>
  <Order>
    <OrderID>${xmlEscape(orderNo)}</OrderID>
    <GroupID></GroupID>
  </Order>
  <Transaction>
    <Type>sales</Type>
    <InstallmentCnt>${xmlEscape(installment)}</InstallmentCnt>
    <Amount>${xmlEscape(amount)}</Amount>
    <CurrencyCode>${xmlEscape(currency)}</CurrencyCode>
    <CardholderPresentCode>13</CardholderPresentCode>
    <MotoInd>N</MotoInd>
    <Secure3D>
      <AuthenticationCode>${xmlEscape(cavv)}</AuthenticationCode>
      <SecurityLevel>${xmlEscape(eci)}</SecurityLevel>
      <TxnID>${xmlEscape(xid)}</TxnID>
      <Md>${xmlEscape(mdToken)}</Md>
    </Secure3D>
  </Transaction>
</GVPSRequest>`;

    try {
      const xmlRaw = await postGvpsXml(apiUrl, xml);
      const code = xmlTag(xmlRaw, 'Code') || xmlTag(xmlRaw, 'ProcReturnCode') || xmlTag(xmlRaw, 'ResponseCode');
      const msg =
        xmlTag(xmlRaw, 'Message') ||
        xmlTag(xmlRaw, 'ErrorMsg') ||
        xmlTag(xmlRaw, 'ErrorMessage') ||
        xmlTag(xmlRaw, 'SysErrMsg');
      const auth = xmlTag(xmlRaw, 'AuthCode');
      const retref = xmlTag(xmlRaw, 'RetrefNum') || xmlTag(xmlRaw, 'HostRefNum');
      const ok = code === '00' || msg.toLowerCase() === 'approved';
      console.info(
        `[garanti-provision] order=${orderNo} ok=${ok} code=${code || '-'} auth=${auth ? 'yes' : 'no'} ref=${retref ? 'yes' : 'no'}`,
      );
      return {
        orderId: orderNo,
        success: ok,
        responseCode: code || (ok ? '00' : 'ERR'),
        message: ok
          ? 'Approved'
          : code === '92'
            ? 'Garanti provizyon 92: PROVAUT şifre/hash/terminal hatalı veya 3DPay tanımı yok'
            : msg || 'Garanti provizyon başarısız',
        raw: {
          ...raw,
          AuthCode: auth,
          HostRefNum: retref,
          RetrefNum: retref,
          Rrn: retref,
          _diag: JSON.stringify({
            reason: ok ? 'gvps_provision_ok' : `gvps_provision_fail:${code || 'ERR'}`,
            code: code || null,
            hasAuthCode: Boolean(auth),
            hasRetRef: Boolean(retref),
          }),
        },
        needsProvision: false,
      };
    } catch (err) {
      return {
        orderId: orderNo,
        success: false,
        responseCode: 'NET',
        message: err instanceof Error ? err.message : 'Garanti provizyon ağ hatası',
        raw,
        needsProvision: false,
      };
    }
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
