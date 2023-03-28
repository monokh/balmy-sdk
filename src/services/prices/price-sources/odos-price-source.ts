import { ChainId, TimeString, TokenAddress } from '@types';
import { IFetchService } from '@services/fetch/types';
import { IPriceSource, TokenPrice } from '../types';
import { Chains } from '@chains';
import { reduceTimeout, timeoutPromise } from '@shared/timeouts';
import { filterRejectedResults, isSameAddress } from '@shared/utils';
import { Addresses } from '@shared/constants';

const SUPPORTED_CHAINS = [Chains.ETHEREUM, Chains.POLYGON, Chains.OPTIMISM, Chains.AVALANCHE, Chains.ARBITRUM, Chains.BNB_CHAIN];

export class OdosPriceSource implements IPriceSource {
  constructor(private readonly fetch: IFetchService) {}

  async getCurrentPrices({
    addresses,
    config,
  }: {
    addresses: Record<ChainId, TokenAddress[]>;
    config?: { timeout?: TimeString };
  }): Promise<Record<ChainId, Record<TokenAddress, TokenPrice>>> {
    const reducedTimeout = reduceTimeout(config?.timeout, '100');
    const promises = Object.entries(addresses).map(async ([chainId, addresses]) => [
      Number(chainId),
      await timeoutPromise(this.getCurrentPricesInChain(chainId, addresses, reducedTimeout), reducedTimeout),
    ]);
    return Object.fromEntries(await filterRejectedResults(promises));
  }

  private async getCurrentPricesInChain(chainId: string, addresses: TokenAddress[], timeout?: TimeString) {
    const params = addresses.map((address) => `token_addresses=${mapToken(address)}`).join('&');
    const url = `https://api.odos.xyz/pricing/token/${chainId}?${params}`;
    const response = await this.fetch.fetch(url, { timeout });
    const body: Response = await response.json();
    const lowercased = toLowerCase(body.tokenPrices);
    return Object.fromEntries(addresses.map((address) => [address, lowercased[mapToken(address.toLowerCase())]]));
  }

  supportedChains(): ChainId[] {
    return SUPPORTED_CHAINS.map(({ chainId }) => chainId);
  }
}

const ODOS_NATIVE_TOKEN = '0x0000000000000000000000000000000000000000';
function mapToken(address: TokenAddress) {
  return isSameAddress(address, Addresses.NATIVE_TOKEN) ? ODOS_NATIVE_TOKEN : address;
}

function toLowerCase(prices: Record<TokenAddress, TokenPrice>) {
  return Object.fromEntries(Object.entries(prices).map(([token, price]) => [token.toLowerCase(), price]));
}

type Response = { tokenPrices: Record<TokenAddress, TokenPrice> };