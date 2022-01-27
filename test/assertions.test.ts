import assert from "assert";
import { BigNumber } from "ethers";
import { UniswapV2PairClass } from "../src/UniswapV2PairClass";
import { uniPair, uniPairClass } from "./index.test";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

export const assertAddressExist = function(address: string) {
    assert.ok(
        typeof(address) !== "undefined" &&
        address.substring(0, 2) === "0x"
      );
}

export const assertStrictEqualityToTheNearestHundredth = function(num1: BigNumber, num2: BigNumber) {
  assert.ok(
    num1.lt(num2.add(num2.mul(1).div(100))) &&
    num1.gt(num2.sub(num2.mul(1).div(100)))
  );
  assert.ok(
    num2.lt(num1.add(num1.mul(1).div(100))) &&
    num2.gt(num1.sub(num1.mul(1).div(100)))
  );
}

export const assertSameStateAfterSwapBetweenClassAndContract = async function(
  uniPairClass: UniswapV2PairClass,
  classSwapAmount: BigNumber,
  contractSwapper: { signer: SignerWithAddress, initialBalance: BigNumber, fees_spent: BigNumber }
) {

  const finBalance = await contractSwapper.signer.getBalance();
  const contractReserves = await uniPair.getReserves();
  
  assert.ok(uniPairClass.reserves[0].eq(contractReserves[0]));
  assert.ok(uniPairClass.reserves[1].eq(contractReserves[1]));
  assert.ok(classSwapAmount.eq(finBalance.sub(contractSwapper.initialBalance).add(contractSwapper.fees_spent)));
}

export const assertClassAndContractReservesAreStrictEqual = function(
  uniPairClass: UniswapV2PairClass,
  reservesAfterContractSwap: [BigNumber, BigNumber]
) {
  assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.token1Reserves));
  assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.token0Reserves));
  assert.ok(reservesAfterContractSwap[0].eq(uniPairClass.reserves[0]));
  assert.ok(reservesAfterContractSwap[1].eq(uniPairClass.reserves[1]));
}

export const assertPoint15PercentPrecision = function(precision: BigNumber) {
  assert.ok(
    precision.gt(precision.mul(9995).div(10000)) &&
    precision.lt(precision.mul(10015).div(10000))
  ); 
} 