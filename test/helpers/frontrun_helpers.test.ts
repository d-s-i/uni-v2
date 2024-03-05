import { ethers } from "ethers";
import { parseEther, formatEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { ONE_ETHER } from "../../src/constants";

import { UserPositionETHForExactTokens, UserPositionExactETHForTokens } from "../types.test";
import { router, weth, token0, deployer, uniPairClass, frontrunner } from "../index.test";
import { getDeadline, calcGasFeesOfTx, deployNewPairClass } from "./helpers.test";
import { swapETHForExactTokensFromContract, swapExactETHForTokensFromContract } from "./swap_helpers.test";

export const getFrontrunTargetPrice = function(
    userPosition: UserPositionExactETHForTokens | UserPositionETHForExactTokens
) {
    if("amountOutMin" in userPosition) {
        return userPosition.amountOutMin * ONE_ETHER  / userPosition.amountIn;
    } else {
        return userPosition.amountOut * ONE_ETHER  / userPosition.amountInMax;
    }
}

export const calcSandwichProfitsETHForExactTokens = async function(
    userPosition: UserPositionETHForExactTokens
) {
    const [frontrunMaxAmountIn, frontrunMaxAmountOutMin] = await getAmountsRespectingFullSlippageETHForExactTokens(userPosition);
    const frontrunAmountIn = frontrunMaxAmountIn * 99n / 100n;
    const frontrunAmountOutMin = frontrunMaxAmountOutMin * 99n / 100n;
    const simulatedPair = await deployNewPairClass();

    const buyGasEstimation = await estimateFrontrunGas(userPosition, frontrunner);
    const [,swappedTokenAmount] = simulatedPair.simulateSwapExactETHForTokens(
        frontrunAmountIn, 
        frontrunAmountOutMin, 
        userPosition.path
    );
    simulatedPair.simulateSwapETHForExactTokens(userPosition.amountOut, userPosition.path);
    
    const frontrunSellPath = [userPosition.path[1], userPosition.path[0]];
    const [,ETHAmountOutMin] = uniPairClass.getAmountsOut(swappedTokenAmount, frontrunSellPath);
    const [,swapETHAmount] = simulatedPair.simulateSwapExactTokensForEth(swappedTokenAmount, ETHAmountOutMin, frontrunSellPath);
    
    // assume same gas price for frontrun and backrun
    const feeData = await deployer.provider!.getFeeData();
    const estimatedSandwichFees = buyGasEstimation.mul(2).mul(feeData.gasPrice!);
    const profits = swapETHAmount - frontrunAmountIn - BigInt(estimatedSandwichFees.toHexString());
    return profits;
}

export const calcSandwichProfitsExactETHForTokens = async function(
    userPosition: UserPositionExactETHForTokens
) {
    const [frontrunMaxAmountIn, frontrunMaxAmountOut] = await getAmountsRespectingFullSlippageExactETHForTokens(userPosition);
    const frontrunAmountIn = frontrunMaxAmountIn * 99n / 100n;
    const frontrunAmountOutMin = frontrunMaxAmountOut * 99n / 100n;
    const simulatedPair = await deployNewPairClass();

    const buyGasEstimation = await estimateFrontrunGas(userPosition, frontrunner);
    const [,swappedTokenAmount] = simulatedPair.simulateSwapExactETHForTokens(
        frontrunAmountIn, 
        frontrunAmountOutMin, 
        userPosition.path
    );

    simulatedPair.simulateSwapExactETHForTokens(userPosition.amountIn, userPosition.amountOutMin, userPosition.path);

    const frontrunSellPath = [userPosition.path[1], userPosition.path[0]];
    const [,ETHAmountOutMin] = uniPairClass.getAmountsOut(swappedTokenAmount, frontrunSellPath);
    const [,swapETHAmount] = simulatedPair.simulateSwapExactTokensForEth(swappedTokenAmount, ETHAmountOutMin, frontrunSellPath);

    // assume same gas price for frontrun and backrun
    const feeData = await deployer.provider!.getFeeData();
    const estimatedSandwichFees = buyGasEstimation.mul(2).mul(feeData.gasPrice!);
    const profits = swapETHAmount - frontrunAmountIn - BigInt(estimatedSandwichFees.toHexString());
    return profits;
}

export const simulateSandwichExactETHForTokens = async function(
    userPosition: UserPositionExactETHForTokens,
    signers: { user: SignerWithAddress, frontrunner: SignerWithAddress }
) {
    const frontrun_fee = await frontrunExactETHForTokens(userPosition, signers.frontrunner);

    await swapExactETHForTokensFromContract(userPosition.amountIn, signers.user);

    const backrun_fee = await backrun(frontrunner);
    return frontrun_fee + backrun_fee;
}

export const simulateSandwichETHForExactTokens = async function(
    userPosition: UserPositionETHForExactTokens,
    signers: { user: SignerWithAddress, frontrunner: SignerWithAddress }
) {
    const frontrun_fee = await frontrunETHForExactTokens(userPosition, signers.frontrunner);

    await swapETHForExactTokensFromContract(userPosition.amountOut, userPosition.amountInMax, signers.user);

    const backrun_fee = await backrun(frontrunner);
    return frontrun_fee + backrun_fee;
}

export const frontrunETHForExactTokens = async function(
    userPosition: UserPositionETHForExactTokens,
    signer: SignerWithAddress
) {
    const [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingFullSlippageETHForExactTokens(
        userPosition
    );

    const deadline = await getDeadline(deployer.provider!);
    // It's more profitable to use `swapExactETHForTokens` for the frontrunner (until proven wrong)
    const tempRouter = router.connect(signer);
    const buy_tx = await tempRouter.swapExactETHForTokens(
    (frontrunAmountOut * 99n) / 100n,
    userPosition.path,
    signer.address,
    deadline,
    { value: (frontrunAmountIn * 99n) / 100n }
    );

    const feePaid = await calcGasFeesOfTx(buy_tx.hash);
    return feePaid;
}

export const frontrunExactETHForTokens = async function(
    userPosition: UserPositionExactETHForTokens,
    signer: SignerWithAddress
) {
    const [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingFullSlippageExactETHForTokens(
      userPosition
    );

    const deadline = await getDeadline(deployer.provider!);

    const tempRouter = router.connect(signer);
    const buy_tx = await tempRouter.swapExactETHForTokens(
      (frontrunAmountOut * 99n) / 100n,
      userPosition.path,
      signer.address,
      deadline,
      { value: (frontrunAmountIn * 99n) / 100n }
    );
    const feePaid = await calcGasFeesOfTx(buy_tx.hash);
    return feePaid;
}

export const backrun = async function(signer: SignerWithAddress) {

    const tempToken0 = token0.connect(signer);
    const approve_tx = await tempToken0.approve(router.address, ethers.constants.MaxUint256);

    const frontrunTokenAmountIn = await token0.balanceOf(signer.address);
    const path = [token0.address, weth.address];
    const [,frontrunETHOutMin] = await router.getAmountsOut(frontrunTokenAmountIn, path);

    const deadline2 = await getDeadline(deployer.provider!);

    const tempRouter = router.connect(signer);
    const sell_tx = await tempRouter.swapExactTokensForETH(
      frontrunTokenAmountIn,
      frontrunETHOutMin,
      path,
      signer.address,
      deadline2
    );

    const approveFee = await calcGasFeesOfTx(approve_tx.hash);
    const sellFee = await calcGasFeesOfTx(sell_tx.hash);

    return approveFee + sellFee;
}

export const simulateFrontrunWithMaxSlippage = async function(
    frontrun: { initialSwapAmount: bigint, signer: SignerWithAddress },
    userPosition: UserPositionExactETHForTokens | UserPositionETHForExactTokens
) {

    let userAmountIn;
    let userAmountOut;
    if("amountOutMin" in userPosition) {
        userAmountIn = userPosition.amountIn;
        userAmountOut = userPosition.amountOutMin;
    } else {
        userAmountIn = userPosition.amountInMax;
        userAmountOut = userPosition.amountOut;
    }
    const uniPairClass = await deployNewPairClass();

    const frontrunInSwapAmounts = uniPairClass.simulateSwapExactETHForTokens(
        frontrun.initialSwapAmount,
        1n,
        [weth.address, token0.address]
    );

    const swapInGas = await estimateFrontrunGas(userPosition, frontrun.signer);

    uniPairClass.simulateSwapExactETHForTokens(
        userAmountIn,
        userAmountOut,
        [weth.address, token0.address]
    );

    const frontrunOutSwapAmounts = uniPairClass.simulateSwapExactTokensForEth(
        frontrunInSwapAmounts[1],
        1n,
        [token0.address, weth.address]
    );

    const swapOutGas = await estimateBackrunGas(frontrun.signer);

    const feeData = await deployer.provider!.getFeeData();

    const feePaid = BigInt(swapInGas.add(swapOutGas).mul(feeData.gasPrice!).toHexString());
    const profits = frontrunOutSwapAmounts[1] - frontrun.initialSwapAmount - feePaid;
    
    return profits;
}

export const estimateFrontrunGas = async function(
    userPosition: UserPositionETHForExactTokens | UserPositionExactETHForTokens,
    signer: SignerWithAddress
) {

    let frontrunAmountIn, frontrunAmountOut;
    if("amountOutMin" in userPosition) {
        [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingFullSlippageExactETHForTokens(
            userPosition
        );
    } else {
        [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingFullSlippageETHForExactTokens(
            userPosition
        );
    }
        
    const deadline = await getDeadline(deployer.provider!);
    
    const tempRouter = router.connect(signer);
    const buyGasEstimation = await tempRouter.estimateGas.swapExactETHForTokens(
        (frontrunAmountOut * 99n) / 100n,
        userPosition.path,
        signer.address,
        deadline,
        { value: (frontrunAmountIn * 99n) / 100n }
    );

    return buyGasEstimation;
}

export const estimateBackrunGas = async function(signer: SignerWithAddress) {
    const tempToken0 = token0.connect(signer);
    const tempRouter = router.connect(signer)
    await tempToken0.approve(router.address, ethers.constants.MaxUint256);

    const deadline = await getDeadline(deployer.provider!);
    const path = [token0.address, weth.address];
    const frontrunTokenAmountIn = await tempToken0.balanceOf(signer.address);
    const [,frontrunETHOutMin] = await tempRouter.getAmountsOut(frontrunTokenAmountIn, path);
    const sellGasEstimation = await tempRouter.estimateGas.swapExactTokensForETH(
      frontrunTokenAmountIn,
      frontrunETHOutMin,
      path,
      signer.address,
      deadline
    );

    return sellGasEstimation;
}

export const getAmountsRespectingUnexpectedSlippageExactETHForTokens = async function(
    userPosition: UserPositionExactETHForTokens
) {
    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountIn, 
        userPosition.amountOutMin, 
        userPosition.path
    );

    let [frontrunMaxAmountIn, _,highBoundFrontrunSlippage] = getFrontrunMaxValues(
        unexpectedUserSlippage,
        userPosition.path
    );

    let [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage] = getFrontrunMinValues(
        { frontrunMaxAmountIn, highBoundFrontrunSlippage },
        userPosition.path,
    );

    return getFrontrunAmountsFromSlippageBinarySearch(
        { frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage },
        { frontrunMaxAmountIn },
        { userSlippage: unexpectedUserSlippage, path: userPosition.path }
    );
}

export const getAmountsRespectingUnexpectedSlippageETHForExactTokens = async function(userPosition: UserPositionETHForExactTokens) {

    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountInMax, 
        userPosition.amountOut, 
        userPosition.path
    );

    let [frontrunMaxAmountIn, _,highBoundFrontrunSlippage] = getFrontrunMaxValues(
        unexpectedUserSlippage,
        userPosition.path
    );

    let [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage] = getFrontrunMinValues(
        { frontrunMaxAmountIn, highBoundFrontrunSlippage },
        userPosition.path
    );

    return getFrontrunAmountsFromSlippageBinarySearch(
        { frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage },
        { frontrunMaxAmountIn },
        { userSlippage: unexpectedUserSlippage, path: userPosition.path }
    );
}

// User calls ETHForExactTokens but frontrunner will call ExactETHForTokens
export const getAmountsRespectingFullSlippageETHForExactTokens = async function(userPosition: UserPositionETHForExactTokens) {

    const totalSlippage = await getTotalSlippageETHForExactTokens(userPosition);

    let [frontrunMaxAmountIn, _,highBoundFrontrunSlippage] = getFrontrunMaxValues(
        totalSlippage,
        userPosition.path
    );

    let [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage] = getFrontrunMinValues(
        { frontrunMaxAmountIn, highBoundFrontrunSlippage },
        userPosition.path
    );

    return getFrontrunAmountsFromSlippageBinarySearch(
        { frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage },
        { frontrunMaxAmountIn },
        { userSlippage: totalSlippage, path: userPosition.path }
    );
}

export const getAmountsRespectingFullSlippageExactETHForTokens = async function(userPosition: UserPositionExactETHForTokens) {

    const totalSlippage = await getTotalSlippageExactETHForTokens(userPosition);

    let [frontrunMaxAmountIn, _,highBoundFrontrunSlippage] = getFrontrunMaxValues(
        totalSlippage,
        userPosition.path
    );

    let [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage] = getFrontrunMinValues(
        { frontrunMaxAmountIn, highBoundFrontrunSlippage },
        userPosition.path
    );

    return getFrontrunAmountsFromSlippageBinarySearch(
        { frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage },
        { frontrunMaxAmountIn },
        { userSlippage: totalSlippage, path: userPosition.path }
    );
}

export const getTotalSlippageExactETHForTokens = async function(
    userPosition: UserPositionExactETHForTokens
) {
    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountIn, 
        userPosition.amountOutMin, 
        userPosition.path
    );  
    const expectedUserSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        userPosition.amountIn, 
        userPosition.amountOutMin, 
        userPosition.path
    );  
    const totalSlippage = unexpectedUserSlippage - expectedUserSlippage + ONE_ETHER;
    return totalSlippage;
}
export const getTotalSlippageETHForExactTokens = async function(
    userPosition: UserPositionETHForExactTokens
) {
    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountInMax, 
        userPosition.amountOut, 
        userPosition.path
    );
    const expectedUserSlippage = uniPairClass.getExpectedSlippageETHForExactTokens(userPosition.amountOut, userPosition.path);
    const totalSlippage = unexpectedUserSlippage - expectedUserSlippage + ONE_ETHER;
    return totalSlippage;
}

const getFrontrunMaxValues = function(
    totalUserSlippage: bigint,
    path: [string, string]
) {
    const [reservesIn] = uniPairClass.getSortedReserves(path);
    const frontrunMaxAmountIn = ((reservesIn * (totalUserSlippage - ONE_ETHER)) / ONE_ETHER) / 2n;
    const [, frontrunMaxAmountOutMin] = uniPairClass.getAmountsOut(frontrunMaxAmountIn, path);

    const highBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMaxAmountIn, 
        frontrunMaxAmountOutMin,
        path
    );

    return [frontrunMaxAmountIn, frontrunMaxAmountOutMin, highBoundFrontrunSlippage];
}

const getFrontrunMinValues = function(
    maxValues: { frontrunMaxAmountIn: bigint, highBoundFrontrunSlippage: bigint },
    path: [string, string]
) {
    const invertedSlippage = (ONE_ETHER * ONE_ETHER) / (maxValues.highBoundFrontrunSlippage);
    const frontrunMinAmountIn = (maxValues.frontrunMaxAmountIn * invertedSlippage) / ONE_ETHER;
    const [,frontrunMinAmountOutMin] = uniPairClass.getAmountsOut(frontrunMinAmountIn, path);

    const lowBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMinAmountIn, 
        frontrunMinAmountOutMin,
        path
    );

    return [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage];
}

const getFrontrunAmountsFromSlippageBinarySearch = function(
    lowBoundValues: { frontrunMinAmountIn: bigint, frontrunMinAmountOutMin: bigint, lowBoundFrontrunSlippage: bigint },
    highBoundValues: { frontrunMaxAmountIn: bigint },
    userValues: { userSlippage: bigint, path: [string, string] }
) {
    let [
        frontrunAmountIn, 
        frontrunAmountOut, 
        createdSlippage
    ] = [
        lowBoundValues.frontrunMinAmountIn, 
        lowBoundValues.frontrunMinAmountOutMin, 
        lowBoundValues.lowBoundFrontrunSlippage
    ];
    let prevFrontrunAmountIn = BigInt(0);
    let amountsDidChange = prevFrontrunAmountIn !== frontrunAmountIn;
    while(createdSlippage !== userValues.userSlippage && amountsDidChange) {

        prevFrontrunAmountIn = frontrunAmountIn;
        if(createdSlippage < userValues.userSlippage) {
            lowBoundValues.frontrunMinAmountIn = frontrunAmountIn;
            frontrunAmountIn = (lowBoundValues.frontrunMinAmountIn + highBoundValues.frontrunMaxAmountIn) / 2n;
        } else {
            highBoundValues.frontrunMaxAmountIn = frontrunAmountIn;
            frontrunAmountIn = (lowBoundValues.frontrunMinAmountIn + highBoundValues.frontrunMaxAmountIn)  / 2n;
        }

        [,frontrunAmountOut] = uniPairClass.getAmountsOut(frontrunAmountIn, userValues.path);

        createdSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
            frontrunAmountIn, 
            frontrunAmountOut,
            userValues.path
        );
        amountsDidChange = prevFrontrunAmountIn !== frontrunAmountIn;
    }

    return [frontrunAmountIn, frontrunAmountOut];
}
