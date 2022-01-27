import assert from "assert";
import { BigNumber } from "ethers";

import { 
  getClassTokenReserve,
  getSortedContractReserves,
} from "./helpers/helpers.test";

import { 
    uniPair, 
    uniPairClass, 
    ETH_SWAP_AMOUNT, 
    TOKEN_SWAP_AMOUNT, 
    weth, 
    token0 
} from "./index.test";

describe("UniswapV2PairClass", function() {

  describe("SwapETHForExactTokens Function", function() {

    it("SwapETHForExactTokens From Class", async function() {

      const path: [string, string] = [weth.address, token0.address];
  
      const initialTokenReserve = getClassTokenReserve(path, path[1]);
      uniPairClass.simulateSwapETHForExactTokens(
        TOKEN_SWAP_AMOUNT,
        path
      );
  
      const finalTokenReserve = getClassTokenReserve(path, path[1]);
  
      assert.ok(finalTokenReserve.lt(initialTokenReserve));
    });

  });

  describe("SwapExactETHForTokens Function", function() {
    
    it("SwapExactETHForTokens From Class", async function() {
      const reserves = await uniPair.getReserves();
  
      const contractToken0Reserves = reserves[0];
      const contractToken1Rerserves = reserves[1];
  
      uniPairClass.simulateSwapExactETHForTokens(
        ETH_SWAP_AMOUNT, 
        BigNumber.from(1), 
        [weth.address, token0.address]
      );
  
      assert.ok(uniPairClass.token0Reserves.gt(contractToken0Reserves));
      assert.ok(uniPairClass.token1Reserves.lt(contractToken1Rerserves));
    });
    
  });

  describe("SwapExactTokensForETH Function", function() {

    it("SwapExactTokensForETH From Class", async function() {
      
      const path: [string, string] = [token0.address, weth.address];
      const initialContractReserves = await getSortedContractReserves(path);
  
      uniPairClass.simulateSwapExactTokensForEth(
        TOKEN_SWAP_AMOUNT, 
        BigNumber.from(1), 
        path
      );
  
      const classReserves = uniPairClass.getSortedReserves(path);
  
      assert.ok(classReserves[0].gt(initialContractReserves[0]));
      assert.ok(classReserves[1].lt(initialContractReserves[1]));
    });
    
  });

  describe("SwapTokensForExactETH Function", function() {

    it("swapTokensForExactETH From Class", async function() {

      const path: [string, string] = [token0.address, weth.address];

      const initialTokenReserve = getClassTokenReserve(path, path[0]);
      const amountOut = BigNumber.from(1);
      uniPairClass.simulateSwapTokensForExactETH(
        amountOut,
        path
      );

      const finalTokenReserve = getClassTokenReserve(path, path[0]);

      assert.ok(finalTokenReserve.gt(initialTokenReserve));
    });

  });

});