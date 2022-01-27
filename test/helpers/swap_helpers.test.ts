import { BigNumber, ethers } from "ethers";
import { parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { router, weth, token0, deployer, uniPairClass } from "../index.test";
import { getDeadline, calcGasFeesOfTx } from "./helpers.test";

export const swapTokensForExactETHFromContract = async function(
    signer: SignerWithAddress,
    amountOut: BigNumber
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
    return swap_fees.add(app_fees);
}

export const swapETHForExactTokensFromContract = async function(
    amountOut: BigNumber,
    amountIn: BigNumber,
    signer: SignerWithAddress,
) {

    const tempRouter = router.connect(signer);
    const deadline = await getDeadline(signer.provider!);

    const swap_tx = await tempRouter.swapETHForExactTokens(
        amountOut,
        [weth.address, token0.address],
        signer.address,
        deadline,
        { value: amountIn }
    );
    return calcGasFeesOfTx(swap_tx.hash);
}

export const swapExactTokensForEthLoopFromContract = async function(
    iterations: number,
    swapArgs: { signer: SignerWithAddress, swapAmount: BigNumber }
) {
    let swapFees: BigNumber[] = [];
    for(let i = 0; i < iterations; i++) {
        const swap_fees = await swapExactTokensForEthFromContract(swapArgs.signer, swapArgs.swapAmount);
        swapFees.push(swap_fees);
    }

    const totalSwapFees = swapFees.reduce((previousValue, currentValue) => previousValue.add(currentValue));
    return totalSwapFees;
}

export const swapExactEthForTokensLoopFromContract = async function(
    iterations: number,
    swapArgs: { signer: SignerWithAddress, swapAmount: BigNumber }
) {
    let swapFees: BigNumber[] = [];
    for(let i = 0; i < iterations; i++) {
        const swap_fees = await swapExactEthForTokensFromContract(swapArgs.swapAmount, token0.address, swapArgs.signer);
        swapFees.push(swap_fees);
    }

    const totalSwapFees = swapFees.reduce((previousValue, currentValue) => previousValue.add(currentValue));
    return totalSwapFees;
}

export const swapExactETHForTokensLoopFromClass = function(
    iterations: number,
    swapAmount: BigNumber
) {
    let swappedAmounts: BigNumber[] = [];
    for(let i = 0; i < iterations; i++) {
        const swappedAmount = uniPairClass.simulateSwapExactETHForTokens(swapAmount, BigNumber.from(1), [weth.address, token0.address]);
        swappedAmounts.push(swappedAmount[1]);
    }
    const totalSwapAmount = swappedAmounts.reduce((previousValue, currentValue) => previousValue.add(currentValue));
    return totalSwapAmount;
}

export const swapETHForExactTokensLoopFromContract = async function(
    iterations: number,
    swapArgs: { swapAmount: BigNumber, signer: SignerWithAddress }
) {
    let swapFees: BigNumber[] = [];
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
    const totalSwapFees = swapFees.reduce((previousValue, currentValue) => previousValue.add(currentValue));
    return totalSwapFees;
}

export const SwapETHForExactTokensLoopFromClass = function(
    iterations: number,
    swapAmount: BigNumber
) {
    let swappedAmounts: BigNumber[] = [];
    for(let i = 0; i < iterations; i++) {
        const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
            swapAmount,
            [weth.address, token0.address]
        );
        swappedAmounts.push(swappedAmount[1]);
    }
    const totalSwapAmount = swappedAmounts.reduce((previousValue, currentValue) => previousValue.add(currentValue));
    return totalSwapAmount;
}

export const swapExactTokensForEthLoopFromClass = function(
    iterations: number,
    swapAmount: BigNumber
) {
    let swappedAmounts: BigNumber[] = [];
    for(let i = 0; i < iterations; i++) {
        const swappedAmount = uniPairClass.simulateSwapExactTokensForEth(
            swapAmount, 
            BigNumber.from(1), 
            [token0.address, weth.address]
        );
        swappedAmounts.push(swappedAmount[1]);
    }
    const totalSwapAmount = swappedAmounts.reduce((previousValue, currentValue) => previousValue.add(currentValue));
    return totalSwapAmount;
}

export const swapExactEthForTokensFromContract = async function(
    value: BigNumber,
    tokenAddress: string,
    signer: SignerWithAddress
) {
    const tempRouter = router.connect(signer);
    const deadline = await getDeadline(signer.provider!);

    const swap_tx = await tempRouter.swapExactETHForTokens(
      1, 
      [weth.address, tokenAddress], 
      signer.address, 
      deadline,
      { value: value }
    );

    return calcGasFeesOfTx(swap_tx.hash);
}

export const swapExactTokensForEthFromContract = async function(
    signer: SignerWithAddress,
    swapAmount: BigNumber
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

    return approve_gasFees.add(tx_gasFees);
}