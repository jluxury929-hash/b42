/**
 * QUANTUM TITAN MULTI-CHAIN ENGINE - v57.1 (STABILIZED)
 * ----------------------------------------------------------------
 */

const { ethers, Wallet, JsonRpcProvider, Interface, Contract } = require("ethers");
require("dotenv").config();

// FIX: Safe require for colors to prevent MODULE_NOT_FOUND
let colors;
try {
    colors = require("colors");
    colors.enable();
} catch (e) {
    console.error("CRITICAL: Run 'npm install colors' to enable logging colors.");
    // Fallback if colors isn't installed yet
    colors = { gold: { bold: (s) => s }, cyan: (s) => s, green: (s) => s, red: (s) => s };
}

const WebSocket = require("ws");

// --- GLOBAL CONSTANTS ---
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const MULTICALL_ABI = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
const PAIR_ABI = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC, wss: process.env.ETH_WSS },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC, wss: process.env.BASE_WSS }
};

class QuantumEngine {
    static getAmountOut(amountIn, reserveIn, reserveOut) {
        if (amountIn <= 0n) return 0n;
        const amountInWithFee = amountIn * 997n;
        const numerator = amountInWithFee * reserveOut;
        const denominator = (reserveIn * 1000n) + amountInWithFee;
        return numerator / denominator;
    }

    static async getBulkReserves(provider, poolAddresses) {
        const multicall = new Contract(MULTICALL_ADDRESS, MULTICALL_ABI, provider);
        const itf = new Interface(PAIR_ABI);
        const calls = poolAddresses.map(addr => ({ target: addr, callData: itf.encodeFunctionData("getReserves") }));

        try {
            const [, returnData] = await multicall.aggregate(calls);
            return returnData.map(data => {
                const r = itf.decodeFunctionResult("getReserves", data);
                return [BigInt(r[0]), BigInt(r[1])];
            });
        } catch (e) { return []; }
    }

    static calculateProfit(amountIn, reserves) {
        let current = amountIn;
        for (const pool of reserves) {
            current = this.getAmountOut(current, pool[0], pool[1]);
        }
        return current - amountIn;
    }
}

async function main() {
    console.log("--------------------------------------------------".yellow);
    console.log("  QUANTUM TITAN v57.1 - ENGINE ONLINE             ".yellow.bold);
    console.log("--------------------------------------------------".yellow);

    if (!PRIVATE_KEY || !EXECUTOR_ADDRESS) {
        console.log("CRITICAL: Check your .env for PRIVATE_KEY and EXECUTOR_ADDRESS".red);
        process.exit(1);
    }

    Object.entries(NETWORKS).forEach(([name, config]) => {
        if (config.rpc) startWorker(name, config).catch(e => console.error(`[${name}] Worker Crash: ${e.message}`.red));
    });
}

async function startWorker(name, config) {
    const provider = new JsonRpcProvider(config.rpc);
    const wallet = new Wallet(PRIVATE_KEY, provider);

    console.log(`[${name}] Monitoring Active...`.cyan);

    // Main scanning loop
    setInterval(async () => {
        const t0 = process.hrtime.bigint();
        
        // 2026 Canonical Testing Pools (WETH/USDC -> USDC/DAI -> DAI/WETH)
        const targetPools = [
            "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", // UniV2 WETH/USDC
            "0xae461ca67b15dc8dd81c76156bdd13c261af0989", // UniV2 USDC/DAI
            "0xc3d03e4f418f3464094214e5990b429002202279"  // UniV2 DAI/WETH
        ];

        const reserves = await QuantumEngine.getBulkReserves(provider, targetPools);
        if (reserves.length < 3) return;

        const amountIn = ethers.parseEther("0.1"); // Testing with 0.1 ETH
        const profit = QuantumEngine.calculateProfit(amountIn, reserves);

        if (profit > 0n) {
            const t1 = process.hrtime.bigint();
            console.log(`[${name}] 💰 ARB: +${ethers.formatEther(profit)} ETH | Delay: ${Number(t1-t0)/1000}μs`.green);
            await strike(name, wallet, amountIn, targetPools);
        }
    }, 1000); 
}

async function strike(name, wallet, amount, path) {
    try {
        const tx = await wallet.sendTransaction({
            to: EXECUTOR_ADDRESS,
            data: "0x", // Replace with your contract's encoded strike data
            value: amount,
            gasLimit: 300000n
        });
        console.log(`🚀 STRIKE SUCCESS [${name}]: ${tx.hash}`.yellow);
    } catch (e) {
        console.log(`[${name}] Strike Reverted (Safety Protection)`.red);
    }
}

main();
