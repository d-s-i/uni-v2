import { ONE_ETHER } from "./constants";

type TokenIdentifier = string | number;

export class UniswapV2PairClass<T extends TokenIdentifier> {
    private _token0Reserves: bigint;
    private _token1Reserves: bigint;
    private _token0: T;
    private _token1: T;
    private readonly _wethAddress: T;

    constructor(
        pairArray: [token0Address: T, token1Address: T],
        wethAddress: T,
        [reserve0, reserve1]: [bigint, bigint],
    ) {
        const pair = UniswapV2PairClass.sortTokens(pairArray[0], pairArray[1]);

        this._token0 = pair[0];
        this._token1 = pair[1];
        this._token1Reserves = reserve1;
        this._token0Reserves = reserve0;

        this._wethAddress = wethAddress;
    }

    quote(amountA: bigint, path: T[]) {
        this._checkLiquidity("quote");
        const [reserveIn, reserveOut] = this.getSortedReserves(path);
        return (amountA * reserveOut) / reserveIn;
    }

    static sortTokens<T extends TokenIdentifier>(tokenA: T, tokenB: T) {
        const tokenANum = BigInt(tokenA);
        const tokenBNum = BigInt(tokenB);

        return tokenANum < tokenBNum ? [tokenA, tokenB] : [tokenB, tokenA];
    }

    getSortedReserves(path: T[]) {
        const [_token0] = UniswapV2PairClass.sortTokens(path[0], path[1]);
        return path[0] === _token0 ? [this._token0Reserves, this._token1Reserves] : [this._token1Reserves, this._token0Reserves];
    }

    getAmountsOut(amountIn: bigint, path: T[]) {
        this._checkPathLengthIsAtLeast2(path, "getAmountsOut");
        let amounts: bigint[] = [];
        amounts[0] = amountIn;
        const [reserveIn, reserveOut] = this.getSortedReserves(path);
        amounts[1] = this._getAmountOut(amountIn, reserveIn, reserveOut);

        return amounts;
    }

    getAmountsIn(
        amountOut: bigint,
        path: T[]
    ) {
        this._checkPathLengthIsAtLeast2(path, "getAmountsIn");
        let amounts: bigint[] = [];
        amounts[1] = amountOut;
        const [reserveIn, reserveOut] = this.getSortedReserves(path);
        amounts[0] = this._getAmountIn(amounts[1], reserveIn, reserveOut);

        return amounts;
    }

    getSlippageCreatedFromAmountIn(amountIn: bigint, path: T[]) {

        const sortedReserves = this.getSortedReserves(path);
        const initialPrice = (sortedReserves[1] * ONE_ETHER) / sortedReserves[0];
        const [,amountOut] = this.getAmountsOut(amountIn, path);
        const finalPrice = (amountOut * ONE_ETHER) / amountIn;

        return (initialPrice * ONE_ETHER) / finalPrice;
    }

    getExpectedSlippageExactETHForTokens(
        amountIn: bigint,
        amountOutMin: bigint,
        path: [T, T]
    ) {
        this._checkEntryIsWeth(path);
        const tempUniPairClass = new UniswapV2PairClass(
            path,
            path[0],
            [this.token0Reserves, this.token1Reserves]
        );

        const initialSortedReserves = tempUniPairClass.getSortedReserves(path);
        const initialPrice = (initialSortedReserves[1] * ONE_ETHER) / initialSortedReserves[0];
        tempUniPairClass.simulateSwapExactETHForTokens(
            amountIn,
            amountOutMin,
            path
        );
        const finalSortedReserves = tempUniPairClass.getSortedReserves(path);
        const finalPrice = (finalSortedReserves[1] * ONE_ETHER) / finalSortedReserves[0];

        const createdSlippage = (initialPrice * ONE_ETHER) / finalPrice;
        return createdSlippage;
    }

    getExpectedSlippageETHForExactTokens(
        amountOut: bigint,
        path: [T, T]
    ) {
        this._checkEntryIsWeth(path);
        const tempUniPairClass = new UniswapV2PairClass(
            path,
            path[0],
            [this.token0Reserves, this.token1Reserves],
        );

        const initialSortedReserves = tempUniPairClass.getSortedReserves(path);
        const initialPrice = (initialSortedReserves[1] * ONE_ETHER) / initialSortedReserves[0];
        tempUniPairClass.simulateSwapETHForExactTokens(
            amountOut,
            path
        );
        const finalSortedReserves = tempUniPairClass.getSortedReserves(path);
        const finalPrice = (finalSortedReserves[1] * ONE_ETHER) / finalSortedReserves[0];

        const createdSlippage = (initialPrice * ONE_ETHER) / finalPrice;
        return createdSlippage;
    }

    getUnexpectedSlippage(amountIn: bigint, amountOut: bigint, path: T[]) {
        const sortedReserves = this.getSortedReserves(path);
        const initialPrice = (sortedReserves[1] * ONE_ETHER) / sortedReserves[0];
        const finalPrice = (amountOut * ONE_ETHER) / amountIn;
        return (initialPrice * ONE_ETHER) / finalPrice;
    }

    simulateSwapExactETHForTokens(
        amountIn: bigint,
        amountOutMin: bigint,
        path: T[]
    ) {
        this._checkEntryIsWeth(path);
        const amounts = this.getAmountsOut(amountIn, path);

        if(amounts[amounts.length - 1] < amountOutMin) {
            throw new Error("UniswapV2PairClass::simulateSwapExactETHForTokens - AmountOut too low");
        }
        this._depositWethIntoReserves(amountIn);
        this.swap(amounts, path);
        return amounts;
    }

    simulateSwapETHForExactTokens(
        amountOut: bigint,
        path: T[]
    ) {
        this._checkEntryIsWeth(path);
        const amounts = this.getAmountsIn(amountOut, path);
        this._depositWethIntoReserves(amounts[0]);
        this.swap(amounts, path);
        return amounts;
    }

    simulateSwapExactTokensForEth(
        amountIn: bigint,
        amountOutMin: bigint,
        path: T[]
    ) {
        if(path[path.length - 1] !== this.wethAddress) {
            throw new Error("UniswapV2PairClass::simulateSwapExactTokensForEth - Swapping Tokens For Eth But End Address Isn't Weth");
        }
        const amounts = this.getAmountsOut(amountIn, path);
    
        if(amounts[amounts.length - 1] < amountOutMin) {
            throw new Error("UniswapV2PairClass::simulateSwapExactTokensForEth - amountOut lower than amountOutMin");
        }
        this._depositTokensIntoReserves(amountIn);
        this.swap(amounts, path);
        return amounts;
    }

    simulateSwapTokensForExactETH(
        amountOut: bigint,
        path: T[]
    ) {
        this._checkExitIsWeth(path);
        const amounts = this.getAmountsIn(amountOut, path);
        this._depositTokensIntoReserves(amounts[0]);
        this.swap(amounts, path);
        return amounts;
    }

    _getAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint) {
        this._checkAmountGreaterThanZero(amountIn, "_getAmountOut");
        this._checkLiquidity("_getAmountOut");

        const amountInWithFee = amountIn * BigInt(997);
        const numerator = amountInWithFee * reserveOut;
        const denominator = (reserveIn * BigInt(1000)) + amountInWithFee;
        return numerator / denominator;
    }

    _getAmountIn(amountOut: bigint, reserveIn: bigint, reserveOut: bigint) {
        this._checkAmountGreaterThanZero(amountOut, "_getAmountIn");
        this._checkLiquidity("_getAmountIn");

        const numerator = (reserveIn * amountOut) * BigInt(1000);
        const denominator = (reserveOut - amountOut) * BigInt(997);
        return (numerator / (denominator)) + BigInt(1);
    }

    swap(amounts: bigint[], path: T[]) {
        const [input, output] = path;
        const [token0] = UniswapV2PairClass.sortTokens(input, output);

        const amountOut = amounts[1];
        const [amount0Out, amount1Out] = input === token0 ? [BigInt(0), amountOut] : [amountOut, BigInt(0)];
        
        return this._swap(amount0Out, amount1Out);
    }

    _swap(_amount0Out: bigint, _amount1Out: bigint) {

        if(!(_amount0Out > BigInt(0)) && !(_amount1Out > BigInt(0))) {
            throw new Error("UniswapV2PairClass::_swap - Insufficient output amount");
        }
        if(_amount0Out > this._token0Reserves || _amount1Out > BigInt(this._token1Reserves)) {
            throw new Error("UniswapV2PairClass::_swap - Insufficient liquidity");
        }
        
        if(_amount0Out > (0)) {
            this._token0Reserves = this._token0Reserves - _amount0Out;
            return _amount0Out;
        } else {
            this._token1Reserves = this._token1Reserves - _amount1Out;
            return _amount1Out;
        }

    }

    _depositWethIntoReserves(amountIn: bigint) {
        if(this._token0 === this.wethAddress) {
            this._token0Reserves = this._token0Reserves + amountIn;
        } else {
            this._token1Reserves = this._token1Reserves + amountIn;
        }
    }

    _depositTokensIntoReserves(amountIn: bigint) {
        if(this._token0 !== this.wethAddress) {
            this._token0Reserves = this._token0Reserves + amountIn;
        } else {
            this._token1Reserves = this._token1Reserves + amountIn;
        }
    }

    _checkEntryIsWeth(path: T[]) {
        if(path[0] !== this.wethAddress) {
            throw new Error(`UniswapV2PairClass::simulateSwapExactETHForTokens - path[0] Should Be Weth Address (value: ${path})`);
        }
    }

    _checkExitIsWeth(path: T[]) {
        if(path[path.length - 1] !== this.wethAddress) {
            throw new Error(`UniswapV2PairClass::simulateSwapTokensForExactETH - path[1] Should Be Weth Address (value: ${path})`);
        }
    }

    _checkAmountGreaterThanZero(amount: bigint, fnName: string) {
        if(amount <= BigInt(0)) {
            throw new Error(`UniswapV2PairClass::${fnName} - amount Is Lower Than or Equal To 0 (value: ${amount})`);
        }
    }

    _checkPathLengthIsAtLeast2(path: T[], fnName: string) {
        if(path.length < 2) {
            throw new Error(`UniswapV2PairClass::${fnName} - Invalid Path Length (value: ${path})`);
        }
    }

    _checkLiquidity(fnName: string) {
        if(this._token0Reserves <= BigInt(0) || this._token1Reserves <= BigInt(0)) {
            throw new Error(`UniswapV2PairClass::${fnName} - Not Enough Liquidity (token0Reserves: ${this._token0Reserves}, token1Reserves: ${this._token1Reserves})`);
        }
    }

    get token0Reserves() {
        return this._token0Reserves;
    }

    get token1Reserves() {
        return this._token1Reserves;
    }

    get reserves() {
        return [this._token0Reserves, this._token1Reserves];
    }

    get wethAddress() {
        return this._wethAddress;
    }

    get token0() {
        return this._token0;
    }

    get token1() {
        return this._token1;
    }
}