
import assert from "assert";
import { BigNumber } from "ethers";

import {
    swapTokensForExactETHFromContract,
    swapETHForExactTokensFromContract,
    swapExactETHForTokensFromContract,
    swapExactTokensForETHFromContract,
} from "./helpers/swap_helpers.test";

import {
    ETH_SWAP_AMOUNT,
    TOKEN_SWAP_AMOUNT,
    token0,
    swapper,
} from "./index.test";

describe("UniswapV2 Contracts", function () {

    describe("SwapETHForExactTokens Function", function () {

        it("SwapETHForExactTokens", async function () {
            const initBalance = await token0.balanceOf(swapper.address);

            await swapETHForExactTokensFromContract(1n, ETH_SWAP_AMOUNT, swapper)

            const finBalance = await token0.balanceOf(swapper.address);

            assert.ok(initBalance.lt(finBalance));
        });

    });

    describe("SwapExactETHForTokens Function", function () {

        it("SwapExactETHForTokens", async function () {
            await swapExactETHForTokensFromContract(ETH_SWAP_AMOUNT, swapper);

            const finalBalance = await token0.balanceOf(swapper.address);

            assert.ok(finalBalance.gt(0));
        });

    });
    describe("SwapTokensForExactETH Function", function () {
        it("SwapTokensForExactETH", async function () {
            const initBalance = await swapper.getBalance();

            const amountOut = 1n;

            const fees_spent = await swapTokensForExactETHFromContract(swapper, amountOut);

            const finBalance = await swapper.getBalance();

            assert.ok(finBalance.sub(initBalance).add(fees_spent).eq(amountOut));
        });

    });

    describe("SwapExactTokensForETH Function", function () {

        it("SwapExactTokensForETH", async function () {
            const initialBalance = await swapper.getBalance();

            await swapExactTokensForETHFromContract(swapper, TOKEN_SWAP_AMOUNT);

            const finalBalance = await swapper.getBalance();

            assert.ok(initialBalance.lt(finalBalance));
        });

    });

});