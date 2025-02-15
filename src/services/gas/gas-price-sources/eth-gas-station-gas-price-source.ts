import { ChainId, FieldsRequirements, SupportRecord, TimeString } from '@types';
import { IGasPriceSource, EIP1159GasPrice, GasPriceResult, GasValueForVersion } from '@services/gas/types';
import { IFetchService } from '@services/fetch/types';
import { Chains } from '@chains';
import { parseUnits } from 'viem';

type GasValues = GasValueForVersion<'standard' | 'fast' | 'instant', EIP1159GasPrice>;
export class EthGasStationGasPriceSource implements IGasPriceSource<GasValues> {
  constructor(private readonly fetchService: IFetchService) {}

  supportedSpeeds() {
    const support: SupportRecord<GasValues> = { standard: 'present', fast: 'present', instant: 'present' };
    return { [Chains.ETHEREUM.chainId]: support };
  }

  async getGasPrice<Requirements extends FieldsRequirements<GasValues>>({
    chainId,
    config,
  }: {
    chainId: ChainId;
    config?: { timeout?: TimeString };
  }) {
    const response = await this.fetchService.fetch('https://api.ethgasstation.info/api/fee-estimate', { timeout: config?.timeout });
    const {
      nextBaseFee,
      priorityFee: { standard, fast, instant },
    }: { nextBaseFee: number; priorityFee: { fast: number; instant: number; standard: number } } = await response.json();
    return {
      standard: calculateGas(nextBaseFee, standard),
      fast: calculateGas(nextBaseFee, fast),
      instant: calculateGas(nextBaseFee, instant),
    } as GasPriceResult<GasValues, Requirements>;
  }
}

function calculateGas(baseFee: number, priorityFee: number): EIP1159GasPrice {
  return {
    maxFeePerGas: parseUnits(`${baseFee + priorityFee}`, 9),
    maxPriorityFeePerGas: parseUnits(`${priorityFee}`, 9),
  };
}
