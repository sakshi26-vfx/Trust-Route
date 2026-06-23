#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

echo "========================================="
echo "   TrustRoute Soroban Contract Deployer   "
echo "========================================="

# Configurations
NETWORK="testnet"
SOURCE="admin" # Soroban identity name
RPC_URL="https://soroban-testnet.stellar.org"

echo "1. Building contracts..."
cargo build --target wasm32-unknown-unknown --release

echo "2. Deploying Router Contract..."
ROUTER_WASM="target/wasm32-unknown-unknown/release/trustroute_router.wasm"
ROUTER_ID=$(soroban contract deploy \
  --wasm "$ROUTER_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK")

echo "Router deployed successfully. ID: $ROUTER_ID"

echo "3. Deploying Escrow Contract..."
ESCROW_WASM="target/wasm32-unknown-unknown/release/trustroute_escrow.wasm"
ESCROW_ID=$(soroban contract deploy \
  --wasm "$ESCROW_WASM" \
  --source "$SOURCE" \
  --network "$NETWORK")

echo "Escrow deployed successfully. ID: $ESCROW_ID"

# Get Admin Address (e.g. from soroban identity)
ADMIN_ADDRESS=$(soroban keys address "$SOURCE")
echo "Admin Address: $ADMIN_ADDRESS"

echo "4. Initializing Router Contract..."
# Parameters: admin: Address, platform_fee_recipient: Address, platform_fee_bps: u32 (250 BPS = 2.5%)
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
# Parameters: admin: Address
soroban contract invoke \
  --id "$ESCROW_ID" \
  --source "$SOURCE" \
  --network "$NETWORK" \
  -- \
  initialize \
  --admin "$ADMIN_ADDRESS"

echo "========================================="
echo "Deployment Complete!"
echo "Router ID: $ROUTER_ID"
echo "Escrow ID: $ESCROW_ID"
echo "Please update these IDs in 'frontend/src/lib/soroban.ts'"
echo "========================================="
