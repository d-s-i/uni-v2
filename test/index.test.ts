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
  resetEthBalances
} from "./helpers.test";
import { UniswapV2PairClass } from "./UniV2PairClass.test";

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

  // await weth.deposit({ value: parseEther("100") });
  const Factory = await ethers.getContractFactory("UniswapV2Factory");
  factory = await Factory.deploy(recolter.address);

  const Router = await ethers.getContractFactory("UniswapV2Router02");
  router = await Router.deploy(factory.address, weth.address, { gasLimit: BigNumber.from("8000000") });

  await factory.createPair(token0.address, weth.address);
  const poolAddress = await factory.getPair(token0.address, weth.address);
  // console.log(poolAddress);

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

  it("Deployed the Tokens", async function() {
    assertAddressExist(token0.address);
    assertAddressExist(weth.address);
  });

  it("Deployed the Factory", async function() {
    assertAddressExist(factory.address);
  });
  
  it("Deployed the Router", async function() {
    assertAddressExist(router.address);
  });

  it("Deployed the UniswapV2Pair", async function() {
    assertAddressExist(uniPair.address);
  });
  
  it("Added Liquidity", async function () {
    const token0PairBalance = await token0.balanceOf(uniPair.address);
    const wethPairBalance = await weth.balanceOf(uniPair.address);

    assert.ok(token0PairBalance.eq(token0AmountAddedToLiquidity));
    assert.ok(wethPairBalance.eq(wethAmounAddedToLiquidity));
  });
});

describe("Swap Eth to Tokens via Router", function() {

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

  it("Swap Eth to Tokens via the UniV2Pair Class", async function() {
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

  it("Swap Same Amounts From Eth to Tokens Between Class and Contract", async function() {

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

    assert.ok(contractSwappedAmount.eq(classSwappedAmount));
    assert.ok(contractFinalReserves[1].eq(uniPairClass.token1Reserves));
    assert.ok(contractFinalReserves[0].eq(uniPairClass.token0Reserve));
    assert.ok(contractFinalReserves[0].eq(uniPairClass.reserves[0]));
    assert.ok(contractFinalReserves[1].eq(uniPairClass.reserves[1]));
    
  });

  it("Swap Tokens for Eth From Contract", async function() {

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

  it("Swap Tokens for Eth From Class", async function() {
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

  it("Swap Same Amount of Eth From Contract and Class", async function() {

    const initialBalance = await swapper.getBalance();
    const uniPairClass = await deployNewPairClass();

    const totalGasSpent = await swapExactTokensForEthFromContract(swapper, TOKEN_SWAP_AMOUNT);
    const finalBalance = await swapper.getBalance();
 
    const reservesAfterContractSwap = await uniPair.getReserves();
    const swappedAmountFromContractWithoutGasfees = finalBalance.sub(initialBalance).add(totalGasSpent);
    
    const swappedAmount = uniPairClass.simulateSwapExactTokensForEth(
      TOKEN_SWAP_AMOUNT, 
      BigNumber.from(1), 
      [token0.address, weth.address]
    );

    assert.ok(swappedAmountFromContractWithoutGasfees.eq(swappedAmount!));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserve));
    assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
    assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));

  });

  it("Swap ETH for Exact Tokens on Contract", async function() {
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

  it("Swap ETH for Exact Tokens on Class", async function() {
    const uniPairClass = await deployNewPairClass();

    const swappedAmount = uniPairClass.simulateSwapETHForExactTokens(
      TOKEN_SWAP_AMOUNT,
      [weth.address, token0.address]
    );

    // console.log("Swapped Amount: ", formatEther(swappedAmount!), "(should be ", formatEther(TOKEN_SWAP_AMOUNT), ")");
    // console.log("token0 reserves from class: ", formatEther(uniPairClass.reserves[0]));
    // console.log("token1 reserves from class: ", formatEther(uniPairClass.reserves[1]));

  });

  it("Swap Same Amount for ETH for Exact Tokens on Contract and Class", async function() {
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

      assert.ok(
        uniPairClass.reserves[0].eq(reserves[0]) || 
        uniPairClass.reserves[0].add(1).eq(reserves[0]) || 
        uniPairClass.reserves[0].sub(1).eq(reserves[0])
      );
      assert.ok(
        uniPairClass.reserves[1].eq(reserves[1]) || 
        uniPairClass.reserves[1].add(1).eq(reserves[1]) || 
        uniPairClass.reserves[1].sub(1).eq(reserves[1])
      );
      assert.ok(swappedAmount.eq(finBalance.sub(initBalance)));
  });

  it("swapTokensForExactETH from Contract", async function() {
    router = router.connect(swapper);
    const deadline = await getDeadline(deployer.provider!);

    const initBalance = await swapper.getBalance();

    token0 = token0.connect(deployer);
    await token0.transfer(swapper.address, parseEther("100000"));
    
    token0 = token0.connect(swapper);
    await token0.approve(router.address, BigInt(2**255));

    const amountOut = parseEther("0.01");
    const amountIn = await router.getAmountsIn(amountOut, [token0.address, weth.address]);
    await router.swapTokensForExactETH(
      amountOut,
      amountIn[0],
      [token0.address, weth.address],
      swapper.address,
      deadline,
      );
      
      const finBalance = await swapper.getBalance();
      const reserves = await uniPair.getReserves();

      console.log("Swapped amount: ", finBalance.sub(initBalance));

      console.log("token0 reserves from contract: ", formatEther(reserves[0]));
      console.log("token1 reserves from contract: ", formatEther(reserves[1]));

      assert.ok(initBalance.lt(finBalance));
  });
  
});
