import { ethers } from "hardhat";
import { parseEther, formatEther, parseUnits } from "ethers/lib/utils";
import assert from "assert";
import { BigNumber, Contract, Signer } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { assertAddressExist } from "./assertions.test";
import { UserPosition } from "./types.test";
import { 
  getDeadline, 
  swapExactEthForTokensFromContract, 
  deployNewPairClass, 
  swapExactTokensForEthFromContract,
  resetEthBalances,
  swapTokensForExactETHFromContract,
  swapETHForExactTokensFromContract ,
  simulateFrontrunWithMaxSlippage,
  getAmountsRespectingSlippageFromSwapETHForExactTokens  
} from "./helpers.test";

export let deployer: SignerWithAddress;
let recolter: SignerWithAddress;
let swapper: SignerWithAddress;
let frontrunner: SignerWithAddress;

export let token0: Contract;
export let weth: Contract;
let factory: Contract;
export let router: Contract;
export let uniPair: Contract;

const token0AmountAddedToLiquidity = parseEther("200000");
const wethAmounAddedToLiquidity = parseEther("100");

const assertDeployements = false;
const assertSwapTests = true;

beforeEach(async function () {
  
  [deployer, recolter, swapper, frontrunner] = await ethers.getSigners();
  await resetEthBalances([deployer.address, recolter.address, swapper.address], wethAmounAddedToLiquidity.mul(10));
  
  const ERC20 = await ethers.getContractFactory("ERC20");
  token0 = await ERC20.deploy(parseEther("100000000000"));
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

assertSwapTests && describe("Swap Eth To Tokens Via Router", function() {

  const ETH_SWAP_AMOUNT = wethAmounAddedToLiquidity.mul(5).div(100);
  const TOKEN_SWAP_AMOUNT = token0AmountAddedToLiquidity.mul(10).div(100);

  it("Swap via Router", async function() {

    await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);

    const finalBalance = await token0.balanceOf(swapper.address);
    const contractFinalReserves = await uniPair.getReserves();

    // console.log("Router swapped amount", formatEther(finalBalance).toString(), "\n");
    // console.log("Contract Final Weth reserves: ", formatEther(contractFinalReserves[0]));
    // console.log("Contract Final Token reserves: ", formatEther(contractFinalReserves[1]));

    assert.ok(finalBalance.gt(0));

  });

  it("Swap Eth To Tokens Via The UniV2Pair Class", async function() {
    const reserves = await uniPair.getReserves();

    const contractToken0Reserves = reserves[0];
    const contractToken1Rerserves = reserves[1];

    const uniPairClass = await deployNewPairClass();

    const swappedAmount = uniPairClass.simulateSwapExactETHForTokens(
      ETH_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [weth.address, token0.address]
    );

    // console.log("Class swappedAmount: ", formatEther(swappedAmount!));
    // console.log("Class final weth reserves", formatEther(uniPairClass.wethReserves));
    // console.log("Class final token reserves", formatEther(uniPairClass.tokenReserves));

    assert.ok(uniPairClass.token0Reserves.gt(contractToken0Reserves));
    assert.ok(uniPairClass.token1Reserves.lt(contractToken1Rerserves));
  });

  it("Swap Same Amounts From Eth To Tokens Between Class And Contract", async function() {

    const uniPairClass = await deployNewPairClass();

    await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
    
    const contractFinalReserves = await uniPair.getReserves();
    const contractSwappedAmount = await token0.balanceOf(swapper.address);

    const classSwappedAmount = uniPairClass.simulateSwapExactETHForTokens(
      ETH_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [weth.address, token0.address]
    );

    // console.log("Uniswap class token0 reserves", formatEther(pairReserves[0]));
    // console.log("Uniswap class token1 Reserves", formatEther(pairReserves[1]));
    // console.log("Class swapped amount ", formatEther(classSwappedAmount!), "\n");

    // console.log("Contract token0 reserves ", formatEther(contractFinalReserves[0]));
    // console.log("Contract token1 reserves ", formatEther(contractFinalReserves[1]));
    // console.log("Contract swapped amount ", formatEther(contractSwappedAmount), "\n");

    assert.ok(contractSwappedAmount.eq(classSwappedAmount[1]));
    assert.ok(contractFinalReserves[1].eq(uniPairClass.token1Reserves));
    assert.ok(contractFinalReserves[0].eq(uniPairClass.token0Reserves));
    assert.ok(contractFinalReserves[0].eq(uniPairClass.reserves[0]));
    assert.ok(contractFinalReserves[1].eq(uniPairClass.reserves[1]));
    
  });

  it("Swap Tokens For Eth From Contract", async function() {

    const initialBalance = await swapper.getBalance();

    const totalGasSpent = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
 
    const reserves = await uniPair.getReserves();
    
    const finalBalance = await swapper.getBalance();
    // console.log("Amount of gas swapper without counting gas fees: ", formatEther(finalBalance.sub(initialBalance).add(totalGasSpent)));

    // console.log("Swapped amount From Contract: ", formatEther(finalBalance.sub(initialBalance)));
    // console.log("Contract token0 reserves ", formatEther(reserves[0]));
    // console.log("Contract token1 reserves ", formatEther(reserves[1]));

    assert.ok(initialBalance.lt(finalBalance));
    
  });

  it("Swap Tokens For Eth From Class", async function() {
    const reserves = await uniPair.getReserves();

    const contractToken0Reserves = reserves[0];
    const contractToken1Rerserves = reserves[1];

    const uniPairClass = await deployNewPairClass();
    const path = [token0.address, weth.address];

    const swappedAmount = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      path
    );

    // console.log("Class swappedAmount: ", formatEther(swappedAmount[1]));
    // console.log("Class final token0 reserves", formatEther(uniPairClass.token0Reserves));
    // console.log("Class final token1 reserves", formatEther(uniPairClass.token1Reserves));

    const sortedReserves = uniPairClass.getSortedReserves(path);

    if(path[0] === token0.address) {
      assert.ok(sortedReserves[0].gt(contractToken0Reserves));
      assert.ok(sortedReserves[1].lt(contractToken1Rerserves));
    } else {
      assert.ok(sortedReserves[0].lt(contractToken0Reserves));
      assert.ok(sortedReserves[1].gt(contractToken1Rerserves));
    }

  });

  it("Swap Same Amount Of Eth From Contract And Class", async function() {

    const initialBalance = await swapper.getBalance();
    const uniPairClass = await deployNewPairClass();

    const totalGasSpent = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
    const finalBalance = await swapper.getBalance();
 
    const reservesAfterContractSwap = await uniPair.getReserves();
    const swappedAmountFromContractWithoutGasfees = finalBalance.sub(initialBalance).add(totalGasSpent);
    
    const swappedAmounts = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [token0.address, weth.address]
    );

    assert.ok(swappedAmountFromContractWithoutGasfees.eq(swappedAmounts[1]!));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));

  });

  it("Swap ETH For Exact Tokens On Contract", async function() {
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
      
    const finBalance = await token0.balanceOf(swapper.address);
    const reserves = await uniPair.getReserves();

    // console.log("token0 reserves from contract: ", formatEther(reserves[0]));
    // console.log("token1 reserves from contract: ", formatEther(reserves[1]));

    assert.ok(initBalance.lt(finBalance));
  });

  it("Swap ETH For Exact Tokens On Class", async function() {
    const uniPairClass = await deployNewPairClass();

    const path = [weth.address, token0.address];
    const initialReserves = uniPairClass.getSortedReserves(path)
    let initialTokenReserve;
    if(path[1] === uniPairClass.token1) {
      initialTokenReserve = initialReserves[1];
    } else {
      initialTokenReserve = initialReserves[0];
    }
    const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      path
    );

    const finalReserves = uniPairClass.getSortedReserves(path);
    let finalTokenReserve;
    if(path[1] === uniPairClass.token1) {
      finalTokenReserve = finalReserves[1];
    } else {
      finalTokenReserve = finalReserves[0];
    }

    assert.ok(finalTokenReserve.lt(initialTokenReserve));

    // console.log("Swapped Amount: ", formatEther(swappedAmount!), "(should be ", formatEther(TOKEN_SWAP_AMOUNT), ")");
    // console.log("token0 reserves from class: ", formatEther(uniPairClass.reserves[0]));
    // console.log("token1 reserves from class: ", formatEther(uniPairClass.reserves[1]));
  });

  it("Swap Same Amount For ETH for Exact Tokens An Contract And Class", async function() {
    router = router.connect(swapper);
    const uniPairClass = await deployNewPairClass();
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

  it("swapTokensForExactETH From Contract", async function() {

    const initBalance = await swapper.getBalance();

    const amountOut = parseEther("0.01");

    const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);
      
    const finBalance = await swapper.getBalance();
    const reserves = await uniPair.getReserves();

    // console.log("Swapped amount: ", formatEther(finBalance.sub(initBalance).add(fees_spent)));
    // console.log("token0 reserves from contract: ", formatEther(reserves[0]));
    // console.log("token1 reserves from contract: ", formatEther(reserves[1]));

    assert.ok(finBalance.sub(initBalance).add(fees_spent).eq(amountOut));
  });

  it("swapTokensForExactETH From Class", async function() {
    const uniPairClass = await deployNewPairClass();

    const path = [token0.address, weth.address];
    const initialReserves = uniPairClass.getSortedReserves(path);
    let initialTokenReserve;
    if(path[0] === uniPairClass.token1) {
      initialTokenReserve = initialReserves[1];
    } else {
      initialTokenReserve = initialReserves[0];
    }
    const amountOut = parseEther("1");
    const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
      amountOut,
      path
    );

    const finalReserves = uniPairClass.getSortedReserves(path);
    let finalTokenReserve;
    if(path[0] === uniPairClass.token1) {
      finalTokenReserve = finalReserves[1];
    } else {
      finalTokenReserve = finalReserves[0];
    }

    assert.ok(finalTokenReserve.gt(initialTokenReserve));
    
  });

  it("Swap Same Amount With swapTokensForExactETH From Contract And Class", async function() {
    const amountOut = parseEther("1");
    const uniPairClass = await deployNewPairClass();

    const initBalance = await swapper.getBalance();
    const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);
    const finBalance = await swapper.getBalance();
    const reserves = await uniPair.getReserves();

    const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
      amountOut,
      [token0.address, weth.address]
    );

    assert.ok(uniPairClass.reserves[0].eq(reserves[0]));
    assert.ok(uniPairClass.reserves[1].eq(reserves[1]));
    assert.ok(swappedAmount[1].eq(finBalance.sub(initBalance).add(fees_spent)));
    
  });

  it("Swap Same Amount After Multiple Swap With swapExactEthForTokens", async function() {

    const uniPairClass = await deployNewPairClass();
    
    const initialBalance = await token0.balanceOf(swapper.address);
    const swap0_fees = await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
    const swap1_fees = await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
    const swap2_fees = await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
    const finalBalance = await token0.balanceOf(swapper.address);
    const reserves = await uniPair.getReserves();

    const totalContractSwap = finalBalance.sub(initialBalance).add(swap0_fees).add(swap1_fees).add(swap2_fees);
    
    const swappedAmount0 = uniPairClass.simulateSwapExactETHForTokens(ETH_SWAP_AMOUNT, BigNumber.from(1), [weth.address, token0.address]);
    const swappedAmount1 = uniPairClass.simulateSwapExactETHForTokens(ETH_SWAP_AMOUNT, BigNumber.from(1), [weth.address, token0.address]);
    const swappedAmount2 = uniPairClass.simulateSwapExactETHForTokens(ETH_SWAP_AMOUNT, BigNumber.from(1), [weth.address, token0.address]);

    const totalClassSwap = swappedAmount0[1].add(swappedAmount1[1]).add(swappedAmount2[1]);

    assert.ok(uniPairClass.reserves[0].eq(reserves[0]));
    assert.ok(uniPairClass.reserves[1].eq(reserves[1]));
    assert.strictEqual(parseFloat(formatEther(totalClassSwap)).toFixed(2), parseFloat(formatEther(totalContractSwap)).toFixed(2));
    
  });

  it("Swap Same Amount After Multiple Swap With swapExactTokensForEth", async function() {
    const initialBalance = await swapper.getBalance();
    const uniPairClass = await deployNewPairClass();

    const swap0_fees = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
    const swap1_fees = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
    const swap2_fees = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
    const finalBalance = await swapper.getBalance();
 
    const reservesAfterContractSwap = await uniPair.getReserves();
    const totalContractSwap = finalBalance.sub(initialBalance).add(swap0_fees).add(swap1_fees).add(swap2_fees);
    
    const swappedAmount0 = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [token0.address, weth.address]
    );
    const swappedAmount1 = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [token0.address, weth.address]
    );
    const swappedAmount2 = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [token0.address, weth.address]
    );
    const totalClassSwap = swappedAmount0[1].add(swappedAmount1[1]).add(swappedAmount2[1]);

    assert.ok(totalContractSwap.eq(totalClassSwap));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));
  });

  it("Swap Same Amount After Multiple Swap With swapETHForExactTokens", async function() {
    const uniPairClass = await deployNewPairClass();

    const path = [weth.address, token0.address];
    const initialBalance = await token0.balanceOf(swapper.address);
    const amountIn0 = await router.getAmountsIn(
      TOKEN_SWAP_AMOUNT,
      path
    );
    const swap0_fees = await swapETHForExactTokensFromContract(
      TOKEN_SWAP_AMOUNT,
      amountIn0[0],
      swapper
    );

    const amountIn1 = await router.getAmountsIn(
      TOKEN_SWAP_AMOUNT,
      path
    );
    const swap1_fees = await swapETHForExactTokensFromContract(
      TOKEN_SWAP_AMOUNT,
      amountIn1[0],
      swapper
    );

    const amountIn2 = await router.getAmountsIn(
      TOKEN_SWAP_AMOUNT,
      path
    );
    const swap2_fees = await swapETHForExactTokensFromContract(
      TOKEN_SWAP_AMOUNT,
      amountIn2[0],
      swapper
    );
    const finalBalance = await token0.balanceOf(swapper.address);


    const swappedAmount0 = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      path
    );
    const swappedAmount1 = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      path
    );
    const swappedAmount2 = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      path
    );

    const totalContractSwap = finalBalance.sub(initialBalance).add(swap0_fees).add(swap1_fees).add(swap2_fees);
    const totalClassSwap = swappedAmount0[1].add(swappedAmount1[1]).add(swappedAmount2[1]);
    
    const reservesAfterContractSwap = await uniPair.getReserves();

    assert.strictEqual(parseFloat(formatEther(totalContractSwap)).toFixed(2), parseFloat(formatEther(totalClassSwap)).toFixed(2));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));
  });

  it("Quotes From Contract And Class Are Equals", async function() {
    const uniPairClass = await deployNewPairClass();

    const amountA = parseEther("1");
    const contractReserves = await uniPair.getReserves();
    const uniPairClassQuote = uniPairClass.quote(amountA, [uniPairClass.token0, uniPairClass.token1]);
    const uniPairQuote = await router.quote(amountA, contractReserves[0], contractReserves[1])

    assert.ok(uniPairClassQuote.eq(uniPairQuote));
  });

  it("getAmountsIn From Contract And Class Are Equals", async function() {
    const uniPairClass = await deployNewPairClass();

    const contractReserves = await uniPair.getReserves();

    const amountOut = parseEther("1");
    const amountInClass = uniPairClass.getAmountsIn(amountOut, [weth.address, token0.address]);
    const amountInContract = await router.getAmountIn(amountOut, contractReserves[0], contractReserves[1]);

    assert.ok(amountInClass[0].eq(amountInContract));
  });

  it("getAmountsOut From Contract And Class Are Equals", async function() {
    const uniPairClass = await deployNewPairClass();

    const contractReserves = await uniPair.getReserves();
    let sortedContractReserves = [];

    const amountIn = parseEther("1");
    const path = [weth.address, token0.address];
    const amountOutClass = uniPairClass.getAmountsOut(amountIn, path);
    const sortedTokens = uniPairClass.sortTokens(path[0], path[1]);
    if(sortedTokens[0] === path[0]) {
      sortedContractReserves = contractReserves;
    } else {
      sortedContractReserves[0] = contractReserves[1];
      sortedContractReserves[1] = contractReserves[0];
  }
    const amountOutContract = await router.getAmountOut(
      amountIn, 
      sortedContractReserves[0], 
      sortedContractReserves[1]
    );

    const classReserves = uniPairClass.getSortedReserves([weth.address, token0.address]);
    assert.ok(amountOutClass[1].eq(amountOutContract));
  });
  
  it("Adjust The Uniswap Price To The Target For swapETHForExactTokens", async function() {
    const price = token0AmountAddedToLiquidity.mul(parseEther("1")).div(wethAmounAddedToLiquidity);
    const amountIn = wethAmounAddedToLiquidity.mul(10).div(100);
    const amountOut = amountIn.mul(price).div(parseEther("1")).mul(80).div(100);
    const userPosition: UserPosition = { 
      amountIn: amountIn,
      amountOut: amountOut,
      path: [weth.address, token0.address] 
    };

    console.log("price: ", formatEther(price));
    console.log("amountOut: ", formatEther(amountOut));

    const uniPairClass = await deployNewPairClass();
    const [reservesIn] = uniPairClass.getSortedReserves(userPosition.path);
    const userSlippage = uniPairClass.getSlippageExposedFromSwapETHForExactTokens(
      userPosition.amountIn,
      userPosition.amountOut,
      userPosition.path
    );
    console.log("userSlippage", formatEther(userSlippage));
    const targetPrice = userPosition.amountOut.mul(parseEther("1")).div(userPosition.amountIn);
    console.log("targetPrice", formatEther(targetPrice));

    const frontrunMaxAmountIn = (reservesIn.mul(userSlippage.sub(parseEther("1")))).div(parseEther("1")).div(2);
    const frontrunSlippage = uniPairClass.getSlippageCreatedFromAmountIn(frontrunMaxAmountIn, userPosition.path);
    const invertedSlippage = parseEther("1").mul(parseEther("1")).div(frontrunSlippage);
    const frontrunAmountInWithInvertedSlippage = frontrunMaxAmountIn.mul(invertedSlippage).div(parseEther("1"));
    console.log("amountIn", formatEther(frontrunAmountInWithInvertedSlippage));
    const [,frontrunAmountOutMin] = uniPairClass.getAmountsOut(frontrunAmountInWithInvertedSlippage, userPosition.path);
    
    const deadline = await getDeadline(deployer.provider!);
    
    const reserves1 = await uniPair.getReserves();
    let sortedContractReserves1 = [];
    const sortedTokens = uniPairClass.sortTokens(userPosition.path[0], userPosition.path[1]);
    if(sortedTokens[0] === userPosition.path[0]) {
      sortedContractReserves1 = reserves1;
    } else {
      sortedContractReserves1[0] = reserves1[1];
      sortedContractReserves1[1] = reserves1[0];
    }
    const initialPrice = sortedContractReserves1[1].mul(parseEther("1")).div(sortedContractReserves1[0]);
    console.log("Initial reserves: ", formatEther(sortedContractReserves1[0]), formatEther(sortedContractReserves1[1]));
    console.log("Initial Price (reserves1[0] / reserves1[1])", formatEther(initialPrice));


    await router.swapExactETHForTokens(
      frontrunAmountOutMin,
      userPosition.path,
      frontrunner.address,
      deadline,
      { value: frontrunAmountInWithInvertedSlippage }
    );

    const reserves2 = await uniPair.getReserves();
    let sortedContractReserves2 = [];
    if(sortedTokens[0] === userPosition.path[0]) {
      sortedContractReserves2 = reserves2;
    } else {
      sortedContractReserves2[0] = reserves2[1];
      sortedContractReserves2[1] = reserves2[0];
    }

    const finalPrice = sortedContractReserves2[1].mul(parseEther("1")).div(sortedContractReserves2[0]);

    console.log("Final reserves: ", formatEther(reserves2[0]), formatEther(reserves2[1]));
    console.log("Final Price (amountOut / amountIn)", formatEther(finalPrice));

    assert.ok(
      finalPrice.lt(targetPrice.add(targetPrice.mul(15).div(1000))) &&
      finalPrice.gt(targetPrice.sub(targetPrice.mul(15).div(1000)))
    );
    
  });
  
});
