import hre from "hardhat";
import { BigNumber, ethers } from "ethers";
import { parseEther, hexValue, formatEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Provider } from "@ethersproject/abstract-provider";

import { router, weth, token0, uniPair, deployer } from "./index.test";
import { UniswapV2PairClass } from "./UniV2PairClass.test";

export const deployNewPairClass = async function() {
    const reserves = await uniPair.getReserves();

    const contractToken0Reserves = reserves[0];
    const contractToken1Rerserves = reserves[1];

    return new UniswapV2PairClass(
        [weth.address, token0.address], 
        weth.address, 
        contractToken0Reserves, 
        contractToken1Rerserves
      );
}

export const resetEthBalances = async function(addresses: string[]) {
    for(const i of addresses) {
        await hre.network.provider.send("hardhat_setBalance", [
            i,
            hexValue(parseEther("10000")),
          ]);
    }
}

export const getDeadline = async function (provider: Provider) {
    const block = await provider.getBlock("latest");
    const now = block.timestamp;
    return now + 100;
}

export const swapExactEthForTokensFromContract = async function(
    value: BigNumber,
    tokenAddress: string,
    signer: SignerWithAddress
) {
    const tempRouter = router.connect(signer);
    const deadline = await getDeadline(signer.provider!);

    await tempRouter.swapExactETHForTokens(
      1, 
      [weth.address, tokenAddress], 
      signer.address, 
      deadline,
      { value: value }
    );
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

const calcGasFeesOfTx = async function(hash: string) {
    const receipt = await deployer.provider!.getTransactionReceipt(hash);
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice;
    const gasFees = gasPrice.mul(gasUsed);
    return gasFees;
}

export const swapTokensForExactETHFroMContract = async function(
    signer: SignerWithAddress,
    amountOut: BigNumber
) {
    const tempRouter = router.connect(signer);
    const deadline = await getDeadline(deployer.provider!);

    let tempToken0 = token0.connect(deployer);
    await token0.transfer(signer.address, parseEther("100000"));
    
    tempToken0 = tempToken0.connect(signer);
    const app_tx = await tempToken0.approve(router.address, BigInt(2**255));

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
