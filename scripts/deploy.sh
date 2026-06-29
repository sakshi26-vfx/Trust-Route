#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

echo "========================================="
echo "   TrustRoute Automated Contract Deployer "
echo "========================================="

# Configurations
NETWORK="testnet"
SOURCE="admin"
RPC_URL="https://soroban-testnet.stellar.org"

echo "1. Building WASM smart contract targets..."
cargo build --target wasm32-unknown-unknown --release

echo "2. Deploying Router Contract..."
ROUTER_WASM="target/wasm32-unknown-unknown/release/trustroute_router.wasm"
if [ ! -f "$ROUTER_WASM" ]; then
  ROUTER_WASM="target/wasm32-unknown-unknown/release/trustroute_router.optimized.wasm"
fi
ROUTER_ID=$(soroban contract deploy \
  --wasm "$ROUTER_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK")

echo "Router deployed successfully. ID: $ROUTER_ID"

echo "3. Deploying Escrow Contract..."
ESCROW_WASM="target/wasm32-unknown-unknown/release/trustroute_escrow.wasm"
if [ ! -f "$ESCROW_WASM" ]; then
  ESCROW_WASM="target/wasm32-unknown-unknown/release/trustroute_escrow.optimized.wasm"
fi
ESCROW_ID=$(soroban contract deploy \
  --wasm "$ESCROW_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK")

echo "Escrow deployed successfully. ID: $ESCROW_ID"

ADMIN_ADDRESS=$(soroban keys address "$SOURCE")
echo "Admin Address: $ADMIN_ADDRESS"

echo "4. Initializing Router Contract..."
soroban contract invoke \
  --id "$ROUTER_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- \
  initialize \
  --admin "$ADMIN_ADDRESS" \
  --platform_fee_recipient "$ADMIN_ADDRESS" \
  --platform_fee_bps 250

echo "5. Initializing Escrow Contract..."
soroban contract invoke \
  --id "$ESCROW_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- \
  initialize \
  --admin "$ADMIN_ADDRESS"

echo "6. Injecting Contract IDs into frontend and README..."
if [ -f "frontend/src/lib/soroban.ts" ]; then
  sed -i -E "s/escrow_id\"\)\ \|\|\ \"C[A-Z0-9]{55}\"/escrow_id\"\)\ \|\|\ \"$ESCROW_ID\"/g" frontend/src/lib/soroban.ts
  sed -i -E "s/router_id\"\)\ \|\|\ \"C[A-Z0-9]{55}\"/router_id\"\)\ \|\|\ \"$ROUTER_ID\"/g" frontend/src/lib/soroban.ts
fi

if [ -f "README.md" ]; then
  sed -i -E "s/Router Contract ID\*\*: \[\`C[A-Z0-9]{55}\`\]\(https:\/\/stellar\.expert\/explorer\/testnet\/contract\/C[A-Z0-9]{55}\)/Router Contract ID\*\*: \[\`$ROUTER_ID\`\]\(https:\/\/stellar\.expert\/explorer\/testnet\/contract\/$ROUTER_ID\)/g" README.md
  sed -i -E "s/Escrow Contract ID\*\*: \[\`C[A-Z0-9]{55}\`\]\(https:\/\/stellar\.expert\/explorer\/testnet\/contract\/C[A-Z0-9]{55}\)/Escrow Contract ID\*\*: \[\`$ESCROW_ID\`\]\(https:\/\/stellar\.expert\/explorer\/testnet\/contract\/$ESCROW_ID\)/g" README.md
fi

echo "========================================="
echo "      Deployment & Automation Complete!  "
echo "========================================="
echo "Router ID : $ROUTER_ID"
echo "Escrow ID : $ESCROW_ID"
echo ""
echo "Submission Links (Copy & Paste for Orange Belt Submission):"
echo "Escrow Contract : https://stellar.expert/explorer/testnet/contract/$ESCROW_ID"
echo "Router Contract : https://stellar.expert/explorer/testnet/contract/$ROUTER_ID"
echo "========================================="
