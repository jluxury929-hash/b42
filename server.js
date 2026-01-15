/**
 * ===============================================================================
 * APEX TITAN v206.7 - RAILWAY EDITION (STABILIZED)
 * ===============================================================================
 */

require('dotenv').config();
const { 
    ethers, JsonRpcProvider, Wallet, Contract, Interface, parseEther, formatEther, getAddress, Network 
} = require('ethers');
const http = require('http');

// 1. DYNAMIC COLOR INITIALIZATION
let colors;
try {
    colors = require('colors');
    colors.enable();
} catch (e) {
    colors = { yellow: { bold: (s) => s }, cyan: (s) => s, green: { bold: (s) => s }, red: (s) => s, gray: (s) => s, magenta: { bold: (s) => s } };
}

// 2. CONFIGURATION MANIFEST
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const EXECUTOR = process.env.EXECUTOR_ADDRESS;

const ASSETS = {
    ETHEREUM: { weth: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" },
    BASE:     { weth: "0x4200000000000000000000000000000000000006", usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }
};

const ROUTERS = {
    ETHEREUM: { uni: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", sushi: "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F" },
    BASE:     { uni: "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24", sushi: "0x6BDED42c679f1ee30611fa44f83736765790757a" }
};

const POOL_MAP = {
    ETHEREUM: { uni: "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc", sushi: "0x397ff1542f962076d0bfe58ea045ffa2d347aca0" },
    BASE:     { uni: "0x88A43bbDF9D098eEC7bCEda4e2494615dfD9bB9C", sushi: "0x2e0a2da557876a91726719114777c082531d2794" }
};

// 3. CORE ENGINE
class ApexOmniGovernor {
    constructor() {
        this.providers = {}; this.wallets = {}; this.rpcIndex = { ETHEREUM: 0, BASE: 0 };
        this.multiAbi = ["function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[] returnData)"];
        this.v2Abi = ["function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"];
        this.execAbi = ["function executeTriangle(address routerA, address routerB, address tokenA, address tokenB, uint256 amount) external payable"];
        
        this.setupNetworks();
    }

    setupNetworks() {
        const networks = { ETHEREUM: 1, BASE: 8453 };
        for (const [name, chainId] of Object.entries(networks)) {
            const rpc = name === 'ETHEREUM' ? process.env.ETH_RPC : process.env.BASE_RPC;
            if (!rpc) continue;
            this.providers[name] = new JsonRpcProvider(rpc, undefined, { staticNetwork: Network.from(chainId) });
            this.wallets[name] = new Wallet(PRIVATE_KEY, this.providers[name]);
        }
    }

    async scan(name) {
        try {
            const pools = POOL_MAP[name];
            const multi = new Contract("0xcA11bde05977b3631167028862bE2a173976CA11", this.multiAbi, this.providers[name]);
            const itf = new Interface(this.v2Abi);

            const results = await multi.tryAggregate(false, [
                { target: getAddress(pools.uni), callData: itf.encodeFunctionData("getReserves") },
                { target: getAddress(pools.sushi), callData: itf.encodeFunctionData("getReserves") }
            ]);

            if (!results[0].success || !results[1].success) return;

            const resUni = itf.decodeFunctionResult("getReserves", results[0].returnData);
            const resSushi = itf.decodeFunctionResult("getReserves", results[1].returnData);

            // Math: Input -> Swap Pool 1 (Uni) -> Swap Pool 2 (Sushi)
            const amountIn = parseEther("0.1");
            const tokens = this.getAmountOut(amountIn, resUni[0], resUni[1]);
            const back = this.getAmountOut(tokens, resSushi[1], resSushi[0]);

            if (back > amountIn + parseEther("0.0005")) {
                console.log(colors.green.bold(`\n[${name}] 💰 SIGNAL DETECTED: Profit ${formatEther(back - amountIn)} ETH`));
                await this.strike(name, amountIn);
            } else {
                process.stdout.write(colors.gray("."));
            }
        } catch (e) { /* Error Suppressed for Pulse */ }
    }

    getAmountOut(amountIn, resIn, resOut) {
        if (resIn === 0n || resOut === 0n) return 0n;
        const amountInWithFee = BigInt(amountIn) * 997n;
        return (amountInWithFee * BigInt(resOut)) / ((BigInt(resIn) * 1000n) + amountInWithFee);
    }

    async strike(name, amount) {
        const config = ROUTERS[name];
        const assets = ASSETS[name];
        const executor = new Contract(EXECUTOR, this.execAbi, this.wallets[name]);

        try {
            console.log(colors.yellow(`[STRIKE] Broadcasting to ${name}...`));
            const tx = await executor.executeTriangle(
                config.uni, config.sushi, assets.weth, assets.usdc, amount,
                { value: amount, gasLimit: 500000 }
            );
            console.log(colors.magenta.bold(`🚀 STRIKE SUCCESS: ${tx.hash}`));
            await tx.wait();
        } catch (e) {
            console.log(colors.red(`[STRIKE] Reverted: ${e.reason || "Price Impact"}`));
        }
    }

    async run() {
        console.log(colors.yellow.bold("\n⚡ APEX TITAN v206.7 | ENGINE ACTIVE\n"));
        while (true) {
            for (const name of Object.keys(this.providers)) await this.scan(name);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

// 4. RAILWAY BOOT
const port = process.env.PORT || 8080;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: "ACTIVE", version: "206.7" }));
}).listen(port, "0.0.0.0", () => {
    console.log(colors.cyan(`[SYSTEM] Railway Health Monitor active on port ${port}`));
});

const governor = new ApexOmniGovernor();
governor.run().catch(e => console.error(colors.red("FATAL:"), e));
