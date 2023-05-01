import { Chains } from '@chains';
import { TransactionResponse } from '@ethersproject/providers';

export async function calculateGasSpent(...txs: TransactionResponse[]): Promise<bigint> {
  const gasSpentEach = await Promise.all(
    txs.map((tx) => tx.wait().then((receipt) => BigInt(receipt.gasUsed.mul(receipt.effectiveGasPrice).toString())))
  );
  return gasSpentEach.reduce((accum, curr) => accum + curr, 0n);
}

export const CHAINS_WITH_KNOWN_RPC_ISSUES = [Chains.AURORA, Chains.OASIS_EMERALD].map(({ chainId }) => chainId);
