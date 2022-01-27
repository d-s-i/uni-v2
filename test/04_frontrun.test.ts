import { parseEther } from "ethers/lib/utils";
import assert from "assert";


import { 
  getDeadline, 
  getPriceFromContract,
  getUserPositionETHForExactTokens,
  getUserPositionExactETHForTokens,
} from "./helpers/helpers.test";

import {
  getFrontrunTargetPrice,
  frontrunETHForExactTokens,
  frontrunExactETHForTokens,
  backrun,
  simulateFrontrunWithMaxSlippage,
  getAmountsRespectingUnexpectedSlippageETHForExactTokens,
  getAmountsRespectingUnexpectedSlippageExactETHForTokens,
  getAmountsRespectingFullSlippageETHForExactTokens,
  getAmountsRespectingFullSlippageExactETHForTokens,
  estimateBackrunGas,
  estimateFrontrunGas
} from "./helpers/frontrun_helpers.test";
import {
    weth,
    token0,
    wethAmounAddedToLiquidity,
    token0AmountAddedToLiquidity,
    SLIPPAGE,
    uniPairClass,
    router,
    deployer,
    frontrunner,
    swapper
} from "./index.test";

describe("Frontrunning", async function() {

  const amountIn = wethAmounAddedToLiquidity.mul(1).div(100);
  
  it("Estimates Slippage Correctly", async function() {    
    const path: [string, string] = [weth.address, token0.address];
    const price = await getPriceFromContract(path);

    const [,amountOut] = uniPairClass.getAmountsOut(amountIn, path);
    const swapSlippage = uniPairClass.getExpectedSlippageExactETHForTokens(amountIn, amountOut, path);

    const deadline = await getDeadline(deployer.provider!);
    
    await router.swapExactETHForTokens(
      amountOut,
      path,
      frontrunner.address,
      deadline,
      { value: amountIn }
    );

    const finalPrice = await getPriceFromContract(path);

    const createdSlippage = price.mul(parseEther("1")).div(finalPrice);

    assert.ok(swapSlippage.eq(createdSlippage));
    
  });

  it("Calculate The Exact Unexpected Slippage For `swapETHForExactTokens` With Binary Search", async function() {
    const path: [string, string] = [weth.address, token0.address];
    
    const userPosition = await getUserPositionETHForExactTokens(amountIn, SLIPPAGE);

    const targetPrice = userPosition.amountOut.mul(parseEther("1")).div(userPosition.amountInMax);

    const [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingUnexpectedSlippageETHForExactTokens(
      userPosition
    );

    const deadline = await getDeadline(deployer.provider!);
    
    // frontrunner will always use `swapExactETHForTokens` (always wants to swap an exact amount in)
    const tempRouter = router.connect(frontrunner);
    await tempRouter.swapExactETHForTokens(
      frontrunAmountOut,
      userPosition.path,
      frontrunner.address,
      deadline,
      { value: frontrunAmountIn }
    );
    const finalPrice = await getPriceFromContract(path);

    const precision = finalPrice.mul(parseEther("1")).div(targetPrice);

    assert.ok(
      precision.gt(parseEther("0.99999")) &&
      precision.lt(parseEther("1.00001"))
    );
  });

  it("Calculate The Exact Unexpected Slippage For `swapExactETHForTokens` With Binary Search", async function() {
    const path: [string, string] = [weth.address, token0.address];
    const amountIn = wethAmounAddedToLiquidity.mul(1).div(100);

    const userPosition = await getUserPositionExactETHForTokens(amountIn, SLIPPAGE);

    const [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingUnexpectedSlippageExactETHForTokens(
      userPosition
    );

    const targetPrice = userPosition.amountOutMin.mul(parseEther("1")).div(userPosition.amountIn);

    const deadline = await getDeadline(deployer.provider!);

    // It's more profitable to use `swapExactETHForTokens` for the frontrunner (until proven wrong)
    const tempRouter = router.connect(frontrunner);
    await tempRouter.swapExactETHForTokens(
      frontrunAmountOut,
      userPosition.path,
      frontrunner.address,
      deadline,
      { value: frontrunAmountIn }
    );

    const finalPrice = await getPriceFromContract(path);

    const precision = finalPrice.mul(parseEther("1")).div(targetPrice);

    assert.ok(
      precision.gt(parseEther("0.99999")) &&
      precision.lt(parseEther("1.00001"))
    );
  });

  it("Allow Frontrun + User Swap Considering User's Slippage using `swapETHForExactTokens`", async function() {
    const path: [string, string] = [weth.address, token0.address];
    
    const amountOut = token0AmountAddedToLiquidity.mul(1).div(100);
    const userPosition = await getUserPositionETHForExactTokens(amountOut, SLIPPAGE); 

    const targetPrice = userPosition.amountOut.mul(parseEther("1")).div(userPosition.amountInMax);
      
    await frontrunETHForExactTokens(userPosition, frontrunner);
      
    const deadline = await getDeadline(deployer.provider!);
    const tempRouter = router.connect(swapper);
    await tempRouter.swapETHForExactTokens(
      userPosition.amountOut,
      userPosition.path,
      frontrunner.address,
      deadline,
      { value: userPosition.amountInMax }
    );

    const finalPrice = await getPriceFromContract(path);

    const precision = finalPrice.mul(parseEther("1")).div(targetPrice);

    assert.ok(
      precision.gt(parseEther("0.9954")) &&
      precision.lt(parseEther("1.0055"))
    );
  });

  it("Make A Profitable Frontrun with user using `swapETHforExactTokens`", async function() {
    const initialFrontrunnerBalances = await frontrunner.getBalance();

    const amountOut = token0AmountAddedToLiquidity.mul(1).div(100);
    const userPosition = await getUserPositionETHForExactTokens(amountOut, SLIPPAGE);

    await frontrunETHForExactTokens(userPosition, frontrunner);

    const deadline = await getDeadline(deployer.provider!);

    const tempRouter = router.connect(swapper);
    await tempRouter.swapETHForExactTokens(
      userPosition.amountOut,
      userPosition.path,
      swapper.address,
      deadline,
      { value: userPosition.amountInMax }
    );

    await backrun(frontrunner);

    const finalFrontrunnerBalances = await frontrunner.getBalance();
    const profits = finalFrontrunnerBalances.sub(initialFrontrunnerBalances);

    assert.ok(profits.gt(0));
  });

  it("Make A Profitable Frontrun with user using `swapExactETHforTokens`", async function() {
    const initialFrontrunnerBalances = await frontrunner.getBalance();

    const amountIn = wethAmounAddedToLiquidity.mul(10).div(100);
    const userPosition = await getUserPositionExactETHForTokens(amountIn, SLIPPAGE);

    const deadline = await getDeadline(deployer.provider!);

    await frontrunExactETHForTokens(userPosition, frontrunner);

    const tempRouter = router.connect(swapper);
    await tempRouter.swapExactETHForTokens(
      userPosition.amountOutMin,
      userPosition.path,
      swapper.address,
      deadline,
      { value: userPosition.amountIn }
    );

    await backrun(frontrunner);

    const finalFrontrunnerBalances = await frontrunner.getBalance();
    const profits = finalFrontrunnerBalances.sub(initialFrontrunnerBalances);

    assert.ok(profits.gt(0));
  });

  // it("Calculate Gas Efficiently For A Whole Frontrun", async function() {
    
  //   const feeData = await deployer.provider!.getFeeData();
  //   const amountIn = wethAmounAddedToLiquidity.mul(10).div(100);
  //   const userPosition = await getUserPositionExactETHForTokens(amountIn, SLIPPAGE);

  //   const buyGasEstimation = await estimateFrontrunGas(userPosition, frontrunner);
  //   const buy_fee = await frontrunExactETHForTokens(userPosition, frontrunner);

  //   const sellGasEstimation = await estimateBackrunGas(frontrunner);
  //   const approveGasEstimation = await token0.estimateGas.approve(router.address, ethers.constants.MaxUint256);
  //   const sell_fee = await backrun(frontrunner);

  //   const amountGasPaid = buy_fee.add(sell_fee);
  //   const finalGasEstimation =  (buyGasEstimation.add(approveGasEstimation).add(sellGasEstimation)).mul(feeData.gasPrice!);
    
  //   console.log("gasEstimation: ", finalGasEstimation);
  //   console.log("amountGasPaid: ", amountGasPaid);
    
  // });

  // it("Expected Slippage for both functions", async function() {
  //   const userPositionETHForExactTokens = await getUserPositionETHForExactTokens(parseEther("1"), 10);
  //   const userPositionExactETHForTokens = await getUserPositionExactETHForTokens(parseEther("1"), 10);

  //   const expectedSlippageETHForExactTokens = await uniPairClass.getExpectedSlippageETHForExactTokens()

  // });

  // it("Can say if a frontrun is profitable or not", async function() {});
  
});