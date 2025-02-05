import qs from 'qs';
import { Chains } from '@chains';
import { ChainId } from '@types';
import { isSameAddress } from '@shared/utils';
import { IQuoteSource, QuoteParams, QuoteSourceMetadata, SourceQuoteResponse, SourceQuoteTransaction, BuildTxParams } from './types';
import { addQuoteSlippage, calculateAllowanceTarget, failed } from './utils';

// Supported Networks: https://0x.org/docs/0x-swap-api/introduction#supported-networks
const ZRX_API: Record<ChainId, string> = {
  [Chains.ETHEREUM.chainId]: 'https://api.0x.org',
  [Chains.OPTIMISM.chainId]: 'https://optimism.api.0x.org',
  [Chains.POLYGON.chainId]: 'https://polygon.api.0x.org',
  [Chains.BNB_CHAIN.chainId]: 'https://bsc.api.0x.org',
  [Chains.FANTOM.chainId]: 'https://fantom.api.0x.org',
  [Chains.CELO.chainId]: 'https://celo.api.0x.org',
  [Chains.AVALANCHE.chainId]: 'https://avalanche.api.0x.org',
  [Chains.ARBITRUM.chainId]: 'https://arbitrum.api.0x.org',
  [Chains.BASE.chainId]: 'https://base.api.0x.org',
  [Chains.ETHEREUM_GOERLI.chainId]: 'https://goerli.api.0x.org',
  [Chains.POLYGON_MUMBAI.chainId]: 'https://mumbai.api.0x.org',
};

const ZRX_METADATA: QuoteSourceMetadata<ZRXSupport> = {
  name: '0x/Matcha',
  supports: {
    chains: Object.keys(ZRX_API).map(Number),
    swapAndTransfer: false,
    buyOrders: true,
  },
  logoURI: 'ipfs://QmPQY4siKEJHZGW5F4JDBrUXCBFqfpnKzPA2xDmboeuZzL',
};
type ZRXConfig = { apiKey: string };
type ZRXSupport = { buyOrders: true; swapAndTransfer: false };
type ZRXData = { tx: SourceQuoteTransaction };
export class ZRXQuoteSource implements IQuoteSource<ZRXSupport, ZRXConfig, ZRXData> {
  getMetadata() {
    return ZRX_METADATA;
  }

  async quote({
    components: { fetchService },
    request: {
      chain,
      sellToken,
      buyToken,
      order,
      config: { slippagePercentage, timeout },
      accounts: { takeFrom },
    },
    config,
  }: QuoteParams<ZRXSupport, ZRXConfig>): Promise<SourceQuoteResponse<ZRXData>> {
    const api = ZRX_API[chain.chainId];
    const queryParams = {
      sellToken,
      buyToken,
      takerAddress: takeFrom,
      skipValidation: config.disableValidation,
      slippagePercentage: slippagePercentage / 100,
      enableSlippageProtection: false,
      affiliateAddress: config.referrer?.address,
      sellAmount: order.type === 'sell' ? order.sellAmount.toString() : undefined,
      buyAmount: order.type === 'buy' ? order.buyAmount.toString() : undefined,
    };
    const queryString = qs.stringify(queryParams, { skipNulls: true, arrayFormat: 'comma' });
    const url = `${api}/swap/v1/quote?${queryString}`;

    const headers: HeadersInit = {
      ['0x-api-key']: config.apiKey,
    };

    const response = await fetchService.fetch(url, { timeout, headers });
    if (!response.ok) {
      failed(ZRX_METADATA, chain, sellToken, buyToken, await response.text());
    }
    const { data, buyAmount, sellAmount, to, allowanceTarget, estimatedGas, value } = await response.json();

    const quote = {
      sellAmount: BigInt(sellAmount),
      buyAmount: BigInt(buyAmount),
      estimatedGas: BigInt(estimatedGas),
      allowanceTarget: calculateAllowanceTarget(sellToken, allowanceTarget),
      customData: {
        tx: {
          calldata: data,
          to,
          value: BigInt(value ?? 0),
        },
      },
    };

    return addQuoteSlippage(quote, order.type, isSameAddress(to, chain.wToken) ? 0 : slippagePercentage);
  }

  async buildTx({ request }: BuildTxParams<ZRXConfig, ZRXData>): Promise<SourceQuoteTransaction> {
    return request.customData.tx;
  }

  isConfigAndContextValid(config: Partial<ZRXConfig> | undefined): config is ZRXConfig {
    return !!config?.apiKey;
  }
}
