import { createDecipheriv, createHmac } from 'node:crypto';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type EpsConfig = {
  username: string;
  password: string;
  hashKey: string;
  merchantId: string;
  storeId: string;
  sandbox: boolean;
};
type EpsResponse = Record<string, unknown>;

@Injectable()
export class EpsClient {
  private readonly logger = new Logger(EpsClient.name);
  private accessToken?: string;
  private tokenExpiresAt = 0;
  private readonly timeoutMs = 15000;

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return [
      'EPS_USERNAME',
      'EPS_PASSWORD',
      'EPS_HASH_KEY',
      'EPS_MERCHANT_ID',
      'EPS_STORE_ID',
      'API_PUBLIC_URL',
    ].every((key) => Boolean(this.config.get<string>(key)));
  }

  async initializePayment(input: {
    merchantTransactionId: string;
    orderNumber: string;
    amountMinor: number;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    address: Record<string, unknown>;
    productName: string;
  }): Promise<{ redirectUrl: string; transactionId: string }> {
    const cfg = this.getConfig();
    const token = await this.getToken(cfg);
    const hash = this.hash(input.merchantTransactionId, cfg.hashKey);
    const base = this.apiBase(cfg.sandbox);
    const callbackUrl = `https://pixposbd.com/api/v1/payments/eps/return?merchantTransactionId=${encodeURIComponent(input.merchantTransactionId)}`;
    const address = input.address;
    const addressField = (name: string, fallback = ''): string => {
      const value = address[name];
      return typeof value === 'string' ? value : fallback;
    };
    const requestBody = {
      merchantId: cfg.merchantId,
      storeId: cfg.storeId,
      CustomerOrderId: input.orderNumber,
      merchantTransactionId: input.merchantTransactionId,
      transactionTypeId: 1,
      financialEntityId: 0,
      transitionStatusId: 0,
      totalAmount: Number((input.amountMinor / 100).toFixed(2)),
      ipAddress: '0.0.0.0',
      version: '1',
      successUrl: callbackUrl,
      failUrl: callbackUrl,
      cancelUrl: callbackUrl,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      CustomerAddress:
        `${addressField('line1')} ${addressField('line2')}`.trim(),
      CustomerCity: addressField('city'),
      CustomerState: addressField('region', addressField('city')),
      CustomerPostcode: addressField('postalCode'),
      CustomerCountry: addressField('country', 'BD'),
      ShipmentName: addressField('recipient', input.customerName),
      ShipmentAddress: addressField('line1'),
      ShipmentCity: addressField('city'),
      ShipmentState: addressField('region', addressField('city')),
      ShipmentPostcode: addressField('postalCode'),
      ShipmentCountry: addressField('country', 'BD'),
      ShippingMethod: 'NO',
      NoOfItem: '1',
      ProductName: input.productName.slice(0, 100),
      ProductProfile: 'general',
      ProductCategory: 'ecommerce',
      ProductList: [],
    };
    const response = await this.request<EpsResponse>(
      `${base}/v1/EPSEngine/InitializeEPS`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'x-hash': hash,
        },
        body: JSON.stringify(requestBody),
      },
    );
    if (response.ErrorMessage || response.ErrorCode)
      throw new ServiceUnavailableException(
        'EPS could not initialize this payment',
      );
    const redirectUrl = response.RedirectURL;
    const transactionId = response.TransactionId;
    if (
      typeof redirectUrl !== 'string' ||
      !redirectUrl.startsWith('https://') ||
      typeof transactionId !== 'string'
    ) {
      throw new ServiceUnavailableException(
        'EPS returned an invalid payment response',
      );
    }
    return { redirectUrl, transactionId };
  }

  async verifyPayment(merchantTransactionId: string): Promise<EpsResponse> {
    const cfg = this.getConfig();
    const token = await this.getToken(cfg);
    const hash = this.hash(merchantTransactionId, cfg.hashKey);
    const query = new URLSearchParams({ merchantTransactionId });
    return this.request<EpsResponse>(
      `${this.apiBase(cfg.sandbox)}/v1/EPSEngine/CheckMerchantTransactionStatus?${query}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'x-hash': hash },
      },
    );
  }

  decryptIpn(data: string): Record<string, unknown> {
    const encodedKey = this.config.get<string>('EPS_IPN_SECRET_KEY');
    if (!encodedKey)
      throw new ServiceUnavailableException('EPS IPN key is not configured');
    const [encodedIv, encodedCiphertext, ...extra] = data.split(':');
    if (!encodedIv || !encodedCiphertext || extra.length)
      throw new UnauthorizedException('Invalid EPS IPN payload');
    const key = Buffer.from(encodedKey, 'base64');
    const iv = Buffer.from(encodedIv, 'base64');
    if (key.length !== 32 || iv.length !== 16)
      throw new UnauthorizedException('Invalid EPS IPN key or IV');
    try {
      const decipher = createDecipheriv('aes-256-cbc', key, iv);
      const clear = Buffer.concat([
        decipher.update(Buffer.from(encodedCiphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
      const payload: unknown = JSON.parse(clear);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload))
        throw new Error('Payload must be an object');
      return payload as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('EPS IPN decryption failed');
    }
  }

  private async getToken(cfg: EpsConfig): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 30000)
      return this.accessToken;
    const hash = this.hash(cfg.username, cfg.hashKey);
    const response = await this.request<EpsResponse>(
      `${this.apiBase(cfg.sandbox)}/v1/Auth/GetToken`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hash': hash },
        body: JSON.stringify({
          userName: cfg.username,
          password: cfg.password,
        }),
      },
    );
    if (
      response.errorMessage ||
      response.errorCode ||
      typeof response.token !== 'string'
    ) {
      throw new ServiceUnavailableException('EPS authentication failed');
    }
    this.accessToken = response.token;
    const expiry =
      typeof response.expireDate === 'string' ||
      typeof response.expireDate === 'number'
        ? new Date(response.expireDate).getTime()
        : Date.now() + 5 * 60 * 1000;
    this.tokenExpiresAt = Number.isFinite(expiry)
      ? expiry
      : Date.now() + 5 * 60 * 1000;
    return this.accessToken;
  }

  private getConfig(): EpsConfig {
    if (!this.isConfigured())
      throw new ServiceUnavailableException(
        'EPS merchant credentials and callback URL are not configured',
      );
    return {
      username: this.config.getOrThrow<string>('EPS_USERNAME'),
      password: this.config.getOrThrow<string>('EPS_PASSWORD'),
      hashKey: this.config.getOrThrow<string>('EPS_HASH_KEY'),
      merchantId: this.config.getOrThrow<string>('EPS_MERCHANT_ID'),
      storeId: this.config.getOrThrow<string>('EPS_STORE_ID'),
      sandbox: this.config.get('EPS_SANDBOX') === 'true',
    };
  }

  private apiBase(sandbox: boolean): string {
    return sandbox
      ? 'https://sandboxpgapi.eps.com.bd'
      : 'https://pgapi.eps.com.bd';
  }

  private hash(value: string, key: string): string {
    return createHmac('sha512', Buffer.from(key, 'utf8'))
      .update(value, 'utf8')
      .digest('base64');
  }

  private async request<T extends EpsResponse>(
    url: string,
    init: RequestInit,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServiceUnavailableException(
        'EPS payment service is unreachable',
      );
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      let providerError = '';
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        const code = parsed.ErrorCode ?? parsed.errorCode ?? parsed.code;
        const message = parsed.ErrorMessage ?? parsed.errorMessage ?? parsed.message;
        providerError = [code, message]
          .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
          .map(String)
          .join(' — ');
      } catch {
        providerError = body;
      }
      const safeError = providerError
        .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
        .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[email redacted]')
        .slice(0, 500);
      this.logger.error(`EPS ${new URL(url).pathname} returned HTTP ${response.status}${safeError ? `: ${safeError}` : ''}`);
      throw new ServiceUnavailableException(
        'EPS payment service returned an error',
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ServiceUnavailableException('EPS returned an invalid response');
    }
  }
}
