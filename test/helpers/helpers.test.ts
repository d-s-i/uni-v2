import hre from "hardhat";
import { parseEther, hexValue, formatEther } from "ethers/lib/utils";
import { Provider } from "@ethersproject/abstract-provider";

import { UserPositionETHForExactTokens, UserPositionExactETHForTokens } from "../types.test";
import { weth, token0, uniPair, deployer, uniPairClass } from "../index.test";
import { UniswapV2PairClass } from "../../src/UniswapV2PairClass";

export const deployNewPairClass = async function() {
    const reserves = await uniPair.getReserves();

    const contractToken0Reserves = BigInt(reserves[0].toHexString());
    const contractToken1Rerserves = BigInt(reserves[1].toHexString());

    return new UniswapV2PairClass(
        [weth.address, token0.address], 
        weth.address, 
        contractToken0Reserves,
        contractToken1Rerserves
    );
}

export const resetEthBalances = async function(addresses: string[], value: bigint) {
    for(const i of addresses) {
        await hre.network.provider.send("hardhat_setBalance", [
            i,
            hexValue(value),
        ]);
    }
}

export const getDeadline = async function (provider: Provider) {
    const block = await provider.getBlock("latest");
    const now = block.timestamp;
    return now + 100;
}

export const getPriceFromContract = async function(
    path: [string, string]
) {
    const sortedContractReserves = await getSortedContractReserves(path);
    const price = sortedContractReserves[1].mul(parseEther("1")).div(sortedContractReserves[0]);
    return price;
}

export const getUserPositionETHForExactTokens = async function(
    amountOut: bigint,
    slippage: number
) {
    const path: [string, string] = [weth.address, token0.address];
    const [amountInBeforeSlipage] = uniPairClass.getAmountsIn(amountOut, path);
    const amountInMax = amountInBeforeSlipage * BigInt(100 + slippage) / 100n;
    const userPosition: UserPositionETHForExactTokens = { 
      amountInMax: amountInMax,
      amountOut: amountOut,
      path: path
    };
    return userPosition;
}

export const getUserPositionExactETHForTokens = async function(
    amountIn: bigint,
    slippage: number
) {
    const path: [string, string] = [weth.address, token0.address];
    const [,amountOutBeforeSlipage] = uniPairClass.getAmountsOut(amountIn, path);
    const amountOutMin = amountOutBeforeSlipage * BigInt(100 - slippage) / 100n;

    const userPosition: UserPositionExactETHForTokens = { 
      amountIn: amountIn,
      amountOutMin: amountOutMin,
      path: path
    };

    return userPosition;
}

export const calcGasFeesOfTx = async function(hash: string) {
    const receipt = await deployer.provider!.getTransactionReceipt(hash);
    const gasUsed = receipt.gasUsed;
    const gasPrice = BigInt(receipt.effectiveGasPrice.toHexString());
    const gasFees = gasPrice * BigInt(gasUsed.toHexString());
    return gasFees;
}

export const getClassTokenReserve = function(
    path:  [string, string],
    tokenAddress: string
) {
    const initialReserves = uniPairClass.getSortedReserves(path);
    const sortedReserves = uniPairClass.getSortedReserves(path);
    const sortedTokens = UniswapV2PairClass.sortTokens(path[0], path[1]);
    if(path[0] === sortedTokens[0] && path[0] === tokenAddress) {
      return sortedReserves[0];
    } else {
      return initialReserves[1];
    }
}

export const getSortedContractReserves = async function(
    path: [string, string]
) {
    const contractReserves = await uniPair.getReserves();
    const sortedTokens = UniswapV2PairClass.sortTokens(path[0], path[1]);
    if(sortedTokens[0] === path[0]) {
        return contractReserves;
      } else {
        return [contractReserves[1], contractReserves[0]];
    }
}