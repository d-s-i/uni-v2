import assert from "assert";
import { assertAddressExist } from "./assertions.test";

import { token0, weth, factory, router, uniPair, token0AmountAddedToLiquidity, wethAmounAddedToLiquidity } from "./index.test";

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