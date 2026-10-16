/** POS / banka gateway ortak tipleri */

export type PosCredentials = {
  bankId: number;
  bankName: string;
  posId: number;
  posName: string;
  infrastructureId: string;
  merchantId: string;
  terminalSafeId: string;
  securityKey: string;
  /** NestPay terminal / provizyon şifresi */
  terminalPassword: string;
  securityType: string;
  gateway3dUrl: string;
  apiUrl: string;
  xmlUrl: string;
};

export type CardPayload = {
  number: string;
  holder: string;
  /** MMYY */
  expiry: string;
  cvc: string;
};

export type Initiate3dInput = {
  pos: PosCredentials;
  orderId: string;
  amount: number;
  currencyCode: string;
  installment: number;
  card: CardPayload;
  okUrl: string;
  failUrl: string;
  clientIp?: string;
  email?: string;
};

/** Bankaya gidecek HTML form-post (iframe değil — X-Frame-Options: DENY) */
export type ThreeDForm = {
  actionUrl: string;
  method: 'POST';
  fields: Record<string, string>;
  /** Halk Öde vb. API HTML döndürürse form yerine bu belge yazılır */
  html?: string;
};

export type Initiate3dResult =
  | { kind: 'form'; form: ThreeDForm; adapter: string }
  | { kind: 'error'; message: string };

export type CallbackResult = {
  orderId: string;
  success: boolean;
  responseCode: string;
  message: string;
  raw: Record<string, string>;
  /** 3D modeli için provizyon API çağrısı gerekir */
  needsProvision: boolean;
  /** PayTR vb. — kullanıcı dönüşü; banka bildirimi gelene kadar durum=3 kalsın */
  awaitingExternalConfirm?: boolean;
  secure?: {
    secureId: string;
    secureEcomInd: string;
    secureData: string;
    secureMd: string;
    mdStatus: string;
  };
};

export type FinalizeCallbackInput = {
  body: Record<string, unknown>;
  pos: PosCredentials;
  orderId: string;
  clientIp?: string;
  /** Kuveyt / iyzico / PayTR provizyon tutarı */
  amount?: number;
};

export type ReversePaymentInput = {
  pos: PosCredentials;
  orderId: string;
  kind: 'void' | 'refund';
  amount?: number;
  clientIp?: string;
  /** Yapı Kredi hostLogKey / Vakıf RRN / NestPay HostRefNum */
  referenceCode?: string;
  /** Callback’te dönen banka sipariş / xid (yoksa orderId) */
  bankOrderId?: string;
};

export type ReversePaymentResult = {
  success: boolean;
  message: string;
  responseCode?: string;
  authCode?: string;
  referenceCode?: string;
  raw?: unknown;
};

export interface PaymentGateway {
  readonly id: string;
  initiate3d(input: Initiate3dInput): Promise<Initiate3dResult>;
  parseCallback(body: Record<string, unknown>, secretKey: string): CallbackResult;
  /** VakıfBank MPI vb. — 3D sonrası VPOS Sale */
  finalizeCallback?(input: FinalizeCallbackInput): Promise<CallbackResult>;
  /** Aynı gün Void / sonraki gün Refund — opsiyonel */
  reverse?(input: ReversePaymentInput): Promise<ReversePaymentResult>;
}
