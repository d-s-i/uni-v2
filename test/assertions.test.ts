import assert from "assert";
import { UniswapV2PairClass } from "../src/UniswapV2PairClass";
import { uniPair, uniPairClass } from "./index.test";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { BigNumber } from "ethers";

export const assertAddressExist = function (address: string) {
    assert.ok(
        typeof (address) !== "undefined" &&
        address.substring(0, 2) === "0x"
    );
}

export const assertStrictEqualityToTheNearestHundredth = function (num1: bigint, num2: bigint) {
    assert.ok(
        num1 < (num2 + (num2 / 100n)) &&
        num1 > (num2 - (num2 / 100n))
    );
    assert.ok(
        num2 < (num1 + (num1 / 100n)) &&
        num2 > (num1 - (num1 / 100n))
    );
}

export const assertSameStateAfterSwapBetweenClassAndContract = async function <T extends string | number>(
    uniPairClass: UniswapV2PairClass<T>,
    classSwapAmount: bigint,
    contractSwapper: { signer: SignerWithAddress, initialBalance: bigint, fees_spent: bigint }
) {

    const finBalance = await contractSwapper.signer.getBalance();
    const contractReserves = await uniPair.getReserves();

    assert.ok(uniPairClass.reserves[0] === contractReserves[0].toBigInt());
    assert.ok(uniPairClass.reserves[1] === contractReserves[1].toBigInt());
    assert.ok(classSwapAmount === (finBalance.toBigInt() - contractSwapper.initialBalance + contractSwapper.fees_spent));
}

export const assertClassAndContractReservesAreStrictEqual = function <T extends string | number>(
    uniPairClass: UniswapV2PairClass<T>,
    reservesAfterContractSwap: [BigNumber, BigNumber]
) {
    const _reservesAfterContractSwap = [reservesAfterContractSwap[0].toBigInt(), reservesAfterContractSwap[1].toBigInt()];
    assert.ok(_reservesAfterContractSwap[1] === uniPairClass.token1Reserves);
    assert.ok(_reservesAfterContractSwap[0] === uniPairClass.token0Reserves);
    assert.ok(_reservesAfterContractSwap[0] === uniPairClass.reserves[0]);
    assert.ok(_reservesAfterContractSwap[1] === uniPairClass.reserves[1]);
}

export const assertPoint15PercentPrecision = function (precision: bigint) {
    assert.ok(
        precision > ((precision * 9995n) / 10000n) &&
        precision < ((precision * 10015n) / 10000n)
    );
} 