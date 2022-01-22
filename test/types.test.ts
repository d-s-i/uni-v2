import { BigNumber } from "ethers";

export interface UserPosition {
    amountIn: BigNumber,
    amountOut: BigNumber,
    path: [string, string] 
}