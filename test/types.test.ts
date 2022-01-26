import { BigNumber } from "ethers";

export interface UserPositionExactETHForTokens {
    amountIn: BigNumber,
    amountOutMin: BigNumber,
    path: [string, string] 
}

export interface UserPositionETHForExactTokens {
    amountInMax: BigNumber,
    amountOut: BigNumber,
    path: [string, string] 
}