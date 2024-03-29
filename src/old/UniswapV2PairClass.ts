// import { BigNumber } from "ethers";
// import { parseEther } from "ethers/lib/utils";

// type TokenIdentifier = string | number;

// export class UniswapV2PairClass<T extends TokenIdentifier> {
//     private _token0Reserves: BigNumber;
//     private _token1Reserves: BigNumber;
//     private _token0: T;
//     private _token1: T;
//     private readonly _wethAddress: T;

//     constructor(
//         pairArray: [token0Address: T, token1Address: T],
//         wethAddress: T,
//         reserve0: BigNumber, 
//         reserve1: BigNumber, 
//     ) {
//         const pair = UniswapV2PairClass.sortTokens(pairArray[0], pairArray[1]);

//         this._token0 = pair[0];
//         this._token1 = pair[1];
//         this._token1Reserves = reserve1;
//         this._token0Reserves = reserve0;

//         this._wethAddress = wethAddress;
//     }

//     quote(amountA: BigNumber, path: T[]) {
//         this._checkLiquidity("quote");
//         const [reserveIn, reserveOut] = this.getSortedReserves(path);
//         return amountA.mul(reserveOut).div(reserveIn);
//     }

//     static sortTokens<T extends TokenIdentifier>(tokenA: T, tokenB: T) {
//         const tokenANum = BigInt(tokenA);
//         const tokenBNum = BigInt(tokenB);

//         return tokenANum < tokenBNum ? [tokenA, tokenB] : [tokenB, tokenA];
//     }

//     getSortedReserves(path: T[]) {
//         const [_token0] = UniswapV2PairClass.sortTokens(path[0], path[1]);
//         return path[0] === _token0 ? [this._token0Reserves, this._token1Reserves] : [this._token1Reserves, this._token0Reserves];
//     }

//     getAmountsOut(amountIn: BigNumber, path: T[]) {
//         this._checkPathLengthIsAtLeast2(path, "getAmountsOut");
//         let amounts: BigNumber[] = [];
//         amounts[0] = amountIn;
//         const [reserveIn, reserveOut] = this.getSortedReserves(path);
//         amounts[1] = this._getAmountOut(amountIn, reserveIn, reserveOut);

//         return amounts;
//     }

//     getAmountsIn(
//         amountOut: BigNumber,
//         path: T[]
//     ) {
//         this._checkPathLengthIsAtLeast2(path, "getAmountsIn");
//         let amounts: BigNumber[] = [];
//         amounts[1] = amountOut;
//         const [reserveIn, reserveOut] = this.getSortedReserves(path);
//         amounts[0] = this._getAmountIn(amounts[1], reserveIn, reserveOut);

//         return amounts;
//     }

//     getSlippageCreatedFromAmountIn(amountIn: BigNumber, path: T[]) {

//         const sortedReserves = this.getSortedReserves(path);
//         const initialPrice = sortedReserves[1].mul(parseEther("1")).div(sortedReserves[0]);
//         const [,amountOut] = this.getAmountsOut(amountIn, path);
//         const finalPrice = amountOut.mul(parseEther("1")).div(amountIn);

//         return initialPrice.mul(parseEther("1")).div(finalPrice);
//     }

//     getExpectedSlippageExactETHForTokens(
//         amountIn: BigNumber,
//         amountOutMin: BigNumber,
//         path: [T, T]
//     ) {
//         this._checkEntryIsWeth(path);
//         const tempUniPairClass = new UniswapV2PairClass(
//             path,
//             path[0],
//             this.token0Reserves,
//             this.token1Reserves,
//         );

//         const initialSortedReserves = tempUniPairClass.getSortedReserves(path);
//         const initialPrice = initialSortedReserves[1].mul(parseEther("1")).div(initialSortedReserves[0]);
//         tempUniPairClass.simulateSwapExactETHForTokens(
//             amountIn,
//             amountOutMin,
//             path
//         );
//         const finalSortedReserves = tempUniPairClass.getSortedReserves(path);
//         const finalPrice = finalSortedReserves[1].mul(parseEther("1")).div(finalSortedReserves[0]);

//         const createdSlippage = initialPrice.mul(parseEther("1")).div(finalPrice);
//         return createdSlippage;
//     }

//     getExpectedSlippageETHForExactTokens(
//         amountOut: BigNumber,
//         path: [T, T]
//     ) {
//         this._checkEntryIsWeth(path);
//         const tempUniPairClass = new UniswapV2PairClass(
//             path,
//             path[0],
//             this.token0Reserves,
//             this.token1Reserves,
//         );

//         const initialSortedReserves = tempUniPairClass.getSortedReserves(path);
//         const initialPrice = initialSortedReserves[1].mul(parseEther("1")).div(initialSortedReserves[0]);
//         tempUniPairClass.simulateSwapETHForExactTokens(
//             amountOut,
//             path
//         );
//         const finalSortedReserves = tempUniPairClass.getSortedReserves(path);
//         const finalPrice = finalSortedReserves[1].mul(parseEther("1")).div(finalSortedReserves[0]);

//         const createdSlippage = initialPrice.mul(parseEther("1")).div(finalPrice);
//         return createdSlippage;
//     }

//     getUnexpectedSlippage(amountIn: BigNumber, amountOut: BigNumber, path: T[]) {
//         const sortedReserves = this.getSortedReserves(path);
//         const initialPrice = sortedReserves[1].mul(parseEther("1")).div(sortedReserves[0]);
//         const finalPrice = amountOut.mul(parseEther("1")).div(amountIn);
//         return initialPrice.mul(parseEther("1")).div(finalPrice);
//     }

//     simulateSwapExactETHForTokens(
//         amountIn: BigNumber,
//         amountOutMin: BigNumber,
//         path: T[]
//     ) {
//         this._checkEntryIsWeth(path);
//         const amounts = this.getAmountsOut(amountIn, path);

//         if(amounts[amounts.length - 1].lt(amountOutMin)) {
//             throw new Error("UniswapV2PairClass::simulateSwapExactETHForTokens - AmountOut too low");
//         }
//         this._depositWethIntoReserves(amountIn);
//         this.swap(amounts, path);
//         return amounts;
//     }

//     simulateSwapETHForExactTokens(
//         amountOut: BigNumber,
//         path: T[]
//     ) {
//         this._checkEntryIsWeth(path);
//         const amounts = this.getAmountsIn(amountOut, path);
//         this._depositWethIntoReserves(amounts[0]);
//         this.swap(amounts, path);
//         return amounts;
//     }

//     simulateSwapExactTokensForEth(
//         amountIn: BigNumber,
//         amountOutMin: BigNumber,
//         path: T[]
//     ) {
//         if(path[path.length - 1] !== this.wethAddress) {
//             throw new Error("UniswapV2PairClass::simulateSwapExactTokensForEth - Swapping Tokens For Eth But End Address Isn't Weth");
//         }
//         const amounts = this.getAmountsOut(amountIn, path);
    
//         if(amounts[amounts.length - 1].lt(amountOutMin)) {
//             throw new Error("UniswapV2PairClass::simulateSwapExactTokensForEth - amountOut lower than amountOutMin");
//         }
//         this._depositTokensIntoReserves(amountIn);
//         this.swap(amounts, path);
//         return amounts;
//     }

//     simulateSwapTokensForExactETH(
//         amountOut: BigNumber,
//         path: T[]
//     ) {
//         this._checkExitIsWeth(path);
//         const amounts = this.getAmountsIn(amountOut, path);
//         this._depositTokensIntoReserves(amounts[0]);
//         this.swap(amounts, path);
//         return amounts;
//     }

//     _getAmountOut(amountIn: BigNumber, reserveIn: BigNumber, reserveOut: BigNumber) {
//         this._checkAmountGreaterThanZero(amountIn, "_getAmountOut");
//         this._checkLiquidity("_getAmountOut");

//         const amountInWithFee = amountIn.mul(997);
//         const numerator = amountInWithFee.mul(reserveOut);
//         const denominator = reserveIn.mul(1000).add(amountInWithFee);
//         return numerator.div(denominator);
//     }

//     _getAmountIn(amountOut: BigNumber, reserveIn: BigNumber, reserveOut: BigNumber) {
//         this._checkAmountGreaterThanZero(amountOut, "_getAmountIn");
//         this._checkLiquidity("_getAmountIn");

//         const numerator = reserveIn.mul(amountOut).mul(1000);
//         const denominator = reserveOut.sub(amountOut).mul(997);
//         return (numerator.div(denominator)).add(1);
//     }

//     swap(amounts: BigNumber[], path: T[]) {
//         const [input, output] = path;
//         const [token0] = UniswapV2PairClass.sortTokens(input, output);

//         const amountOut = amounts[1];
//         const [amount0Out, amount1Out] = input === token0 ? [BigNumber.from(0), amountOut] : [amountOut, BigNumber.from(0)];
        
//         return this._swap(amount0Out, amount1Out);
//     }

//     _swap(_amount0Out: BigNumber, _amount1Out: BigNumber) {

//         if(!_amount0Out.gt(0) && !_amount1Out.gt(0)) {
//             throw new Error("UniswapV2PairClass::_swap - Insufficient output amount");
//         }
//         if(_amount0Out.gt(this._token0Reserves) || _amount1Out.gt(this._token1Reserves)) {
//             throw new Error("UniswapV2PairClass::_swap - Insufficient liquidity");
//         }
        
//         if(_amount0Out.gt(0)) {
//             this._token0Reserves = this._token0Reserves.sub(_amount0Out);
//             return _amount0Out;
//         } else {
//             this._token1Reserves = this._token1Reserves.sub(_amount1Out);
//             return _amount1Out;
//         }

//     }

//     _depositWethIntoReserves(amountIn: BigNumber) {
//         if(this._token0 === this.wethAddress) {
//             this._token0Reserves = this._token0Reserves.add(amountIn);
//         } else {
//             this._token1Reserves = this._token1Reserves.add(amountIn);
//         }
//     }

//     _depositTokensIntoReserves(amountIn: BigNumber) {
//         if(this._token0 !== this.wethAddress) {
//             this._token0Reserves = this._token0Reserves.add(amountIn);
//         } else {
//             this._token1Reserves = this._token1Reserves.add(amountIn);
//         }
//     }

//     _checkEntryIsWeth(path: T[]) {
//         if(path[0] !== this.wethAddress) {
//             throw new Error(`UniswapV2PairClass::simulateSwapExactETHForTokens - path[0] Should Be Weth Address (value: ${path})`);
//         }
//     }

//     _checkExitIsWeth(path: T[]) {
//         if(path[path.length - 1] !== this.wethAddress) {
//             throw new Error(`UniswapV2PairClass::simulateSwapTokensForExactETH - path[1] Should Be Weth Address (value: ${path})`);
//         }
//     }

//     _checkAmountGreaterThanZero(amount: BigNumber, fnName: string) {
//         if(amount.lte(0)) {
//             throw new Error(`UniswapV2PairClass::${fnName} - amount Is Lower Than or Equal To 0 (value: ${amount})`);
//         }
//     }

//     _checkPathLengthIsAtLeast2(path: T[], fnName: string) {
//         if(path.length < 2) {
//             throw new Error(`UniswapV2PairClass::${fnName} - Invalid Path Length (value: ${path})`);
//         }
//     }

//     _checkLiquidity(fnName: string) {
//         if(this._token0Reserves.lte(0) || this._token1Reserves.lte(0)) {
//             throw new Error(`UniswapV2PairClass::${fnName} - Not Enough Liquidity (token0Reserves: ${this._token0Reserves}, token1Reserves: ${this._token1Reserves})`);
//         }
//     }

//     get token0Reserves() {
//         return this._token0Reserves;
//     }

//     get token1Reserves() {
//         return this._token1Reserves;
//     }

//     get reserves() {
//         return [this._token0Reserves, this._token1Reserves];
//     }

//     get wethAddress() {
//         return this._wethAddress;
//     }

//     get token0() {
//         return this._token0;
//     }

//     get token1() {
//         return this._token1;
//     }
// }