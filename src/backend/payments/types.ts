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
};

export interface PaymentGateway {
  readonly id: string;
  initiate3d(input: Initiate3dInput): Promise<Initiate3dResult>;
  parseCallback(body: Record<string, unknown>, secretKey: string): CallbackResult;
  /** VakıfBank MPI vb. — 3D sonrası VPOS Sale */
  finalizeCallback?(input: FinalizeCallbackInput): Promise<CallbackResult>;
}
