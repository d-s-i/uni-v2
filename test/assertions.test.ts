import assert from "assert";
import { BigNumber } from "ethers";
import { formatEther } from "ethers/lib/utils";
import { UniswapV2PairClass } from "./UniV2PairClass.test";

export const assertAddressExist = function(address: string) {
    assert.ok(
        typeof(address) !== "undefined" &&
        address.substring(0, 2) === "0x"
      );
}

export const assertReservesAreEquals = function(
  contractReserves: [BigNumber, BigNumber],
  uniPairClass: UniswapV2PairClass
) {
  assert.ok(contractReserves[1].eq(uniPairClass.token1Reserves));
  assert.ok(contractReserves[0].eq(uniPairClass.token0Reserves));
  assert.ok(contractReserves[0].eq(uniPairClass.reserves[0]));
  assert.ok(contractReserves[1].eq(uniPairClass.reserves[1]));
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
  
  // assert.strictEqual(
  //   parseFloat(formatEther(totalClassSwap)).toFixed(2), 
  //   parseFloat(formatEther(totalContractSwap)).toFixed(2)
  // );
}