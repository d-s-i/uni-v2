export interface UserPositionExactETHForTokens {
    amountIn: bigint,
    amountOutMin: bigint,
    path: [string, string] 
}

export interface UserPositionETHForExactTokens {
    amountInMax: bigint,
    amountOut: bigint,
    path: [string, string] 
}