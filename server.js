/**
 * QUANTUM TITAN MULTI-CHAIN ENGINE - v206.8 (RAILWAY HARDENED)
 * ----------------------------------------------------------------
 */

require("dotenv").config();
const { ethers, Wallet, JsonRpcProvider, Interface, Contract, Network } = require("ethers");
const http = require("http");

// 1. DYNAMIC COLOR INITIALIZATION
let colors;
try {
    colors = require("colors");
    colors.enable();
} catch (e) {
    // Fallback if colors isn't installed in the container yet
    colors = { 
        yellow: { bold: (s) => s }, 
        cyan: (s) => s, 
        green: (s) => s, 
        red: (s) => s, 
        gray: (s) => s 
    };
}

// 2. CONSTANTS & CONFIG
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
const EXECUTOR_ADDRESS = process.env.EXECUTOR_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const MULTICALL_ABI = ["function aggregate(tuple(address target, bytes callData)[] calls) view returns (uint256 blockNumber, bytes[] returnData)"];
const PAIR_ABI = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];

const NETWORKS = {
    ETHEREUM: { chainId: 1, rpc: process.env.ETH_RPC },
    BASE: { chainId: 8453, rpc: process.env.BASE_RPC }
};

// 3. MATH ENGINE
class QuantumEngine {
    static getAmountOut(amountIn, reserveIn, reserveOut) {
        if (amountIn <= 0n) return 0n;
        const amountInWithFee = amountIn * 997n; // 0.3% Fee
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

// 4. RAILWAY HEALTH SERVER
// This binds to the PORT Railway provides so the deployment doesn't fail.
const port = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: "STRIKE_READY", engine: "QUANTUM_TITAN" }));
}).listen(port, "::", () => {
    console.log(`[SYSTEM] Health Monitor active on port ${port}`.cyan);
});

// 5. WORKER LOGIC
async function startWorker(name, config) {
    if (!config.rpc) return;

    // FIX: Provide a static network to prevent "failed to detect network" errors.
    const provider = new JsonRpcProvider(config.rpc, undefined, {
        staticNetwork: Network.from(config.chainId)
    });

    const wallet = new Wallet(PRIVATE_KEY, provider);
    console.log(`[${name}] Link Established. Monitoring Pools...`.cyan);

    setInterval(async () => {
        try {
            const t0 = process.hrtime.bigint();
            
            // Testing Pools: WETH/USDC -> USDC/DAI -> DAI/WETH
            const targetPools = [
                "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", 
                "0xae461ca67b15dc8dd81c76156bdd13c261af0989", 
                "0xc3d03e4f418f3464094214e5990b429002202279"
            ];

            const reserves = await QuantumEngine.getBulkReserves(provider, targetPools);
            if (reserves.length < 3) return;

            const amountIn = ethers.parseEther("0.1");
            const profit = QuantumEngine.calculateProfit(amountIn, reserves);

            if (profit > 0n) {
                const t1 = process.hrtime.bigint();
                console.log(`[${name}] 💰 ARB: +${ethers.formatEther(profit)} ETH | Latency: ${Number(t1-t0)/1000}μs`.green);
                await strike(name, wallet, amountIn);
            } else {
                process.stdout.write(".".gray); // Pulse indicator
            }
        } catch (e) {
            process.stdout.write("!".red); // Scan error indicator
        }
    }, 2000); 
}

async function strike(name, wallet, amount) {
    try {
        const tx = await wallet.sendTransaction({
            to: EXECUTOR_ADDRESS,
            data: "0x", 
            value: amount,
            gasLimit: 350000n
        });
        console.log(`\n🚀 STRIKE SUCCESS [${name}]: ${tx.hash}`.yellow.bold);
    } catch (e) {
        console.log(`\n[${name}] Strike Reverted (Safety Guard)`.red);
    }
}

// 6. IGNITION
async function main() {
    console.log("--------------------------------------------------".yellow);
    console.log("  QUANTUM TITAN v206.8 - ENGINE STARTING          ".yellow.bold);
    console.log("--------------------------------------------------".yellow);

    if (!PRIVATE_KEY || !EXECUTOR_ADDRESS) {
        console.log("CRITICAL: Environment Variables Missing".red);
        process.exit(1);
    }

    for (const [name, config] of Object.entries(NETWORKS)) {
        startWorker(name, config).catch(e => console.error(`[${name}] Crash: ${e.message}`.red));
    }
}

main();
