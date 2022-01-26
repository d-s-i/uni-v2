import hre from "hardhat";
import { BigNumber, ethers, Signer } from "ethers";
import { parseEther, hexValue, formatEther, parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Provider } from "@ethersproject/abstract-provider";

import { UserPositionETHForExactTokens, UserPositionExactETHForTokens } from "./types.test";
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

export const resetEthBalances = async function(addresses: string[], value: BigNumber) {
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

const calcGasFeesOfTx = async function(hash: string) {
    const receipt = await deployer.provider!.getTransactionReceipt(hash);
    const gasUsed = receipt.gasUsed;
    const gasPrice = receipt.effectiveGasPrice;
    const gasFees = gasPrice.mul(gasUsed);
    return gasFees;
}

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

export const simulateFrontrunWithMaxSlippage = async function(
    pairContract: { contractToken0Reserves: BigNumber, contractToken1Rerserves: BigNumber },
    frontrun: { initialSwapAmount: BigNumber, signer: SignerWithAddress },
    userSwap: { swapAmount: BigNumber, amountOutMin: BigNumber }
) {
    const uniPairClass = new UniswapV2PairClass(
        [weth.address, token0.address], 
        weth.address, 
        pairContract.contractToken0Reserves, 
        pairContract.contractToken1Rerserves
    );

    const frontrunInSwapAmounts = uniPairClass.simulateSwapExactETHForTokens(
        frontrun.initialSwapAmount,
        BigNumber.from("1"),
        [weth.address, token0.address]
    );

    const deadline = await getDeadline(deployer.provider!);
    const swapInGas = await router.estimateGas.swapExactETHForTokens(
        BigNumber.from("1"),
        [weth.address, token0.address],
        frontrun.signer.address,
        deadline,
        { value: frontrun.initialSwapAmount }
    );

    const userSwapAmounts = uniPairClass.simulateSwapExactETHForTokens(
        userSwap.swapAmount,
        userSwap.amountOutMin,
        [weth.address, token0.address]
    );

    const frontrunOutSwapAmounts = uniPairClass.simulateSwapExactTokensForEth(
        frontrunInSwapAmounts[1],
        BigNumber.from("1"),
        [token0.address, weth.address]
    );
    const swapOutGas = await router.estimateGas.swapExactTokensForETH(
        frontrunInSwapAmounts[1],
        BigNumber.from("1"),
        [token0.address, weth.address],
        frontrun.signer.address,
        deadline
    );

    const feeData = await deployer.provider!.getFeeData();

    const feePaid = swapInGas.add(swapOutGas).mul(feeData.gasPrice!);
    const profits = frontrunOutSwapAmounts[1].sub(frontrun.initialSwapAmount).sub(feePaid);
    
    return profits;
}

export const getClassTokenReserve = function(
    uniPairClass: UniswapV2PairClass,
    path:  [string, string],
    tokenAddress: string
) {
    const initialReserves = uniPairClass.getSortedReserves(path);
    const sortedReserves = uniPairClass.getSortedReserves(path);
    const sortedTokens = uniPairClass.sortTokens(path[0], path[1]);
    if(path[0] === sortedTokens[0] && path[0] === tokenAddress) {
      return sortedReserves[0];
    } else {
      return initialReserves[1];
    }
}

export const getSortedContractReserves = async function(
    uniPairClass: UniswapV2PairClass,
    path: [string, string]
) {
    const contractReserves = await uniPair.getReserves();
    const sortedTokens = uniPairClass.sortTokens(path[0], path[1]);
    if(sortedTokens[0] === path[0]) {
        return contractReserves;
      } else {
        return [contractReserves[1], contractReserves[0]];
    }
}

export const getAmountsRespectingSlippageFromSwapETHForExactTokens = async function(
    userPosition: UserPositionETHForExactTokens,
    incrementValue: BigNumber
) {
    const uniPairClass2 = await deployNewPairClass();

    const unexpectedSlippage = uniPairClass2.getUnexpectedSlippage(userPosition.amountInMax, userPosition.amountOut, userPosition.path);
    const classReserves = uniPairClass2.getSortedReserves(userPosition.path);
    let frontrunAmountIn = (classReserves[0].mul(unexpectedSlippage).div(parseEther("1"))).sub(classReserves[0]);
    let [, frontrunAmountOutMin] = uniPairClass2.getAmountsOut(frontrunAmountIn, userPosition.path);


    const initialQuote = uniPairClass2.quote(frontrunAmountIn, userPosition.path);
    uniPairClass2.simulateSwapExactETHForTokens(
        frontrunAmountIn,
        frontrunAmountOutMin,
        userPosition.path
    );
    const finalQuote = uniPairClass2.quote(frontrunAmountIn, userPosition.path);

    let createdSlippage = initialQuote.mul(parseEther("1")).div(finalQuote);

    let amountToSubstract = incrementValue;

    while(createdSlippage.gt(unexpectedSlippage)) {
        const uniPairClass3 = await deployNewPairClass();
        const classReserves = uniPairClass3.getSortedReserves(userPosition.path);
        frontrunAmountIn = (classReserves[0].mul(unexpectedSlippage).div(parseEther("1"))).sub(classReserves[0]).sub(amountToSubstract);
        [, frontrunAmountOutMin] = uniPairClass3.getAmountsOut(frontrunAmountIn, userPosition.path);
    
    
        const initialQuote = uniPairClass3.quote(frontrunAmountIn, userPosition.path);
        uniPairClass3.simulateSwapExactETHForTokens(
            frontrunAmountIn,
            frontrunAmountOutMin,
            userPosition.path
        );
        const finalQuote = uniPairClass3.quote(frontrunAmountIn, userPosition.path);
    
        createdSlippage = initialQuote.mul(parseEther("1")).div(finalQuote);
        amountToSubstract = amountToSubstract.add(incrementValue);
        // console.log("createdSlippage", createdSlippage);
    }
    // console.log("Final amountIn: ", formatEther(frontrunAmountIn));
    // console.log("Final amountOutMin: ", formatEther(frontrunAmountOutMin));

    return [frontrunAmountIn, frontrunAmountOutMin];
}

const getMaxValues = function(
    uniPairClass: UniswapV2PairClass,
    userPosition: UserPositionETHForExactTokens | UserPositionExactETHForTokens,
    unexpectedUserSlippage: BigNumber
) {
    const [reservesIn] = uniPairClass.getSortedReserves(userPosition.path);
    const frontrunMaxAmountIn = (reservesIn.mul(unexpectedUserSlippage.sub(parseEther("1")))).div(parseEther("1")).div(2);
    const [, frontrunMaxAmountOutMin] = uniPairClass.getAmountsOut(frontrunMaxAmountIn, userPosition.path);

    const highBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMaxAmountIn, 
        frontrunMaxAmountOutMin,
        userPosition.path
    );

    return [frontrunMaxAmountIn, frontrunMaxAmountOutMin, highBoundFrontrunSlippage];
}

const getMinValues = function(
    uniPairClass: UniswapV2PairClass,
    userPosition: UserPositionETHForExactTokens | UserPositionExactETHForTokens,
    maxValues: { frontrunMaxAmountIn: BigNumber, highBoundFrontrunSlippage: BigNumber }
) {
    const invertedSlippage = parseEther("1").mul(parseEther("1")).div(maxValues.highBoundFrontrunSlippage);
    const frontrunMinAmountIn = maxValues.frontrunMaxAmountIn.mul(invertedSlippage).div(parseEther("1"));
    const [,frontrunMinAmountOutMin] = uniPairClass.getAmountsOut(frontrunMinAmountIn, userPosition.path);

    const lowBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMinAmountIn, 
        frontrunMinAmountOutMin,
        userPosition.path
    );

    return [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage];
}

export const getAmountsRespectingUnexpectedSlippageETHForExactTokens = async function(userPosition: UserPositionETHForExactTokens) {

    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountInMax, 
        userPosition.amountOut, 
        userPosition.path
    );

    let [frontrunMaxAmountIn, _,highBoundFrontrunSlippage] = getMaxValues(
        uniPairClass,
        userPosition,
        unexpectedUserSlippage
    );

    let [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage] = getMinValues(
        uniPairClass,
        userPosition,
        { frontrunMaxAmountIn, highBoundFrontrunSlippage }
    );

    let [
        frontrunAmountIn, 
        frontrunAmountOut, 
        createdSlippage
    ] = [
        frontrunMinAmountIn, 
        frontrunMinAmountOutMin, 
        lowBoundFrontrunSlippage
    ];

    let prevFrontrunAmountIn = BigNumber.from(0);
    let amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    while(!createdSlippage.eq(unexpectedUserSlippage) && amountsDidChange) {

        prevFrontrunAmountIn = frontrunAmountIn;
        if(createdSlippage.lt(unexpectedUserSlippage)) {
            frontrunMinAmountIn = frontrunAmountIn;
            frontrunAmountIn = (frontrunMinAmountIn.add(frontrunMaxAmountIn)).div(2);
        } else {
            frontrunMaxAmountIn = frontrunAmountIn;
            frontrunAmountIn = (frontrunMinAmountIn.add(frontrunMaxAmountIn)).div(2);
        }

        [,frontrunAmountOut] = uniPairClass.getAmountsOut(frontrunAmountIn, userPosition.path);

        createdSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
            frontrunAmountIn, 
            frontrunAmountOut,
            userPosition.path
        );
        amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    }

    // console.log("Target Slippage: ", formatEther(unexpectedUserSlippage));
    // console.log("Created Slippage: ", formatEther(createdSlippage));

    return [frontrunAmountIn, frontrunAmountOut];
}

const getFrontrunMaxValuesFullSlippage = function(
    uniPairClass: UniswapV2PairClass,
    userPosition: UserPositionETHForExactTokens | UserPositionExactETHForTokens,
    totalUserSlippage: BigNumber
) {
    const [reservesIn] = uniPairClass.getSortedReserves(userPosition.path);
    const frontrunMaxAmountIn = (reservesIn.mul(totalUserSlippage.sub(parseEther("1")))).div(parseEther("1")).div(2);
    const [, frontrunMaxAmountOutMin] = uniPairClass.getAmountsOut(frontrunMaxAmountIn, userPosition.path);

    const highBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMaxAmountIn, 
        frontrunMaxAmountOutMin,
        userPosition.path
    );

    return [frontrunMaxAmountIn, frontrunMaxAmountOutMin, highBoundFrontrunSlippage];
}

const getFrontrunMinValuesFullSlippage = function(
    uniPairClass: UniswapV2PairClass,
    userPosition: UserPositionETHForExactTokens | UserPositionExactETHForTokens,
    maxValues: { frontrunMaxAmountIn: BigNumber, highBoundFrontrunSlippage: BigNumber }
) {
    const invertedSlippage = parseEther("1").mul(parseEther("1")).div(maxValues.highBoundFrontrunSlippage);
    const frontrunMinAmountIn = maxValues.frontrunMaxAmountIn.mul(invertedSlippage).div(parseEther("1"));
    const [,frontrunMinAmountOutMin] = uniPairClass.getAmountsOut(frontrunMinAmountIn, userPosition.path);

    const lowBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMinAmountIn, 
        frontrunMinAmountOutMin,
        userPosition.path
    );

    return [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage];
}

// User calls ETHForExactTokens but frontrunner will call ExactETHForTokens
export const getAmountsRespectingFullSlippageETHForExactTokens = async function(userPosition: UserPositionETHForExactTokens) {
    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountInMax, 
        userPosition.amountOut, 
        userPosition.path
    );
    const expectedUserSlippage = uniPairClass.getExpectedSlippageETHForExactTokens(userPosition.amountOut, userPosition.path);

    const totalSlippage = unexpectedUserSlippage.sub(expectedUserSlippage).add(parseEther("1"));

    let [frontrunMaxAmountIn, _,highBoundFrontrunSlippage] = getFrontrunMaxValuesFullSlippage(
        uniPairClass,
        userPosition,
        totalSlippage
    );

    let [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage] = getFrontrunMinValuesFullSlippage(
        uniPairClass,
        userPosition,
        { frontrunMaxAmountIn, highBoundFrontrunSlippage }
    );

    let [
        frontrunAmountIn, 
        frontrunAmountOut, 
        createdSlippage
    ] = [
        frontrunMinAmountIn, 
        frontrunMinAmountOutMin, 
        lowBoundFrontrunSlippage
    ];

    let prevFrontrunAmountIn = BigNumber.from(0);
    let amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    while(!createdSlippage.eq(totalSlippage) && amountsDidChange) {

        prevFrontrunAmountIn = frontrunAmountIn;
        if(createdSlippage.lt(totalSlippage)) {
            frontrunMinAmountIn = frontrunAmountIn;
            frontrunAmountIn = (frontrunMinAmountIn.add(frontrunMaxAmountIn)).div(2);
        } else {
            frontrunMaxAmountIn = frontrunAmountIn;
            frontrunAmountIn = (frontrunMinAmountIn.add(frontrunMaxAmountIn)).div(2);
        }

        [,frontrunAmountOut] = uniPairClass.getAmountsOut(frontrunAmountIn, userPosition.path);

        createdSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
            frontrunAmountIn,
            frontrunAmountOut,
            userPosition.path 
        );
        amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    }

    // console.log("Target Slippage: ", formatEther(totalSlippage));
    // console.log("Created Slippage: ", formatEther(createdSlippage));

    return [frontrunAmountIn, frontrunAmountOut];
}

export const getAmountsRespectingFullSlippageExactETHForTokens = async function(userPosition: UserPositionExactETHForTokens) {
    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountIn, 
        userPosition.amountOutMin, 
        userPosition.path
    );
    const expectedUserSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(userPosition.amountIn, userPosition.amountOutMin, userPosition.path);

    const totalSlippage = unexpectedUserSlippage.sub(expectedUserSlippage).add(parseEther("1"));

    let [frontrunMaxAmountIn, _,highBoundFrontrunSlippage] = getFrontrunMaxValuesFullSlippage(
        uniPairClass,
        userPosition,
        totalSlippage
    );

    let [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage] = getFrontrunMinValuesFullSlippage(
        uniPairClass,
        userPosition,
        { frontrunMaxAmountIn, highBoundFrontrunSlippage }
    );

    let [
        frontrunAmountIn, 
        frontrunAmountOut, 
        createdSlippage
    ] = [
        frontrunMinAmountIn, 
        frontrunMinAmountOutMin, 
        lowBoundFrontrunSlippage
    ];

    let prevFrontrunAmountIn = BigNumber.from(0);
    let amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    while(!createdSlippage.eq(totalSlippage) && amountsDidChange) {

        prevFrontrunAmountIn = frontrunAmountIn;
        if(createdSlippage.lt(totalSlippage)) {
            frontrunMinAmountIn = frontrunAmountIn;
            frontrunAmountIn = (frontrunMinAmountIn.add(frontrunMaxAmountIn)).div(2);
        } else {
            frontrunMaxAmountIn = frontrunAmountIn;
            frontrunAmountIn = (frontrunMinAmountIn.add(frontrunMaxAmountIn)).div(2);
        }

        [,frontrunAmountOut] = uniPairClass.getAmountsOut(frontrunAmountIn, userPosition.path);

        createdSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
            frontrunAmountIn,
            frontrunAmountOut,
            userPosition.path 
        );
        amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    }

    // console.log("Target Slippage: ", formatEther(totalSlippage));
    // console.log("Created Slippage: ", formatEther(createdSlippage));

    return [frontrunAmountIn, frontrunAmountOut];
}