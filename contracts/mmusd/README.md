# MMUSD — Mood Margin Stable Coin

ERC-20 demo token deployed on **Arbitrum Sepolia** for the MoodMargin perpetual trading platform.

## Deployment

| Field | Value |
|-------|-------|
| Contract Address | `0xc7eD6332fAA3f03997FBFe42CbEc38c1133d6c1F` |
| Network | Arbitrum Sepolia (chainId 421614) |
| Symbol | MMUSD |
| Name | Mood Margin Stable Coin |
| Decimals | 18 |
| Total Supply | 1,000,000,000 MMUSD |
| Explorer | https://sepolia.arbiscan.io/address/0xc7eD6332fAA3f03997FBFe42CbEc38c1133d6c1F |
| Deploy Tx | 0xf2e8768ea4eb6e04f6d334cea505f37fc5e87854f40a7e94ffd214b70f4cb9a2 |

## ABI

Standard ERC-20: `name`, `symbol`, `decimals`, `totalSupply`, `balanceOf`, `transfer`, `transferFrom`, `approve`, `allowance`, `Transfer` event, `Approval` event.

## Usage

Import the address and ABI from `lib/mmusd/src/index.ts` in any workspace package.
