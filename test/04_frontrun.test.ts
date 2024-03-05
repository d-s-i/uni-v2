import { ethers } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import assert from "assert";

import { assertPoint15PercentPrecision } from "./assertions.test";
import {
    deployNewPairClass,
    getDeadline,
    getPriceFromContract,
    getUserPositionETHForExactTokens,
    getUserPositionExactETHForTokens
} from "./helpers/helpers.test";

import {
    frontrunETHForExactTokens,
    frontrunExactETHForTokens,
    backrun,
    getAmountsRespectingUnexpectedSlippageETHForExactTokens,
    getAmountsRespectingUnexpectedSlippageExactETHForTokens,
    getAmountsRespectingFullSlippageExactETHForTokens,
    getAmountsRespectingFullSlippageETHForExactTokens,
    getTotalSlippageExactETHForTokens,
    getTotalSlippageETHForExactTokens,
    estimateFrontrunGas,
    estimateBackrunGas,
    simulateSandwichETHForExactTokens,
    simulateSandwichExactETHForTokens,
    calcSandwichProfitsETHForExactTokens,
    calcSandwichProfitsExactETHForTokens
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
import { ONE_ETHER } from "../src/constants";

const amountIn = wethAmounAddedToLiquidity / 100n;
const amountOut = token0AmountAddedToLiquidity / 100n;

describe("Frontrun", function () {

    describe("User using swapExactETHForTokens Function", async function () {

        describe("General Slippage functions", async function () {

            it("Estimates Expected Slippage Correctly Using swapExactETHForTokens", async function () {
                const path: [string, string] = [weth.address, token0.address];
                const price = await getPriceFromContract(path);

                const [, amountOut] = uniPairClass.getAmountsOut(amountIn, path);
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

                const createdSlippage = price.toBigInt() * ONE_ETHER / finalPrice.toBigInt();

                assert.ok(swapSlippage === createdSlippage);

            });
        });

        it("Calculate The Exact Unexpected Slippage For `swapExactETHForTokens` With Binary Search", async function () {
            const path: [string, string] = [weth.address, token0.address];

            const userPosition = await getUserPositionExactETHForTokens(amountIn, SLIPPAGE);

            const [frontrunAmountIn, frontrunAmountOut] = await getAmountsRespectingUnexpectedSlippageExactETHForTokens(
                userPosition
            );

            const targetPrice = userPosition.amountOutMin * ONE_ETHER / (userPosition.amountIn);

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

            const precision = finalPrice.toBigInt() * ONE_ETHER / (targetPrice);

            assert.ok(
                precision > (parseEther("0.99999").toBigInt()) &&
                precision < (parseEther("1.00001").toBigInt())
            );
        });

        it("Allow Frontrun + User Swap Considering User's Slippage using `swapExactETHForExactTokens`", async function () {
            const path: [string, string] = [weth.address, token0.address];

            const userPosition = await getUserPositionExactETHForTokens(amountIn, SLIPPAGE);

            const targetPrice = userPosition.amountOutMin * ONE_ETHER / (userPosition.amountIn);

            await frontrunExactETHForTokens(userPosition, frontrunner);

            const deadline = await getDeadline(deployer.provider!);
            const tempRouter = router.connect(swapper);
            await tempRouter.swapETHForExactTokens(
                userPosition.amountOutMin,
                userPosition.path,
                frontrunner.address,
                deadline,
                { value: userPosition.amountIn }
            );

            const finalPrice = await getPriceFromContract(path);

            const precision = finalPrice.toBigInt() * ONE_ETHER / (targetPrice);

            assert.ok(
                precision > (parseEther("0.9954").toBigInt()) &&
                precision < (parseEther("1.0055").toBigInt())
            );
        });

        it("Make A Profitable Frontrun with user using `swapExactETHForTokens`", async function () {
            const initialFrontrunnerBalances = await frontrunner.getBalance();

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

        it("Tell Profitability Of A Frontrun When User Use swapExactETHForTokens", async function () {
            const userPosition = await getUserPositionExactETHForTokens(amountIn, SLIPPAGE);

            const expectedProfits = await calcSandwichProfitsExactETHForTokens(userPosition);

            const initialFrontrunnerBalances = await frontrunner.getBalance();
            await simulateSandwichExactETHForTokens(userPosition, { user: swapper, frontrunner: frontrunner });
            const finalFrontrunnerBalances = await frontrunner.getBalance();

            const realProfits = finalFrontrunnerBalances.sub(initialFrontrunnerBalances).toBigInt();

            const precision = (realProfits * ONE_ETHER) / expectedProfits;

            assertPoint15PercentPrecision(precision);
        });
    });

    describe("User using swapETHForExactTokens Function", async function () {

        describe("General Slippage functions", async function () {

            it("Estimates Expected Slippage Correctly Using swapETHForExactTokens", async function () {
                const path: [string, string] = [weth.address, token0.address];
                const price = await getPriceFromContract(path);

                const [, amountOut] = uniPairClass.getAmountsOut(amountIn, path);
                const swapSlippage = uniPairClass.getExpectedSlippageETHForExactTokens(amountOut, path);

                const deadline = await getDeadline(deployer.provider!);

                await router.swapETHForExactTokens(
                    amountOut,
                    path,
                    frontrunner.address,
                    deadline,
                    { value: amountIn }
                );

                const finalPrice = await getPriceFromContract(path);

                const createdSlippage = (price.toBigInt() * ONE_ETHER) / finalPrice.toBigInt();

                assert.ok(swapSlippage === createdSlippage);

            });
        });

        it("Calculate The Exact Unexpected Slippage For `swapETHForExactTokens` With Binary Search", async function () {
            const path: [string, string] = [weth.address, token0.address];

            const userPosition = await getUserPositionETHForExactTokens(amountIn, SLIPPAGE);

            const targetPrice = userPosition.amountOut * ONE_ETHER / (userPosition.amountInMax);

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

            const precision = finalPrice.toBigInt() * ONE_ETHER / targetPrice;

            assert.ok(
                precision > parseEther("0.99999").toBigInt() &&
                precision < parseEther("1.00001").toBigInt()
            );
        });

        it("Allow Frontrun + User Swap Considering User's Slippage using `swapETHForExactTokens`", async function () {
            const path: [string, string] = [weth.address, token0.address];

            const userPosition = await getUserPositionETHForExactTokens(amountOut, SLIPPAGE);

            const targetPrice = userPosition.amountOut * ONE_ETHER / (userPosition.amountInMax);

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

            const precision = finalPrice.toBigInt() * ONE_ETHER / (targetPrice);

            assert.ok(
                precision > parseEther("0.9954").toBigInt() &&
                precision < parseEther("1.0055").toBigInt()
            );
        });

        it("Make A Profitable Frontrun with user using `swapETHforExactTokens`", async function () {
            const initialFrontrunnerBalances = await frontrunner.getBalance();

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

        it("Tell Profitability Of A Frontrun When User Use swapETHForExactTokens", async function () {
            const userPosition = await getUserPositionETHForExactTokens(amountOut, SLIPPAGE);

            const expectedProfits = await calcSandwichProfitsETHForExactTokens(userPosition);

            const initialFrontrunnerBalances = await frontrunner.getBalance();
            await simulateSandwichETHForExactTokens(userPosition, { user: swapper, frontrunner: frontrunner });
            const finalFrontrunnerBalances = await frontrunner.getBalance();

            const realProfits = BigInt(finalFrontrunnerBalances.sub(initialFrontrunnerBalances).toHexString());

            const precision = realProfits * ONE_ETHER / (expectedProfits);

            assertPoint15PercentPrecision(precision);
        });
    });

    describe("Gas Calculation", function () {
        it("Calculate Gas Efficiently For A Whole Frontrun", async function () {

            const feeData = await deployer.provider!.getFeeData();
            const userPosition = await getUserPositionETHForExactTokens(amountOut, SLIPPAGE);

            const buyGasEstimation = await estimateFrontrunGas(userPosition, frontrunner);
            const frontrun_fee = await frontrunETHForExactTokens(userPosition, frontrunner);

            const sellGasEstimation = await estimateBackrunGas(frontrunner);
            const approveGasEstimation = await token0.estimateGas.approve(router.address, ethers.constants.MaxUint256);
            const backrun_fee = await backrun(frontrunner);

            const amountGasPaid = frontrun_fee + backrun_fee;
            const finalGasEstimation = (buyGasEstimation.add(approveGasEstimation).add(sellGasEstimation)).mul(feeData.gasPrice!);

            // console.log("gasEstimation: ", finalGasEstimation);
            // console.log("amountGasPaid: ", amountGasPaid);
        });

        it("One Buy Swap GasLimit * 2 === Buy + Sell GasLimit", async function () {
            const userPosition = await getUserPositionETHForExactTokens(amountOut, SLIPPAGE);

            const buyGasEstimation = await estimateFrontrunGas(userPosition, frontrunner);
            await frontrunETHForExactTokens(userPosition, frontrunner);

            const sellGasEstimation = await estimateBackrunGas(frontrunner);
            const approveGasEstimation = await token0.estimateGas.approve(router.address, ethers.constants.MaxUint256);
            await backrun(frontrunner);

            const finalGasEstimation = buyGasEstimation.add(approveGasEstimation).add(sellGasEstimation);
            // console.log("gasEstimation: ", formatEther(finalGasEstimation));
            // console.log("One Gas Estimation * 2", formatEther(buyGasEstimation.mul(2)));
        });
    });
});