import { ethers } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { router, weth, token0, deployer, uniPairClass } from "../index.test";
import { getDeadline, calcGasFeesOfTx } from "./helpers.test";

export const swapExactETHForTokensLoopFromClass = function(
    iterations: number,
    swapAmount: bigint
) {
    let swappedAmounts: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        const swappedAmount = uniPairClass.simulateSwapExactETHForTokens(swapAmount, 1n, [weth.address, token0.address]);
        swappedAmounts.push(swappedAmount[1]);
    }
    const totalSwapAmount = swappedAmounts.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapAmount;
}

export const SwapETHForExactTokensLoopFromClass = function(
    iterations: number,
    swapAmount: bigint
) {
    let swappedAmounts: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
            swapAmount,
            [weth.address, token0.address]
        );
        swappedAmounts.push(swappedAmount[1]);
    }
    const totalSwapAmount = swappedAmounts.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapAmount;
}

export const swapExactTokensForETHLoopFromClass = function(
    iterations: number,
    swapAmount: bigint
) {
    let swappedAmounts: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        const swappedAmount = uniPairClass.simulateSwapExactTokensForEth(
            swapAmount, 
            1n, 
            [token0.address, weth.address]
        );
        swappedAmounts.push(swappedAmount[1]);
    }
    const totalSwapAmount = swappedAmounts.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapAmount;
}

export const swapTokensForExactETHLoopFromClass = function(
    iterations: number,
    swapAmountOut: bigint
) {
    let swappedAmounts: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
            swapAmountOut, 
            [token0.address, weth.address]
        );
        swappedAmounts.push(swappedAmount[1]);
    }
    const totalSwapAmount = swappedAmounts.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapAmount;
}

export const swapTokensForExactETHLoopFromContract = async function(
    iterations: number,
    swapArgs: { signer: SignerWithAddress, swapAmount: bigint }
) {
    let swapFees: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        // const swap_fees = await swapExactEthForTokensFromContract(swapArgs.swapAmount, token0.address, swapArgs.signer);
        const swap_fees = await swapTokensForExactETHFromContract(swapArgs.signer, swapArgs.swapAmount);
        swapFees.push(swap_fees);
    }
    const totalSwapFees = swapFees.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapFees;
}

export const swapExactETHForTokensLoopFromContract = async function(
    iterations: number,
    swapArgs: { signer: SignerWithAddress, swapAmount: bigint }
) {
    let swapFees: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        const swap_fees = await swapExactETHForTokensFromContract(swapArgs.swapAmount, swapArgs.signer);
        swapFees.push(swap_fees);
    }

    const totalSwapFees = swapFees.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapFees;
}

export const swapETHForExactTokensLoopFromContract = async function(
    iterations: number,
    swapArgs: { swapAmount: bigint, signer: SignerWithAddress }
) {
    let swapFees: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        const amountIn0 = await router.getAmountsIn(
            swapArgs.swapAmount,
            [weth.address, token0.address]
          );
        const swap_fees = await swapETHForExactTokensFromContract(
            swapArgs.swapAmount,
            amountIn0[0],
            swapArgs.signer
        );
        swapFees.push(swap_fees);
    }
    const totalSwapFees = swapFees.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapFees;
}

export const swapExactETHForTokensFromContract = async function(
    exactAmountIn: bigint,
    signer: SignerWithAddress
) {
    const tempRouter = router.connect(signer);
    const deadline = await getDeadline(signer.provider!);

    const swap_tx = await tempRouter.swapExactETHForTokens(
      1, 
      [weth.address, token0.address], 
      signer.address, 
      deadline,
      { value: exactAmountIn }
    );

    return calcGasFeesOfTx(swap_tx.hash);
}

export const swapExactTokensForETHFromContract = async function(
    signer: SignerWithAddress,
    swapAmount: bigint
) {
    const tempRouter = router.connect(signer);

    const token0Balance = await token0.balanceOf(signer.address);
    if(token0Balance.lt(swapAmount)) {
        const depToken0 = token0.connect(deployer);
        await depToken0.transfer(signer.address, swapAmount);
    }

    const deadline = await getDeadline(signer.provider!);

    const tempToken0 = token0.connect(signer);
    const approve_tx = await tempToken0.approve(router.address, BigInt(2**255));
    const approve_gasFees = await calcGasFeesOfTx(approve_tx.hash);
    
    const tx = await tempRouter.swapExactTokensForETH(
        swapAmount,
      1,
      [token0.address, weth.address],
      signer.address,
      deadline
    );
    const tx_gasFees = await calcGasFeesOfTx(tx.hash);

    return approve_gasFees + tx_gasFees;
}

export const swapTokensForExactETHFromContract = async function(
    signer: SignerWithAddress,
    amountOut: bigint
) {
    const tempRouter = router.connect(signer);
    const deadline = await getDeadline(deployer.provider!);

    let tempToken0 = token0.connect(deployer);
    await token0.transfer(signer.address, parseEther("100000"));
    
    tempToken0 = tempToken0.connect(signer);
    const app_tx = await tempToken0.approve(router.address, ethers.constants.MaxUint256);

    const app_fees = await calcGasFeesOfTx(app_tx.hash);

    const amountIn = await router.getAmountsIn(amountOut, [token0.address, weth.address]);
    const swap_tx = await tempRouter.swapTokensForExactETH(
      amountOut,
      amountIn[0],
      [token0.address, weth.address],
      signer.address,
      deadline,
    );

    const swap_fees = await calcGasFeesOfTx(swap_tx.hash);
    return swap_fees + app_fees;
}

export const swapETHForExactTokensFromContract = async function(
    amountOut: bigint,
    amountInMax: bigint,
    signer: SignerWithAddress,
) {

    const tempRouter = router.connect(signer);
    const deadline = await getDeadline(signer.provider!);

    const swap_tx = await tempRouter.swapETHForExactTokens(
        amountOut,
        [weth.address, token0.address],
        signer.address,
        deadline,
        { value: amountInMax }
    );
    return calcGasFeesOfTx(swap_tx.hash);
}

export const swapExactTokensForETHLoopFromContract = async function(
    iterations: number,
    swapArgs: { signer: SignerWithAddress, swapAmount: bigint }
) {
    let swapFees: bigint[] = [];
    for(let i = 0; i < iterations; i++) {
        const swap_fees = await swapExactTokensForETHFromContract(swapArgs.signer, swapArgs.swapAmount);
        swapFees.push(swap_fees);
    }

    const totalSwapFees = swapFees.reduce((previousValue, currentValue) => previousValue + currentValue);
    return totalSwapFees;
}