import hre from "hardhat";
import { BigNumber, ethers, Signer } from "ethers";
import { parseEther, hexValue, formatEther, parseUnits } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { Provider } from "@ethersproject/abstract-provider";

import { UserPositionETHForExactTokens, UserPositionExactETHForTokens } from "../types.test";
import { router, weth, token0, uniPair, deployer, uniPairClass } from "../index.test";
import { UniswapV2PairClass } from "../UniV2PairClass.test";
import { getDeadline, calcGasFeesOfTx, deployNewPairClass } from "./helpers.test";

export const getFrontrunTargetPrice = function(
    userPosition: UserPositionExactETHForTokens | UserPositionETHForExactTokens
) {
    if("amountOutMin" in userPosition) {
        return userPosition.amountOutMin.mul(parseEther("1")).div(userPosition.amountIn);
    } else {
        return userPosition.amountOut.mul(parseEther("1")).div(userPosition.amountInMax);
    }
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
    await tempRouter.swapExactETHForTokens(
    frontrunAmountOut.mul(99).div(100),
    userPosition.path,
    signer.address,
    deadline,
    { value: frontrunAmountIn.mul(99).div(100) }
    );
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
      frontrunAmountOut.mul(99).div(100),
      userPosition.path,
      signer.address,
      deadline,
      { value: frontrunAmountIn.mul(99).div(100) }
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

    return approveFee.add(sellFee);
}

export const simulateFrontrunWithMaxSlippage = async function(
    frontrun: { initialSwapAmount: BigNumber, signer: SignerWithAddress },
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
        BigNumber.from("1"),
        [weth.address, token0.address]
    );

    const swapInGas = await estimateFrontrunGas(userPosition, frontrun.signer);

    const userSwapAmounts = uniPairClass.simulateSwapExactETHForTokens(
        userAmountIn,
        userAmountOut,
        [weth.address, token0.address]
    );

    const frontrunOutSwapAmounts = uniPairClass.simulateSwapExactTokensForEth(
        frontrunInSwapAmounts[1],
        BigNumber.from("1"),
        [token0.address, weth.address]
    );

    const swapOutGas = await estimateBackrunGas(frontrun.signer);

    const feeData = await deployer.provider!.getFeeData();

    const feePaid = swapInGas.add(swapOutGas).mul(feeData.gasPrice!);
    const profits = frontrunOutSwapAmounts[1].sub(frontrun.initialSwapAmount).sub(feePaid);
    
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
        frontrunAmountOut.mul(99).div(100),
        userPosition.path,
        signer.address,
        deadline,
        { value: frontrunAmountIn.mul(99).div(100) }
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

const getTotalSlippageExactETHForTokens = async function(
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
    const totalSlippage = unexpectedUserSlippage.sub(expectedUserSlippage).add(parseEther("1"));
    return totalSlippage;
}
const getTotalSlippageETHForExactTokens = async function(
    userPosition: UserPositionETHForExactTokens
) {
    const uniPairClass = await deployNewPairClass();
    
    const unexpectedUserSlippage = uniPairClass.getUnexpectedSlippage(
        userPosition.amountInMax, 
        userPosition.amountOut, 
        userPosition.path
    );
    const expectedUserSlippage = uniPairClass.getExpectedSlippageETHForExactTokens(userPosition.amountOut, userPosition.path);
    const totalSlippage = unexpectedUserSlippage.sub(expectedUserSlippage).add(parseEther("1"));
    return totalSlippage;
}

const getFrontrunMaxValues = function(
    totalUserSlippage: BigNumber,
    path: [string, string]
) {
    const [reservesIn] = uniPairClass.getSortedReserves(path);
    const frontrunMaxAmountIn = (reservesIn.mul(totalUserSlippage.sub(parseEther("1")))).div(parseEther("1")).div(2);
    const [, frontrunMaxAmountOutMin] = uniPairClass.getAmountsOut(frontrunMaxAmountIn, path);

    const highBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMaxAmountIn, 
        frontrunMaxAmountOutMin,
        path
    );

    return [frontrunMaxAmountIn, frontrunMaxAmountOutMin, highBoundFrontrunSlippage];
}

const getFrontrunMinValues = function(
    maxValues: { frontrunMaxAmountIn: BigNumber, highBoundFrontrunSlippage: BigNumber },
    path: [string, string]
) {
    const invertedSlippage = parseEther("1").mul(parseEther("1")).div(maxValues.highBoundFrontrunSlippage);
    const frontrunMinAmountIn = maxValues.frontrunMaxAmountIn.mul(invertedSlippage).div(parseEther("1"));
    const [,frontrunMinAmountOutMin] = uniPairClass.getAmountsOut(frontrunMinAmountIn, path);

    const lowBoundFrontrunSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
        frontrunMinAmountIn, 
        frontrunMinAmountOutMin,
        path
    );

    return [frontrunMinAmountIn, frontrunMinAmountOutMin, lowBoundFrontrunSlippage];
}

const getFrontrunAmountsFromSlippageBinarySearch = function(
    lowBoundValues: { frontrunMinAmountIn: BigNumber, frontrunMinAmountOutMin: BigNumber, lowBoundFrontrunSlippage: BigNumber },
    highBoundValues: { frontrunMaxAmountIn: BigNumber },
    userValues: { userSlippage: BigNumber, path: [string, string] }
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
    let prevFrontrunAmountIn = BigNumber.from(0);
    let amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    while(!createdSlippage.eq(userValues.userSlippage) && amountsDidChange) {

        prevFrontrunAmountIn = frontrunAmountIn;
        if(createdSlippage.lt(userValues.userSlippage)) {
            lowBoundValues.frontrunMinAmountIn = frontrunAmountIn;
            frontrunAmountIn = (lowBoundValues.frontrunMinAmountIn.add(highBoundValues.frontrunMaxAmountIn)).div(2);
        } else {
            highBoundValues.frontrunMaxAmountIn = frontrunAmountIn;
            frontrunAmountIn = (lowBoundValues.frontrunMinAmountIn.add(highBoundValues.frontrunMaxAmountIn)).div(2);
        }

        [,frontrunAmountOut] = uniPairClass.getAmountsOut(frontrunAmountIn, userValues.path);

        createdSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(
            frontrunAmountIn, 
            frontrunAmountOut,
            userValues.path
        );
        amountsDidChange = !(prevFrontrunAmountIn.eq(frontrunAmountIn));
    }

    return [frontrunAmountIn, frontrunAmountOut];
}
