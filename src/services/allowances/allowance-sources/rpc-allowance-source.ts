import { ChainId, TimeString, TokenAddress } from '@types';
import { AllowanceInput, IAllowanceSource, OwnerAddress, SpenderAddress } from '../types';
import { timeoutPromise } from '@shared/timeouts';
import { filterRejectedResults, groupByChain } from '@shared/utils';
import ERC20_ABI from '@shared/abis/erc20';
import { IProviderService } from '@services/providers';
import { Address as ViemAddress } from 'viem';
import { MULTICALL_ADDRESS } from '@services/providers/utils';

export class RPCAllowanceSource implements IAllowanceSource {
  constructor(private readonly providerService: IProviderService) {}

  supportedChains(): ChainId[] {
    return this.providerService.supportedChains();
  }

  async getAllowances({
    allowances,
    config,
  }: {
    allowances: AllowanceInput[];
    config?: { timeout?: TimeString };
  }): Promise<Record<ChainId, Record<TokenAddress, Record<OwnerAddress, Record<SpenderAddress, bigint>>>>> {
    const groupedByChain = groupByChain(allowances);

    const promises = Object.entries(groupedByChain).map(async ([chainId, checks]) => [
      Number(chainId),
      await timeoutPromise(this.getAllowancesInChain(Number(chainId), checks), config?.timeout, { reduceBy: '100' }),
    ]);
    return Object.fromEntries(await filterRejectedResults(promises));
  }

  private async getAllowancesInChain(chainId: ChainId, checks: Omit<AllowanceInput, 'chainId'>[]) {
    const contracts = checks.map(({ token, owner, spender }) => ({
      address: token as ViemAddress,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, spender],
    }));
    const multicallResults = contracts.length
      ? await this.providerService.getViemPublicClient({ chainId }).multicall({ multicallAddress: MULTICALL_ADDRESS, contracts, batchSize: 0 })
      : [];
    const result: Record<TokenAddress, Record<OwnerAddress, Record<SpenderAddress, bigint>>> = {};
    for (let i = 0; i < multicallResults.length; i++) {
      const multicallResult = multicallResults[i];
      if (multicallResult.status === 'failure') continue;
      const { token, owner, spender } = checks[i];
      if (!(token in result)) result[token] = {};
      if (!(owner in result[token])) result[token][owner] = {};
      result[token][owner][spender] = multicallResult.result as unknown as bigint;
    }
    return result;
  }
}
