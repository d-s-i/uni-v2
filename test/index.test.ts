import { ethers } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import {
    resetEthBalances,
    deployNewPairClass,
    getDeadline
} from "./helpers/helpers.test";

import { UniswapV2PairClass } from "../src/UniswapV2PairClass";
import { ONE_ETHER } from "../src/constants";

export let deployer: SignerWithAddress;
export let recolter: SignerWithAddress;
export let swapper: SignerWithAddress;
export let frontrunner: SignerWithAddress;

export let token0: Contract;
export let weth: Contract;
export let factory: Contract;
export let router: Contract;
export let uniPair: Contract;
export let uniPairClass: UniswapV2PairClass<string>;

export const token0AmountAddedToLiquidity = BigInt("200000") * ONE_ETHER;
export const wethAmounAddedToLiquidity = BigInt("100") * ONE_ETHER;

export const ETH_SWAP_AMOUNT = (wethAmounAddedToLiquidity * 5n) / 100n;
export const TOKEN_SWAP_AMOUNT = (token0AmountAddedToLiquidity * 10n) / 100n;
export const SLIPPAGE = 10; // SLIPPAGE = 1 <=> 1%

beforeEach(async function () {

    [deployer, recolter, swapper, frontrunner] = await ethers.getSigners();
    await resetEthBalances([deployer.address, recolter.address, swapper.address], wethAmounAddedToLiquidity * 10n);

    const ERC20 = await ethers.getContractFactory("ERC20");
    token0 = await ERC20.deploy(token0AmountAddedToLiquidity * 1000n);
    const WETH = await ethers.getContractFactory("WETH9");
    weth = await WETH.deploy();

    const Factory = await ethers.getContractFactory("UniswapV2Factory");
    factory = await Factory.deploy(recolter.address);

    const Router = await ethers.getContractFactory("UniswapV2Router02");
    router = await Router.deploy(factory.address, weth.address, { gasLimit: BigNumber.from("8000000") });

    await factory.createPair(weth.address, token0.address);
    const poolAddress = await factory.getPair(token0.address, weth.address);

    await token0.approve(router.address, 2n** 255n);
    await weth.approve(router.address, 2n** 255n);

    const UniswapV2Pair = await ethers.getContractFactory("UniswapV2Pair");
    /*  If you get `Error: Transaction reverted: function call to a non-contract account` at 
        UniswapV2Router02.getReserves (contracts/periphery/libraries/UniswapV2Library.sol:31)
        Then print ethers.utils.keccak256(UniswapV2Pair.bytecode) and replace the hex in UniswapV2Library::pairFor
    */ 
    // console.log(ethers.utils.keccak256(UniswapV2Pair.bytecode));
    uniPair = new ethers.Contract(poolAddress, UniswapV2Pair.interface, deployer);

    const deadline = await getDeadline(deployer.provider!);

    await uniPair.approve(router.address, 2n** 255n);

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