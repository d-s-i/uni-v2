import assert from "assert";
import { BigNumber } from "ethers";
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