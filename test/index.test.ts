import { ethers } from "hardhat";
import { parseEther, formatEther } from "ethers/lib/utils";
import assert from "assert";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { assertAddressExist } from "./assertions.test";
import { 
  getDeadline, 
  swapExactEthForTokensFromContract, 
  deployNewPairClass, 
  swapExactTokensForEthFromContract,
  resetEthBalances,
  swapTokensForExactETHFromContract,
  swapETHForExactTokensFromContract     
} from "./helpers.test";

export let deployer: SignerWithAddress;
let recolter: SignerWithAddress;
let swapper: SignerWithAddress;

export let token0: Contract;
export let weth: Contract;
let factory: Contract;
export let router: Contract;
export let uniPair: Contract;

const token0AmountAddedToLiquidity = parseEther("1000000000");
const wethAmounAddedToLiquidity = parseEther("1000");

beforeEach(async function () {

  
  [deployer, recolter, swapper] = await ethers.getSigners();
  await resetEthBalances([deployer.address, recolter.address, swapper.address]);
  
  const ERC20 = await ethers.getContractFactory("ERC20");
  token0 = await ERC20.deploy(parseEther("100000000000"));
  const WETH = await ethers.getContractFactory("WETH9");
  weth = await WETH.deploy();

  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  factory = await Factory.deploy(recolter.address);

  const Router = await ethers.getContractFactory("UniswapV2Router02");
  router = await Router.deploy(factory.address, weth.address, { gasLimit: BigNumber.from("8000000") });

  await factory.createPair(token0.address, weth.address);
  const poolAddress = await factory.getPair(token0.address, weth.address);

  await token0.approve(router.address, BigInt(2**255));
  await weth.approve(router.address, BigInt(2**255));

  const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
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

describe("Deployments", function () {

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

describe("Swap Eth To Tokens Via Router", function() {

  const ETH_SWAP_AMOUNT = parseEther("2");
  const TOKEN_SWAP_AMOUNT = parseEther("10000");

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

    assert.ok(uniPairClass.token0Reserve.gt(contractToken0Reserves));
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
    assert.ok(contractFinalReserves[0].eq(uniPairClass.token0Reserve));
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

    const swappedAmount = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [token0.address, weth.address]
    );

    // console.log("Class swappedAmount: ", formatEther(swappedAmount!));
    // console.log("Class final token0 reserves", formatEther(uniPairClass.token0Reserve));
    // console.log("Class final token1 reserves", formatEther(uniPairClass.token1Reserves));

    assert.ok(uniPairClass.token0Reserve.gt(contractToken0Reserves));
    assert.ok(uniPairClass.token1Reserves.lt(contractToken1Rerserves));

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
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserve));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));

  });

  it("Swap ETH For Exact Tokens On Contract", async function() {
    router = router.connect(swapper);
    const deadline = await getDeadline(deployer.provider!);

    const initBalance = await token0.balanceOf(swapper.address);
    
    await router.swapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      [weth.address, token0.address],
      swapper.address,
      deadline,
      { value: parseEther("1") }
      );
      
      const finBalance = await token0.balanceOf(swapper.address);
      const reserves = await uniPair.getReserves();

      // console.log("token0 reserves from contract: ", formatEther(reserves[0]));
      // console.log("token1 reserves from contract: ", formatEther(reserves[1]));

      assert.ok(initBalance.lt(finBalance));
  });

  it("Swap ETH For Exact Tokens On Class", async function() {
    const uniPairClass = await deployNewPairClass();

    const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      [weth.address, token0.address]
    );

    // console.log("Swapped Amount: ", formatEther(swappedAmount!), "(should be ", formatEther(TOKEN_SWAP_AMOUNT), ")");
    // console.log("token0 reserves from class: ", formatEther(uniPairClass.reserves[0]));
    // console.log("token1 reserves from class: ", formatEther(uniPairClass.reserves[1]));

  });

  it("Swap Same Amount For ETH for Exact Tokens An Contract And Class", async function() {
    router = router.connect(swapper);
    const uniPairClass = await deployNewPairClass();
    const deadline = await getDeadline(deployer.provider!);

    const initBalance = await token0.balanceOf(swapper.address);
    
    await router.swapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      [weth.address, token0.address],
      swapper.address,
      deadline,
      { value: parseEther("1") }
      );

      const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
        TOKEN_SWAP_AMOUNT,
        [weth.address, token0.address]
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

    const amountOut = parseEther("0.01");
    const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
      amountOut,
      [token0.address, weth.address]
    );

    // console.log("Swapped Amount: ", formatEther(swappedAmount!), "(should be ", formatEther(amountOut), ")");
    // console.log("token0 reserves from class: ", formatEther(uniPairClass.reserves[0]));
    // console.log("token1 reserves from class: ", formatEther(uniPairClass.reserves[1]));
    
  });

  it("Swap Same Amount With swapTokensForExactETH From Contract And Class", async function() {
    const amountOut = parseEther("0.01");
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
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserve));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));
  });

  it("Swap Same Amount After Multiple Swap With swapETHForExactTokens", async function() {
    const uniPairClass = await deployNewPairClass();

    const initialBalance = await token0.balanceOf(swapper.address);
    const swap0_fees = await swapETHForExactTokensFromContract(
      TOKEN_SWAP_AMOUNT,
      parseEther("1"),
      swapper
    );
    const swap1_fees = await swapETHForExactTokensFromContract(
      TOKEN_SWAP_AMOUNT,
      parseEther("1"),
      swapper
    );
    const swap2_fees = await swapETHForExactTokensFromContract(
      TOKEN_SWAP_AMOUNT,
      parseEther("1"),
      swapper
    );
    const finalBalance = await token0.balanceOf(swapper.address);


    const swappedAmount0 = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      [weth.address, token0.address]
    );
    const swappedAmount1 = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      [weth.address, token0.address]
    );
    const swappedAmount2 = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      [weth.address, token0.address]
    );

    const totalContractSwap = finalBalance.sub(initialBalance).add(swap0_fees).add(swap1_fees).add(swap2_fees);
    const totalClassSwap = swappedAmount0[1].add(swappedAmount1[1]).add(swappedAmount2[1]);
    
    const reservesAfterContractSwap = await uniPair.getReserves();

    assert.strictEqual(parseFloat(formatEther(totalContractSwap)).toFixed(2), parseFloat(formatEther(totalClassSwap)).toFixed(2));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserve));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));
  });

  // it("Can Tell If Frontun Is Profitable", async function() {

  //   const uniPairClass = await deployNewPairClass();

  //   uniPairClass.simulateSwapExactETHForTokens(
  //     parseEther("100"),
  //     BigNumber.from("1"),
  //     [weth.address, token0.address]
  //   );

  //   uniPairClass.simulateSwapExactETHForTokens(
  //     parseEther("50"),
  //     BigNumber.from("1"),
  //     [weth.address, token0.address]
  //   );

  //   uniPairClass.simulateSwapExactTokensForEth()
    
    
  // });
  
});
