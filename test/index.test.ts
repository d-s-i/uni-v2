import { ethers } from "hardhat";
import { parseEther, formatEther } from "ethers/lib/utils";
import assert from "assert";
import { BigNumber, Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { 
  assertAddressExist, 
  assertReservesAreEquals,
  assertStrictEqualityToTheNearestHundredth,
  assertSameStateAfterSwapBetweenClassAndContract,
  assertClassAndContractReservesAreStrictEqual
} from "./assertions.test";
import { 
  resetEthBalances,
  deployNewPairClass, 
  getClassTokenReserve,
  getSortedContractReserves,
  getDeadline, 
  getPriceFromContract,
  getUserPositionETHForExactTokens,
  getUserPositionExactETHForTokens,
} from "./helpers/helpers.test";
import {
  swapTokensForExactETHFromContract,
  swapETHForExactTokensFromContract,
  swapExactEthForTokensFromContract, 
  swapExactTokensForEthFromContract,
  swapExactTokensForEthLoopFromClass,
  swapExactETHForTokensLoopFromClass,
  SwapETHForExactTokensLoopFromClass,
  swapExactTokensForEthLoopFromContract,
  swapExactEthForTokensLoopFromContract,
  swapETHForExactTokensLoopFromContract,
} from "./helpers/swap_helpers.test";
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
import { UniswapV2PairClass } from "./UniV2PairClass.test";

export let deployer: SignerWithAddress;
let recolter: SignerWithAddress;
let swapper: SignerWithAddress;
let frontrunner: SignerWithAddress;

export let token0: Contract;
export let weth: Contract;
let factory: Contract;
export let router: Contract;
export let uniPair: Contract;
export let uniPairClass: UniswapV2PairClass;

const token0AmountAddedToLiquidity = parseEther("200000");
const wethAmounAddedToLiquidity = parseEther("100");

const assertDeployements = true;
const assertSwapContract = true;
const assertSwapClass = true;
const assertValuesClassEqualContract = true;
const assertFrontruningTests = true;

const ETH_SWAP_AMOUNT = wethAmounAddedToLiquidity.mul(5).div(100);
const TOKEN_SWAP_AMOUNT = token0AmountAddedToLiquidity.mul(10).div(100);
const SLIPPAGE = 10; // SLIPPAGE = 1 <=> 1%

beforeEach(async function () {
  
  [deployer, recolter, swapper, frontrunner] = await ethers.getSigners();
  await resetEthBalances([deployer.address, recolter.address, swapper.address], wethAmounAddedToLiquidity.mul(10));
  
  const ERC20 = await ethers.getContractFactory("ERC20");
  token0 = await ERC20.deploy(token0AmountAddedToLiquidity.mul(1000));
  const WETH = await ethers.getContractFactory("WETH9");
  weth = await WETH.deploy();

  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  factory = await Factory.deploy(recolter.address);

  const Router = await ethers.getContractFactory("UniswapV2Router02");
  router = await Router.deploy(factory.address, weth.address, { gasLimit: BigNumber.from("8000000") });

  await factory.createPair(weth.address, token0.address);
  const poolAddress = await factory.getPair(token0.address, weth.address);
  
  await token0.approve(router.address, BigInt(2**255));
  await weth.approve(router.address, BigInt(2**255));
  
  const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
  // console.log(ethers.utils.keccak256(UniswapV2Pair.bytecode));
  uniPair = new ethers.Contract(poolAddress, UniswapV2Pair.interface, deployer);

  const deadline = await getDeadline(deployer.provider!);

  await uniPair.approve(router.address, BigInt(2**255));

  await router.addLiquidityETH(
    token0.address,
    token0AmountAddedToLiquidity,
    token0AmountAddedToLiquidity,
    wethAmounAddedToLiquidity,
    deployer.address,
    deadline,
    { value: wethAmounAddedToLiquidity }
  );

  uniPairClass = await deployNewPairClass();

});

assertDeployements && describe("Deployments", function () {

  it("Deployed The Tokens", async function() {
    assertAddressExist(token0.address);
    assertAddressExist(weth.address);
  });

  it("Deployed The Factory", async function() {
    assertAddressExist(factory.address);
  });
  
  it("Deployed The Router", async function() {
    assertAddressExist(router.address);
  });

  it("Deployed The UniswapV2Pair", async function() {
    assertAddressExist(uniPair.address);
  });
  
  it("Added Liquidity", async function () {
    const token0PairBalance = await token0.balanceOf(uniPair.address);
    const wethPairBalance = await weth.balanceOf(uniPair.address);

    assert.ok(token0PairBalance.eq(token0AmountAddedToLiquidity));
    assert.ok(wethPairBalance.eq(wethAmounAddedToLiquidity));
  });
});

assertSwapClass && describe("Swaps From Class", function() {

  it("Swap Eth To Tokens Via The UniV2Pair Class", async function() {
    const reserves = await uniPair.getReserves();

    const contractToken0Reserves = reserves[0];
    const contractToken1Rerserves = reserves[1];

    uniPairClass.simulateSwapExactETHForTokens(
      ETH_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [weth.address, token0.address]
    );

    assert.ok(uniPairClass.token0Reserves.gt(contractToken0Reserves));
    assert.ok(uniPairClass.token1Reserves.lt(contractToken1Rerserves));
  });

  it("Swap Tokens For Eth From Class", async function() {
    
    const path: [string, string] = [token0.address, weth.address];
    const initialContractReserves = await getSortedContractReserves(path);

    uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      path
    );

    const classReserves = uniPairClass.getSortedReserves(path);

    assert.ok(classReserves[0].gt(initialContractReserves[0]));
    assert.ok(classReserves[1].lt(initialContractReserves[1]));
  });

  it("Swap ETH For Exact Tokens On Class", async function() {

    const path: [string, string] = [weth.address, token0.address];

    const initialTokenReserve = getClassTokenReserve(path, path[1]);
    uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      path
    );

    const finalTokenReserve = getClassTokenReserve(path, path[1]);

    assert.ok(finalTokenReserve.lt(initialTokenReserve));
  });

  it("swapTokensForExactETH From Class", async function() {

    const path: [string, string] = [token0.address, weth.address];

    const initialTokenReserve = getClassTokenReserve(path, path[0]);
    const amountOut = BigNumber.from(1);
    uniPairClass.simulateSwapTokensForExactETH(
      amountOut,
      path
    );

    const finalTokenReserve = getClassTokenReserve(path, path[0]);

    assert.ok(finalTokenReserve.gt(initialTokenReserve));
    
  });

});

assertSwapContract && describe("Swaps From Contract", function() {

  it("Swap via Router", async function() {

    await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);

    const finalBalance = await token0.balanceOf(swapper.address);

    assert.ok(finalBalance.gt(0));
  });

  it("SwapExactTokensForEth From Contract", async function() {

    const initialBalance = await swapper.getBalance();

    await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
 
    const finalBalance = await swapper.getBalance();

    assert.ok(initialBalance.lt(finalBalance));
    
  });

  it("SwapETHForExactTokens From Contract", async function() {

    const initBalance = await token0.balanceOf(swapper.address);

    await swapETHForExactTokensFromContract(BigNumber.from(1), ETH_SWAP_AMOUNT, swapper)
      
    const finBalance = await token0.balanceOf(swapper.address);

    assert.ok(initBalance.lt(finBalance));
  });

  it("swapTokensForExactETH From Contract", async function() {

    const initBalance = await swapper.getBalance();

    const amountOut = BigNumber.from(1);

    const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);
      
    const finBalance = await swapper.getBalance();

    assert.ok(finBalance.sub(initBalance).add(fees_spent).eq(amountOut));
  });
  
});

assertValuesClassEqualContract && describe("Values From Contract Equals Values From Class", function() {

  it("Swap Same Amounts From Eth To Tokens Between Class And Contract", async function() {

    await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
    
    const reservesAfterContractSwap = await uniPair.getReserves();
    const contractSwappedAmount = await token0.balanceOf(swapper.address);

    const classSwappedAmount = uniPairClass.simulateSwapExactETHForTokens(
      ETH_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [weth.address, token0.address]
    );

    assert.ok(contractSwappedAmount.eq(classSwappedAmount[1]));
    assertClassAndContractReservesAreStrictEqual(uniPairClass, reservesAfterContractSwap);
  });

  it("Swap Same Amount Of Eth From Contract And Class", async function() {

    const initialBalance = await swapper.getBalance();

    const totalGasSpent = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
    const finalBalance = await swapper.getBalance();
 
    const reservesAfterContractSwap = await uniPair.getReserves();
    const swappedAmountFromContractWithoutGasfees = finalBalance.sub(initialBalance).add(totalGasSpent);
    
    const swappedAmounts = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [token0.address, weth.address]
    );

    assert.ok(swappedAmountFromContractWithoutGasfees.eq(swappedAmounts[1]));
    assertReservesAreEquals(reservesAfterContractSwap, uniPairClass);
  });

  it("Swap Same Amount For ETH for Exact Tokens An Contract And Class", async function() {
    router = router.connect(swapper);
    const deadline = await getDeadline(deployer.provider!);

    const initBalance = await token0.balanceOf(swapper.address);
    
    const path = [weth.address, token0.address];
    const amountIn = await router.getAmountsIn(
      TOKEN_SWAP_AMOUNT,
      path
    );
    
    await router.swapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      path,
      swapper.address,
      deadline,
      { value: amountIn[0] }
    );

    const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      path
    );
    
    const finBalance = await token0.balanceOf(swapper.address);
    const reserves = await uniPair.getReserves();

    assert.ok(uniPairClass.reserves[0].eq(reserves[0]));
    assert.ok(uniPairClass.reserves[1].eq(reserves[1]));
    assert.ok(swappedAmount[1].eq(finBalance.sub(initBalance)));
  });

  it("Swap Same Amount With swapTokensForExactETH From Contract And Class", async function() {
    const amountOut = BigNumber.from(1);

    const initialBalance = await swapper.getBalance();
    const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);

    const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
      amountOut,
      [token0.address, weth.address]
    );

    await assertSameStateAfterSwapBetweenClassAndContract(
      uniPairClass, 
      swappedAmount[1],
      { signer: swapper, initialBalance: initialBalance, fees_spent: fees_spent }
    );
    
  });

  it("Swap Same Amount After Multiple Swap With swapExactEthForTokens", async function() {

    const initialBalance = await token0.balanceOf(swapper.address);

    const totalSwapFees = await swapExactEthForTokensLoopFromContract(3, { signer: swapper, swapAmount: ETH_SWAP_AMOUNT });
    const finalBalance = await token0.balanceOf(swapper.address);
    const reserves = await uniPair.getReserves();
    const totalContractSwap = finalBalance.sub(initialBalance).add(totalSwapFees);
    
    const totalClassSwap = swapExactETHForTokensLoopFromClass(3, ETH_SWAP_AMOUNT);

    assert.ok(uniPairClass.reserves[0].eq(reserves[0]));
    assert.ok(uniPairClass.reserves[1].eq(reserves[1]));
    assertStrictEqualityToTheNearestHundredth(
      totalClassSwap,
      totalContractSwap
    );
  });

  it("Swap Same Amount After Multiple Swap With swapExactTokensForEth", async function() {
    const initialBalance = await swapper.getBalance();

    const totalSwapFees = await swapExactTokensForEthLoopFromContract(3, { signer: swapper, swapAmount: TOKEN_SWAP_AMOUNT });
    const finalBalance = await swapper.getBalance();
    const reservesAfterContractSwap = await uniPair.getReserves();
    const totalContractSwap = finalBalance.sub(initialBalance).add(totalSwapFees);
    
    const totalClassSwap = swapExactTokensForEthLoopFromClass(3, TOKEN_SWAP_AMOUNT);

    assert.ok(totalContractSwap.eq(totalClassSwap));
    assertClassAndContractReservesAreStrictEqual(uniPairClass, reservesAfterContractSwap);
  });

  it("Swap Same Amount After Multiple Swap With swapETHForExactTokens", async function() {

    const initialBalance = await token0.balanceOf(swapper.address);
    const totalSwapFees = await swapETHForExactTokensLoopFromContract(3, { swapAmount: TOKEN_SWAP_AMOUNT, signer: swapper });
    const finalBalance = await token0.balanceOf(swapper.address);

    const totalClassSwap = SwapETHForExactTokensLoopFromClass(3, TOKEN_SWAP_AMOUNT);
    const totalContractSwap = finalBalance.sub(initialBalance).add(totalSwapFees);
    
    const reservesAfterContractSwap = await uniPair.getReserves();

    assert.strictEqual(parseFloat(formatEther(totalContractSwap)).toFixed(2), parseFloat(formatEther(totalClassSwap)).toFixed(2));
    await assertClassAndContractReservesAreStrictEqual(
      uniPairClass, 
      reservesAfterContractSwap,
    );
  });

  it("Quotes From Contract And Class Are Equals", async function() {

    const amountA = parseEther("1");
    const contractReserves = await uniPair.getReserves();
    const uniPairClassQuote = uniPairClass.quote(amountA, [uniPairClass.token0, uniPairClass.token1]);
    const uniPairQuote = await router.quote(amountA, contractReserves[0], contractReserves[1])

    assert.ok(uniPairClassQuote.eq(uniPairQuote));
  });

  it("getAmountsIn From Contract And Class Are Equals", async function() {

    const path: [string, string] = [weth.address, token0.address];
    const sortedContractReserves = await getSortedContractReserves(path);
    
    const amountInClass = uniPairClass.getAmountsIn(TOKEN_SWAP_AMOUNT, path);
    const amountInContract = await router.getAmountIn(TOKEN_SWAP_AMOUNT, sortedContractReserves[0], sortedContractReserves[1]);

    assert.ok(amountInClass[0].eq(amountInContract));
  });

  it("getAmountsOut From Contract And Class Are Equals", async function() {

    const amountIn = parseEther("1");
    const path: [string, string] = [weth.address, token0.address];
    const amountOutClass = uniPairClass.getAmountsOut(amountIn, path);

    const sortedContractReserves = await getSortedContractReserves(path);
    const amountOutContract = await router.getAmountOut(
      amountIn, 
      sortedContractReserves[0], 
      sortedContractReserves[1]
    );

    assert.ok(amountOutClass[1].eq(amountOutContract));
  });

});

assertFrontruningTests && describe("Frontrunning", async function() {

  it("Estimates Slippage Correctly", async function() {    
    const path: [string, string] = [weth.address, token0.address];
    const price = await getPriceFromContract(path);

    const amountIn = wethAmounAddedToLiquidity.mul(1).div(100);
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
    
    const amountIn = wethAmounAddedToLiquidity.mul(1).div(100);
    const userPosition = await getUserPositionETHForExactTokens(amountIn, SLIPPAGE);

    const targetPrice = userPosition.amountOut.mul(parseEther("1")).div(userPosition.amountInMax);

    const [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingUnexpectedSlippageETHForExactTokens(
      userPosition
    );

    const deadline = await getDeadline(deployer.provider!);
    
    // frontrunner will always use `swapExactETHForTokens` (always wants to swap an exact amount in)
    router = router.connect(frontrunner);
    await router.swapExactETHForTokens(
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
    router = router.connect(frontrunner);
    await router.swapExactETHForTokens(
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
    router = router.connect(swapper);
    await router.swapETHForExactTokens(
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

    router = router.connect(swapper);
    await router.swapETHForExactTokens(
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

    router = router.connect(swapper);
    await router.swapExactETHForTokens(
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
  //   const UserPositionExactETHForTokens = await getUserPositionExactETHForTokens(parseEther("1"), 10);
  // });

  // it("Can say if a frontrun is profitable or not", async function() {});
  
});
