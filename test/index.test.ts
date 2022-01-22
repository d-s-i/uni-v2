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

const token0AmountAddedToLiquidity = parseEther("1000000");
const wethAmounAddedToLiquidity = parseEther("10000000000");

const assertDeployements = false;
const assertSwapTests = true;

beforeEach(async function () {
  
  [deployer, recolter, swapper, frontrunner] = await ethers.getSigners();
  await resetEthBalances([deployer.address, recolter.address, swapper.address]);
  
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

  const ETH_SWAP_AMOUNT = parseEther("2");
  const TOKEN_SWAP_AMOUNT = parseEther("10000");

  // it("Swap via Router", async function() {

  //   await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);

  //   const finalBalance = await token0.balanceOf(swapper.address);
  //   const contractFinalReserves = await uniPair.getReserves();

  //   // console.log("Router swapped amount", formatEther(finalBalance).toString(), "\n");
  //   // console.log("Contract Final Weth reserves: ", formatEther(contractFinalReserves[0]));
  //   // console.log("Contract Final Token reserves: ", formatEther(contractFinalReserves[1]));

  //   assert.ok(finalBalance.gt(0));

  // });

  // it("Swap Eth To Tokens Via The UniV2Pair Class", async function() {
  //   const reserves = await uniPair.getReserves();

  //   const contractToken0Reserves = reserves[0];
  //   const contractToken1Rerserves = reserves[1];

  //   const uniPairClass = await deployNewPairClass();

  //   const swappedAmount = uniPairClass.simulateSwapExactETHForTokens(
  //     ETH_SWAP_AMOUNT, 
  //     BigNumber.from(1), 
  //     [weth.address, token0.address]
  //   );

  //   // console.log("Class swappedAmount: ", formatEther(swappedAmount!));
  //   // console.log("Class final weth reserves", formatEther(uniPairClass.wethReserves));
  //   // console.log("Class final token reserves", formatEther(uniPairClass.tokenReserves));

  //   assert.ok(uniPairClass.token0Reserve.gt(contractToken0Reserves));
  //   assert.ok(uniPairClass.token1Reserves.lt(contractToken1Rerserves));
  // });

  // it("Swap Same Amounts From Eth To Tokens Between Class And Contract", async function() {

  //   const uniPairClass = await deployNewPairClass();

  //   await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
    
  //   const contractFinalReserves = await uniPair.getReserves();
  //   const contractSwappedAmount = await token0.balanceOf(swapper.address);

  //   const classSwappedAmount = uniPairClass.simulateSwapExactETHForTokens(
  //     ETH_SWAP_AMOUNT, 
  //     BigNumber.from(1), 
  //     [weth.address, token0.address]
  //   );

  //   // console.log("Uniswap class token0 reserves", formatEther(pairReserves[0]));
  //   // console.log("Uniswap class token1 Reserves", formatEther(pairReserves[1]));
  //   // console.log("Class swapped amount ", formatEther(classSwappedAmount!), "\n");

  //   // console.log("Contract token0 reserves ", formatEther(contractFinalReserves[0]));
  //   // console.log("Contract token1 reserves ", formatEther(contractFinalReserves[1]));
  //   // console.log("Contract swapped amount ", formatEther(contractSwappedAmount), "\n");

  //   assert.ok(contractSwappedAmount.eq(classSwappedAmount[1]));
  //   assert.ok(contractFinalReserves[1].eq(uniPairClass.token1Reserves));
  //   assert.ok(contractFinalReserves[0].eq(uniPairClass.token0Reserve));
  //   assert.ok(contractFinalReserves[0].eq(uniPairClass.reserves[0]));
  //   assert.ok(contractFinalReserves[1].eq(uniPairClass.reserves[1]));
    
  // });

  // it("Swap Tokens For Eth From Contract", async function() {

  //   const initialBalance = await swapper.getBalance();

  //   const totalGasSpent = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
 
  //   const reserves = await uniPair.getReserves();
    
  //   const finalBalance = await swapper.getBalance();
  //   // console.log("Amount of gas swapper without counting gas fees: ", formatEther(finalBalance.sub(initialBalance).add(totalGasSpent)));

  //   // console.log("Swapped amount From Contract: ", formatEther(finalBalance.sub(initialBalance)));
  //   // console.log("Contract token0 reserves ", formatEther(reserves[0]));
  //   // console.log("Contract token1 reserves ", formatEther(reserves[1]));

  //   assert.ok(initialBalance.lt(finalBalance));
    
  // });

  // it("Swap Tokens For Eth From Class", async function() {
  //   const reserves = await uniPair.getReserves();

  //   const contractToken0Reserves = reserves[0];
  //   const contractToken1Rerserves = reserves[1];

  //   const uniPairClass = await deployNewPairClass();

  //   const swappedAmount = uniPairClass.simulateSwapExactTokensForEth(
  //     TOKEN_SWAP_AMOUNT, 
  //     BigNumber.from(1), 
  //     [token0.address, weth.address]
  //   );

  //   // console.log("Class swappedAmount: ", formatEther(swappedAmount!));
  //   // console.log("Class final token0 reserves", formatEther(uniPairClass.token0Reserve));
  //   // console.log("Class final token1 reserves", formatEther(uniPairClass.token1Reserves));

  //   assert.ok(uniPairClass.token0Reserve.gt(contractToken0Reserves));
  //   assert.ok(uniPairClass.token1Reserves.lt(contractToken1Rerserves));

  // });

  // it("Swap Same Amount Of Eth From Contract And Class", async function() {

  //   const initialBalance = await swapper.getBalance();
  //   const uniPairClass = await deployNewPairClass();

  //   const totalGasSpent = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
  //   const finalBalance = await swapper.getBalance();
 
  //   const reservesAfterContractSwap = await uniPair.getReserves();
  //   const swappedAmountFromContractWithoutGasfees = finalBalance.sub(initialBalance).add(totalGasSpent);
    
  //   const swappedAmounts = uniPairClass.simulateSwapExactTokensForEth(
  //     TOKEN_SWAP_AMOUNT, 
  //     BigNumber.from(1), 
  //     [token0.address, weth.address]
  //   );

  //   assert.ok(swappedAmountFromContractWithoutGasfees.eq(swappedAmounts[1]!));
  //   assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
  //   assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserve));
  //   assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
  //   assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));

  // });

  // it("Swap ETH For Exact Tokens On Contract", async function() {
  //   router = router.connect(swapper);
  //   const deadline = await getDeadline(deployer.provider!);

  //   const initBalance = await token0.balanceOf(swapper.address);
    
  //   await router.swapETHForExactTokens(
  //     TOKEN_SWAP_AMOUNT,
  //     [weth.address, token0.address],
  //     swapper.address,
  //     deadline,
  //     { value: parseEther("1") }
  //     );
      
  //     const finBalance = await token0.balanceOf(swapper.address);
  //     const reserves = await uniPair.getReserves();

  //     // console.log("token0 reserves from contract: ", formatEther(reserves[0]));
  //     // console.log("token1 reserves from contract: ", formatEther(reserves[1]));

  //     assert.ok(initBalance.lt(finBalance));
  // });

  // it("Swap ETH For Exact Tokens On Class", async function() {
  //   const uniPairClass = await deployNewPairClass();

  //   const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
  //     TOKEN_SWAP_AMOUNT,
  //     [weth.address, token0.address]
  //   );

  //   // console.log("Swapped Amount: ", formatEther(swappedAmount!), "(should be ", formatEther(TOKEN_SWAP_AMOUNT), ")");
  //   // console.log("token0 reserves from class: ", formatEther(uniPairClass.reserves[0]));
  //   // console.log("token1 reserves from class: ", formatEther(uniPairClass.reserves[1]));

  // });

  // it("Swap Same Amount For ETH for Exact Tokens An Contract And Class", async function() {
  //   router = router.connect(swapper);
  //   const uniPairClass = await deployNewPairClass();
  //   const deadline = await getDeadline(deployer.provider!);

  //   const initBalance = await token0.balanceOf(swapper.address);
    
  //   await router.swapETHForExactTokens(
  //     TOKEN_SWAP_AMOUNT,
  //     [weth.address, token0.address],
  //     swapper.address,
  //     deadline,
  //     { value: parseEther("1") }
  //     );

  //     const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
  //       TOKEN_SWAP_AMOUNT,
  //       [weth.address, token0.address]
  //     );
      
  //     const finBalance = await token0.balanceOf(swapper.address);
  //     const reserves = await uniPair.getReserves();

  //     assert.ok(uniPairClass.reserves[0].eq(reserves[0]));
  //     assert.ok(uniPairClass.reserves[1].eq(reserves[1]));
  //     assert.ok(swappedAmount[1].eq(finBalance.sub(initBalance)));
  // });

  // it("swapTokensForExactETH From Contract", async function() {

  //   const initBalance = await swapper.getBalance();

  //   const amountOut = parseEther("0.01");

  //   const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);
      
  //   const finBalance = await swapper.getBalance();
  //   const reserves = await uniPair.getReserves();

  //   // console.log("Swapped amount: ", formatEther(finBalance.sub(initBalance).add(fees_spent)));
  //   // console.log("token0 reserves from contract: ", formatEther(reserves[0]));
  //   // console.log("token1 reserves from contract: ", formatEther(reserves[1]));

  //   assert.ok(finBalance.sub(initBalance).add(fees_spent).eq(amountOut));
  // });

  // it("swapTokensForExactETH From Class", async function() {
  //   const uniPairClass = await deployNewPairClass();

  //   const amountOut = parseEther("0.01");
  //   const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
  //     amountOut,
  //     [token0.address, weth.address]
  //   );

  //   // console.log("Swapped Amount: ", formatEther(swappedAmount!), "(should be ", formatEther(amountOut), ")");
  //   // console.log("token0 reserves from class: ", formatEther(uniPairClass.reserves[0]));
  //   // console.log("token1 reserves from class: ", formatEther(uniPairClass.reserves[1]));
    
  // });

  // it("Swap Same Amount With swapTokensForExactETH From Contract And Class", async function() {
  //   const amountOut = parseEther("0.01");
  //   const uniPairClass = await deployNewPairClass();

  //   const initBalance = await swapper.getBalance();
  //   const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);
  //   const finBalance = await swapper.getBalance();
  //   const reserves = await uniPair.getReserves();

  //   const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
  //     amountOut,
  //     [token0.address, weth.address]
  //   );

  //   assert.ok(uniPairClass.reserves[0].eq(reserves[0]));
  //   assert.ok(uniPairClass.reserves[1].eq(reserves[1]));
  //   assert.ok(swappedAmount[1].eq(finBalance.sub(initBalance).add(fees_spent)));
    
  // });

  // it("Swap Same Amount After Multiple Swap With swapExactEthForTokens", async function() {

  //   const uniPairClass = await deployNewPairClass();
    
  //   const initialBalance = await token0.balanceOf(swapper.address);
  //   const swap0_fees = await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
  //   const swap1_fees = await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
  //   const swap2_fees = await swapExactEthForTokensFromContract(ETH_SWAP_AMOUNT, token0.address, swapper);
  //   const finalBalance = await token0.balanceOf(swapper.address);
  //   const reserves = await uniPair.getReserves();

  //   const totalContractSwap = finalBalance.sub(initialBalance).add(swap0_fees).add(swap1_fees).add(swap2_fees);
    
  //   const swappedAmount0 = uniPairClass.simulateSwapExactETHForTokens(ETH_SWAP_AMOUNT, BigNumber.from(1), [weth.address, token0.address]);
  //   const swappedAmount1 = uniPairClass.simulateSwapExactETHForTokens(ETH_SWAP_AMOUNT, BigNumber.from(1), [weth.address, token0.address]);
  //   const swappedAmount2 = uniPairClass.simulateSwapExactETHForTokens(ETH_SWAP_AMOUNT, BigNumber.from(1), [weth.address, token0.address]);

  //   const totalClassSwap = swappedAmount0[1].add(swappedAmount1[1]).add(swappedAmount2[1]);

  //   assert.ok(uniPairClass.reserves[0].eq(reserves[0]));
  //   assert.ok(uniPairClass.reserves[1].eq(reserves[1]));
  //   assert.strictEqual(parseFloat(formatEther(totalClassSwap)).toFixed(2), parseFloat(formatEther(totalContractSwap)).toFixed(2));
    
  // });

  // it("Swap Same Amount After Multiple Swap With swapExactTokensForEth", async function() {
  //   const initialBalance = await swapper.getBalance();
  //   const uniPairClass = await deployNewPairClass();

  //   const swap0_fees = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
  //   const swap1_fees = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
  //   const swap2_fees = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
  //   const finalBalance = await swapper.getBalance();
 
  //   const reservesAfterContractSwap = await uniPair.getReserves();
  //   const totalContractSwap = finalBalance.sub(initialBalance).add(swap0_fees).add(swap1_fees).add(swap2_fees);
    
  //   const swappedAmount0 = uniPairClass.simulateSwapExactTokensForEth(
  //     TOKEN_SWAP_AMOUNT, 
  //     BigNumber.from(1), 
  //     [token0.address, weth.address]
  //   );
  //   const swappedAmount1 = uniPairClass.simulateSwapExactTokensForEth(
  //     TOKEN_SWAP_AMOUNT, 
  //     BigNumber.from(1), 
  //     [token0.address, weth.address]
  //   );
  //   const swappedAmount2 = uniPairClass.simulateSwapExactTokensForEth(
  //     TOKEN_SWAP_AMOUNT, 
  //     BigNumber.from(1), 
  //     [token0.address, weth.address]
  //   );
  //   const totalClassSwap = swappedAmount0[1].add(swappedAmount1[1]).add(swappedAmount2[1]);

  //   assert.ok(totalContractSwap.eq(totalClassSwap));
  //   assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
  //   assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserve));
  //   assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
  //   assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));
  // });

  // it("Swap Same Amount After Multiple Swap With swapETHForExactTokens", async function() {
  //   const uniPairClass = await deployNewPairClass();

  //   const initialBalance = await token0.balanceOf(swapper.address);
  //   const swap0_fees = await swapETHForExactTokensFromContract(
  //     TOKEN_SWAP_AMOUNT,
  //     parseEther("1"),
  //     swapper
  //   );
  //   const swap1_fees = await swapETHForExactTokensFromContract(
  //     TOKEN_SWAP_AMOUNT,
  //     parseEther("1"),
  //     swapper
  //   );
  //   const swap2_fees = await swapETHForExactTokensFromContract(
  //     TOKEN_SWAP_AMOUNT,
  //     parseEther("1"),
  //     swapper
  //   );
  //   const finalBalance = await token0.balanceOf(swapper.address);


  //   const swappedAmount0 = uniPairClass.simulateSwapETHForExactTokens(
  //     TOKEN_SWAP_AMOUNT,
  //     [weth.address, token0.address]
  //   );
  //   const swappedAmount1 = uniPairClass.simulateSwapETHForExactTokens(
  //     TOKEN_SWAP_AMOUNT,
  //     [weth.address, token0.address]
  //   );
  //   const swappedAmount2 = uniPairClass.simulateSwapETHForExactTokens(
  //     TOKEN_SWAP_AMOUNT,
  //     [weth.address, token0.address]
  //   );

  //   const totalContractSwap = finalBalance.sub(initialBalance).add(swap0_fees).add(swap1_fees).add(swap2_fees);
  //   const totalClassSwap = swappedAmount0[1].add(swappedAmount1[1]).add(swappedAmount2[1]);
    
  //   const reservesAfterContractSwap = await uniPair.getReserves();

  //   assert.strictEqual(parseFloat(formatEther(totalContractSwap)).toFixed(2), parseFloat(formatEther(totalClassSwap)).toFixed(2));
  //   assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
  //   assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserve));
  //   assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
  //   assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));
  // });

  // it("Can Tell If Frontun Is Profitable", async function() {

  //   const contractReserves = await uniPair.getReserves();

  //   const initContract = { contractToken0Reserves: contractReserves[0], contractToken1Rerserves: contractReserves[1] };
  //   const frontrunArgs = { initialSwapAmount: parseEther("100"), signer: swapper };
  //   const userSwapArgs = { swapAmount: parseEther("10"), amountOutMin: BigNumber.from("1") };
    
  //   const netProfits = await simulateFrontrunWithMaxSlippage(
  //     initContract,
  //     frontrunArgs,
  //     userSwapArgs
  //   );

  //   assert.ok(netProfits.gt(0));
    
  // });

  // it("Can Tell If Frontun Is Profitable With Increased Gas Fees On Sells", async function() {

  //   const contractReserves = await uniPair.getReserves();

  //   const initContract = { contractToken0Reserves: contractReserves[0], contractToken1Rerserves: contractReserves[1] };
  //   const frontrunArgs = { initialSwapAmount: parseEther("100"), signer: swapper };
  //   const userSwapArgs = { swapAmount: parseEther("10"), amountOutMin: BigNumber.from("1") };
    
  //   const profits = await simulateFrontrunWithMaxSlippage(
  //     initContract,
  //     frontrunArgs,
  //     userSwapArgs
  //   );

  //   assert.ok(profits.gt(0));

  // });

  // it("Quotes From Contract And Class Are Equals", async function() {
  //   const uniPairClass = await deployNewPairClass();

  //   const amountA = parseEther("1");
  //   const contractReserves = await uniPair.getReserves();
  //   const uniPairClassQuote = uniPairClass.quote(amountA, [uniPairClass.token0, uniPairClass.token1]);
  //   const uniPairQuote = await router.quote(amountA, contractReserves[0], contractReserves[1])

  //   assert.ok(uniPairClassQuote.eq(uniPairQuote));
  // });

  // it("getAmountsIn From Contract And Class Are Equals", async function() {
  //   const uniPairClass = await deployNewPairClass();

  //   const contractReserves = await uniPair.getReserves();

  //   const amountOut = parseEther("1");
  //   const amountInClass = uniPairClass.getAmountsIn(amountOut, [weth.address, token0.address]);
  //   const amountInContract = await router.getAmountIn(amountOut, contractReserves[0], contractReserves[1]);

  //   assert.ok(amountInClass[0].eq(amountInContract));
  // });

  // it("getAmountsOut From Contract And Class Are Equals", async function() {
  //   const uniPairClass = await deployNewPairClass();

  //   const contractReserves = await uniPair.getReserves();

  //   const amountIn = parseEther("1");
  //   const amountOutClass = uniPairClass.getAmountsOut(amountIn, [weth.address, token0.address]);
  //   const amountOutContract = await router.getAmountOut(amountIn, contractReserves[0], contractReserves[1]);
    
  //   assert.ok(amountOutClass[1].eq(amountOutContract));
  // });

  // it("Frontrun" , async function() {

  //   const deadline = await getDeadline(deployer.provider!);

  //   const uniPairClass = await deployNewPairClass();

  //   const userPosition: UserPosition = { 
  //     amountIn: parseEther("20"),
  //     amountOut: parseEther("35000"),
  //     path: [weth.address, token0.address] 
  //   };

  //   // const quote1 = uniPairClass.quote(parseEther("1"), userPosition.path);
  //   const classReserves = uniPairClass.getSortedReserves(userPosition.path[0], userPosition.path[1]);
  //   // const price = classReserves[1].div(classReserves[0]);
  //   const slippage = uniPairClass.getSlippageExposedFromSwapETHForExactTokens(userPosition.amountIn, userPosition.amountOut, userPosition.path);
  //   // console.log("slippage", 1/slippage);
  //   // const executionPrice = price.mul(Math.round((1/slippage)));
  //   // console.log("currPrice", price);
  //   // console.log("executionPrice", executionPrice);

  //   // console.log("+formatEther(classReserves[1])", +formatEther(classReserves[1]));
  //   // console.log("+price", +price);
  //   // console.log("+price * slippage", +price * slippage);
  //   // console.log("+formatEther(classReserves[0])", +formatEther(classReserves[0]));
  //   // const frontrunAmountIn = (+formatEther(classReserves[1]) / (+price * slippage)) - +formatEther(classReserves[0]);
    
  //   // const [frontrunAmountIn, frontrunAmountOutMin] = await getAmountsRespectingSlippageFromSwapETHForExactTokens(
  //   //   userPosition,
  //   //   parseUnits("1", "16")
  //   // );
  //   // const frontrunAmountIn = (classReserves[1].mul(1000).div(executionPrice)).sub(classReserves[0]);
  //   // console.log("frontrunAmountIn", frontrunAmountIn);
    
  //   const ONE = ethers.BigNumber.from(1);
  //   const TWO = ethers.BigNumber.from(2);

  //   function sqrt(value: BigNumber) {
  //     let z = value.add(ONE).div(TWO);
  //     let y = value;
  //     while (z.sub(y).isNegative()) {
  //         y = z;
  //         z = value.div(z).add(z).div(TWO);
  //     }
  //     return y;
  //   }

  //   // const frontrunAmountIn = classReserves[0].mul(Math.round((slippage - 1) * 100000)).div(100000).div(2); // give 122.5
  //   console.log("From second technic, amountIn is: ", formatEther(frontrunAmountIn));
  //   // const [, frontrunAmountOutMin] = uniPairClass.getAmountsOut(frontrunAmountIn, userPosition.path);

  //   // router = router.connect(frontrunner);

  //   // const reserves1 = await uniPair.getReserves();
  //   // console.log("Initial reserves: ", formatEther(reserves1[0]), formatEther(reserves1[1]));
  //   // console.log("reserves1[0] / reserves1[1]", reserves1[0].mul(1000).div(reserves1[1]).toNumber() / 1000);
  //   // console.log("reserves1[0] * reserves1[1]", formatEther(reserves1[0].mul(reserves1[1])));

  //   // await router.swapExactETHForTokens(
  //   //   frontrunAmountOutMin,
  //   //   userPosition.path,
  //   //   frontrunner.address,
  //   //   deadline,
  //   //   { value: frontrunAmountIn }
  //   // );

  //   // router = router.connect(swapper);
  //   // await router.swapExactETHForTokens(
  //   //   userPosition.amountOut,
  //   //   userPosition.path,
  //   //   frontrunner.address,
  //   //   deadline,
  //   //   { value: userPosition.amountIn }
  //   // );

  //   const reserves2 = await uniPair.getReserves();
  //   console.log("Final reserves: ", formatEther(reserves2[0]), formatEther(reserves2[1]));
  //   console.log("reserves2[0] / reserves2[1]", reserves2[0].mul(1000000).div(reserves2[1]).toNumber() / 1000000);
  //   // console.log("reserves2[0] * reserves2[1]", formatEther(reserves2[0].mul(reserves2[1])));

  //   // const quote2 = await router.quote(parseEther("1"), reserves2[0], reserves2[1]);

  //   // const slippageCreated = quote1.mul(1000).div(quote2).toNumber() / 1000;
  //   // console.log("Quote 1 : ", formatEther(quote1), "Quote 2 : ", formatEther(quote2), "slippage created : ", slippageCreated);

  //   // assert.strictEqual(slippageCreated, slippage);
  // });

  // it("Give the right price with decimals if price is greater than 0", function() {
  //   const token0Reserves = parseEther("200000");
  //   const wethReserves = parseEther("100");

  //   const price = token0Reserves.div(wethReserves);
  //   assert.ok(price.eq(2000));
  // });

  // it("Gives the right price with decimals if price is lower than 0", function() {
  //   const token0Reserves = parseEther("200000");
  //   const wethReserves = parseEther("100");

  //   // const price = token0Reserves.div(wethReserves);
  //   // const price = token0Reserves.mul(1000).div(wethReserves).eq(0) ? wethReserves.div(token0Reserves) : token0Reserves.div(wethReserves);
  //   let price = token0Reserves.mul(parseEther("1")).div(wethReserves);
  //   console.log("eq 0 ?", price.eq(0), formatEther(price));
  //   if(price.eq(0)) {
  //     price = wethReserves.mul(parseEther("1")).div(token0Reserves);
  //   }
  //   console.log("price", formatEther(price));

  //   // assert.ok(price.eq(2000));
  // });
  
  const displayVariables = false;
  // it("Calculate frontrun amount correctly", async function() {

  //   const userPosition: UserPosition = { 
  //     amountIn: parseEther("10"),
  //     amountOut: parseEther("18500"),
  //     path: [weth.address, token0.address] 
  //   };

  //   const uniPairClass = await deployNewPairClass();
  //   const [reservesIn, reservesOut] = uniPairClass.getSortedReserves(userPosition.path[0], userPosition.path[1]);
  //   const currentPrice = reservesOut.div(reservesIn);
  //   // const slippage = uniPairClass.getSlippageExposedFromSwapETHForExactTokens(userPosition.amountIn, userPosition.amountOut, userPosition.path);
  //   // const targetPrice = currentPrice.mul(parseEther(Math.round(1 / slippage).toString()));
  //   // const frontrunAmountIn = (reservesOut.mul(1000).div(targetPrice)).sub(reservesIn);
  //   // const targetPrice = userPosition.amountOut.div(userPosition.amountIn).eq(0) ? userPosition.amountIn.div(userPosition.amountOut) :  userPosition.amountOut.div(userPosition.amountIn);
  //   const targetPrice = userPosition.amountOut.mul(parseEther("1")).div(userPosition.amountIn);
  //   console.log("targetPrice", formatEther(targetPrice));
  //   const frontrunMaxAmountIn = (reservesOut.mul(parseEther("1")).div(targetPrice)).sub(reservesIn);
  //   const frontrunSlippage = uniPairClass.getSlippageCreatedFromAmountIn(frontrunMaxAmountIn, userPosition.path);
  //   const invertedSlippage = parseEther("1").mul(parseEther("1")).div(frontrunSlippage);
  //   const frontrunAmountInWithInvertedSlippage = frontrunMaxAmountIn.mul(invertedSlippage).div(parseEther("1"));
  //   const frontrunAmountInWithSlippage = frontrunMaxAmountIn.mul(frontrunSlippage.sub(parseEther("1"))).div(parseEther("1"));
  //   console.log("frontrunMaxAmountIn", formatEther(frontrunMaxAmountIn));
  //   console.log("frontrunAmountInWithInvertedSlippage", formatEther(frontrunAmountInWithInvertedSlippage));
  //   console.log("frontrunAmountInWithSlippage", formatEther(frontrunAmountInWithSlippage));
  //   console.log("created slippage: ", formatEther(frontrunSlippage), formatEther(invertedSlippage));
    
  //   displayVariables && console.log("reservesIn", formatEther(reservesIn));
  //   displayVariables && console.log("reservesOut", formatEther(reservesOut));
  //   displayVariables && console.log("currentPrice", currentPrice);
  //   // displayVariables && console.log("slippage", slippage);
  //   displayVariables && console.log("targetPrice", targetPrice);
  //   displayVariables && console.log("frontrunMaxAmountIn", formatEther(frontrunMaxAmountIn));
    
  //   const [,frontrunAmountOutMin] = uniPairClass.getAmountsOut(frontrunAmountInWithInvertedSlippage, userPosition.path);
  //   // const [brutFrontrunAmountIn, brutFrontrunAmountOutMin] = await getAmountsRespectingSlippageFromSwapETHForExactTokens(
  //   //   userPosition,
  //   //   parseUnits("1", "17")
  //   // );
  //   // displayVariables && console.log("brutFrontrunAmountIn", formatEther(brutFrontrunAmountIn));

  //   const deadline = await getDeadline(deployer.provider!);
    
  //   const reserves1 = await uniPair.getReserves();
  //   console.log("Initial reserves: ", formatEther(reserves1[0]), formatEther(reserves1[1]));
  //   console.log("reserves1[0] / reserves1[1]", formatEther(reserves1[1].mul(parseEther("1")).div(reserves1[0])));
    
  //   await router.swapExactETHForTokens(
  //     frontrunAmountOutMin,
  //     userPosition.path,
  //     frontrunner.address,
  //     deadline,
  //     { value: frontrunAmountInWithInvertedSlippage }
  //   );

  //   console.log("Frontrun swap done");

  //   // await router.swapExactETHForTokens(
  //   //   brutFrontrunAmountIn,
  //   //   userPosition.path,
  //   //   frontrunner.address,
  //   //   deadline,
  //   //   { value: brutFrontrunAmountOutMin }
  //   // );

  //   // router = router.connect(swapper);
  //   // await router.swapExactETHForTokens(
  //   //   userPosition.amountOut,
  //   //   userPosition.path,
  //   //   frontrunner.address,
  //   //   deadline,
  //   //   { value: userPosition.amountIn }
  //   // );
    
  //   const reserves2 = await uniPair.getReserves();
  //   console.log("Final reserves: ", formatEther(reserves2[0]), formatEther(reserves2[1]));
  //   console.log("reserves2[0] / reserves2[1]", formatEther(reserves2[1].mul(parseEther("1")).div(reserves2[0])));
    
  // });

  it("Adjust The Uniswap Price To The Target", async function() {
    const userPosition: UserPosition = { 
      amountIn: parseEther("100000000"),
      amountOut: parseEther("8000"),
      path: [weth.address, token0.address] 
    };

    const uniPairClass = await deployNewPairClass();
    const [reservesIn] = uniPairClass.getSortedReserves(userPosition.path[0], userPosition.path[1]);
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
    console.log("Initial reserves: ", formatEther(reserves1[0]), formatEther(reserves1[1]));
    console.log("reserves1[0] / reserves1[1]", formatEther(reserves1[0].mul(parseEther("1")).div(reserves1[1])));

    await router.swapExactETHForTokens(
      frontrunAmountOutMin,
      userPosition.path,
      frontrunner.address,
      deadline,
      { value: frontrunAmountInWithInvertedSlippage }
    );

    const reserves2 = await uniPair.getReserves();
    console.log("Final reserves: ", formatEther(reserves2[0]), formatEther(reserves2[1]));
    console.log("reserves2[0] / reserves2[1]", formatEther(reserves2[0].mul(parseEther("1")).div(reserves2[1])));
    
  });
  
});
