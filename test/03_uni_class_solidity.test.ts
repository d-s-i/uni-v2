
import { parseEther, formatEther } from "ethers/lib/utils";
import assert from "assert";
import { BigNumber } from "ethers";

import {
    assertStrictEqualityToTheNearestHundredth,
    assertSameStateAfterSwapBetweenClassAndContract,
    assertClassAndContractReservesAreStrictEqual
} from "./assertions.test";
import {
    getSortedContractReserves,
} from "./helpers/helpers.test";
import {
    swapTokensForExactETHFromContract,
    swapETHForExactTokensFromContract,
    swapExactETHForTokensFromContract,
    swapExactTokensForETHFromContract,
    swapExactTokensForETHLoopFromClass,
    swapExactETHForTokensLoopFromClass,
    SwapETHForExactTokensLoopFromClass,
    swapTokensForExactETHLoopFromClass,
    swapExactTokensForETHLoopFromContract,
    swapExactETHForTokensLoopFromContract,
    swapETHForExactTokensLoopFromContract,
    swapTokensForExactETHLoopFromContract
} from "./helpers/swap_helpers.test";

import {
    ETH_SWAP_AMOUNT,
    TOKEN_SWAP_AMOUNT,
    weth,
    token0,
    swapper,
    uniPair,
    uniPairClass,
    router,
} from "./index.test";
import { ONE_ETHER } from "../src/constants";

describe("Values From Contract Equals Values From Class", function () {

    describe("SwapExactETHForTokens Function", function () {

        it("Swap Same Amounts with SwapExactETHForTokens From Contract And Class", async function () {

            await swapExactETHForTokensFromContract(ETH_SWAP_AMOUNT, swapper);

            const reservesAfterContractSwap = await uniPair.getReserves();
            const contractSwappedAmount = await token0.balanceOf(swapper.address);

            const classSwappedAmount = uniPairClass.simulateSwapExactETHForTokens(
                ETH_SWAP_AMOUNT,
                1n,
                [weth.address, token0.address]
            );

            assert.ok(contractSwappedAmount.toBigInt() === classSwappedAmount[1]);
            assertClassAndContractReservesAreStrictEqual(uniPairClass, reservesAfterContractSwap);
        });

        it("Swap Same Amount After Multiple Swap With swapExactEthForTokens", async function () {

            const initialBalance = await token0.balanceOf(swapper.address);

            const totalSwapFees = await swapExactETHForTokensLoopFromContract(3, { signer: swapper, swapAmount: ETH_SWAP_AMOUNT });
            const finalBalance = await token0.balanceOf(swapper.address);
            const reserves = await uniPair.getReserves();
            const totalContractSwap = finalBalance.sub(initialBalance).add(totalSwapFees);

            const totalClassSwap = swapExactETHForTokensLoopFromClass(3, ETH_SWAP_AMOUNT);

            assert.ok(uniPairClass.reserves[0] === reserves[0].toBigInt());
            assert.ok(uniPairClass.reserves[1] === reserves[1].toBigInt());
            assertStrictEqualityToTheNearestHundredth(
                totalClassSwap,
                totalContractSwap.toBigInt()
            );
        });
    });

    describe("SwapETHForExactTokens Function", function () {

        it("Swap Same Amount With SwapETHForExactTokens From Contract And Class", async function () {
            const initBalance = await token0.balanceOf(swapper.address);

            const path = [weth.address, token0.address];
            const amountIn = await router.getAmountsIn(
                TOKEN_SWAP_AMOUNT,
                path
            );

            await swapETHForExactTokensFromContract(TOKEN_SWAP_AMOUNT, amountIn[0], swapper);

            const [, swappedTokenAmount] = uniPairClass.simulateSwapETHForExactTokens(
                TOKEN_SWAP_AMOUNT,
                path
            );

            const finBalance = await token0.balanceOf(swapper.address);
            const reserves = await uniPair.getReserves();

            assert.ok(uniPairClass.reserves[0] === reserves[0].toBigInt());
            assert.ok(uniPairClass.reserves[1] === reserves[1].toBigInt());
            assert.ok(swappedTokenAmount === finBalance.sub(initBalance).toBigInt());
        });

        it("Swap Same Amount After Multiple Swap With swapETHForExactTokens", async function () {

            const initialBalance = await token0.balanceOf(swapper.address);
            const totalSwapFees = await swapETHForExactTokensLoopFromContract(3, { swapAmount: TOKEN_SWAP_AMOUNT, signer: swapper });
            const finalBalance = await token0.balanceOf(swapper.address);

            const totalClassSwap = SwapETHForExactTokensLoopFromClass(3, TOKEN_SWAP_AMOUNT);
            const totalContractSwap = finalBalance.sub(initialBalance).add(totalSwapFees);

            const reservesAfterContractSwap = await uniPair.getReserves();

            assertStrictEqualityToTheNearestHundredth(totalContractSwap.toBigInt(), totalClassSwap);
            await assertClassAndContractReservesAreStrictEqual(
                uniPairClass,
                reservesAfterContractSwap,
            );
        });

    });

    describe("SwapTokensForExactETH Function", function () {

        it("Swap Same Amount With swapTokensForExactETH From Contract And Class", async function () {
            const amountOut = 1n;

            const initialBalance = await swapper.getBalance();
            const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);

            const swappedAmount = uniPairClass.simulateSwapTokensForExactETH(
                amountOut,
                [token0.address, weth.address]
            );

            await assertSameStateAfterSwapBetweenClassAndContract(
                uniPairClass,
                swappedAmount[1],
                { signer: swapper, initialBalance: initialBalance.toBigInt(), fees_spent: fees_spent }
            );
        });

        it("Swap Same Amount After Multiple Swap With SwapTokensForExactETH", async function () {
            const initialBalance = await swapper.getBalance();

            const totalSwapFees = await swapTokensForExactETHLoopFromContract(3, { signer: swapper, swapAmount: ETH_SWAP_AMOUNT });
            const finalBalance = await swapper.getBalance();
            const reservesAfterContractSwap = await uniPair.getReserves();
            const totalContractSwap = finalBalance.sub(initialBalance).add(totalSwapFees);

            const totalClassSwap = swapTokensForExactETHLoopFromClass(3, ETH_SWAP_AMOUNT);

            assert.ok(totalContractSwap.eq(totalClassSwap));
            assertClassAndContractReservesAreStrictEqual(uniPairClass, reservesAfterContractSwap);
        });

    });

    describe("SwapExactTokensForETH Function", function () {

        it("Swap Same Amount With SwapExactTokensForETH From Contract And Class", async function () {

            const initialBalance = await swapper.getBalance();

            const totalGasSpent = await swapExactTokensForETHFromContract(swapper, TOKEN_SWAP_AMOUNT);
            const finalBalance = await swapper.getBalance();

            const reservesAfterContractSwap = await uniPair.getReserves();
            const swappedAmountFromContractWithoutGasfees = finalBalance.sub(initialBalance).add(totalGasSpent);

            const swappedAmounts = uniPairClass.simulateSwapExactTokensForEth(
                TOKEN_SWAP_AMOUNT,
                1n,
                [token0.address, weth.address]
            );

            assert.ok(swappedAmountFromContractWithoutGasfees.eq(swappedAmounts[1]));
            assertClassAndContractReservesAreStrictEqual(uniPairClass, reservesAfterContractSwap);

        });

        it("Swap Same Amount After Multiple Swap With swapExactTokensForEth", async function () {
            const initialBalance = await swapper.getBalance();

            const totalSwapFees = await swapExactTokensForETHLoopFromContract(3, { signer: swapper, swapAmount: TOKEN_SWAP_AMOUNT });
            const finalBalance = await swapper.getBalance();
            const reservesAfterContractSwap = await uniPair.getReserves();
            const totalContractSwap = finalBalance.sub(initialBalance).add(totalSwapFees);

            const totalClassSwap = swapExactTokensForETHLoopFromClass(3, TOKEN_SWAP_AMOUNT);

            assert.ok(totalContractSwap.eq(totalClassSwap));
            assertClassAndContractReservesAreStrictEqual(uniPairClass, reservesAfterContractSwap);
        });

    });

    describe("Getters Functions", function () {

        it("Quotes From Contract And Class Are Equals", async function () {

            const amountA = ONE_ETHER;
            const contractReserves = await uniPair.getReserves();
            const uniPairClassQuote = uniPairClass.quote(amountA, [uniPairClass.token0, uniPairClass.token1]);
            const uniPairQuote = await router.quote(amountA, contractReserves[0], contractReserves[1])

            assert.ok(uniPairClassQuote === uniPairQuote.toBigInt());

        });

        it("getAmountsIn From Contract And Class Are Equals", async function () {

            const path: [string, string] = [weth.address, token0.address];
            const sortedContractReserves = await getSortedContractReserves(path);

            const amountInClass = uniPairClass.getAmountsIn(TOKEN_SWAP_AMOUNT, path);
            const amountInContract = await router.getAmountIn(TOKEN_SWAP_AMOUNT, sortedContractReserves[0], sortedContractReserves[1]);

            assert.ok(amountInClass[0] === amountInContract.toBigInt());

        });

        it("getAmountsOut From Contract And Class Are Equals", async function () {

            const amountIn = ONE_ETHER;
            const path: [string, string] = [weth.address, token0.address];
            const amountOutClass = uniPairClass.getAmountsOut(amountIn, path);

            const sortedContractReserves = await getSortedContractReserves(path);
            const amountOutContract = await router.getAmountOut(
                amountIn,
                sortedContractReserves[0],
                sortedContractReserves[1]
            );

            assert.ok(amountOutClass[1] === amountOutContract.toBigInt());

        });

    });

});