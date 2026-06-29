# TrustRoute Soroban Contract Deployer & Auto-Configurator for Windows
$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   TrustRoute Automated Contract Deployer " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# Configurations
$NETWORK = "testnet"
$SOURCE = "admin"
$RPC_URL = "https://soroban-testnet.stellar.org"

# Make sure PATH is refreshed so stellar/soroban command is available
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

Write-Host "`n1. Building WASM smart contract targets..." -ForegroundColor Green
cargo build --target wasm32-unknown-unknown --release

Write-Host "`n2. Fetching Admin public address..." -ForegroundColor Green
$AdminAddress = (stellar keys address $SOURCE).Trim()
Write-Host "Admin Address: $AdminAddress" -ForegroundColor Gray

Write-Host "`n3. Deploying Router Contract..." -ForegroundColor Green
$RouterWasm = "target/wasm32-unknown-unknown/release/trustroute_router.wasm"
if (-not (Test-Path $RouterWasm)) { $RouterWasm = "target/wasm32-unknown-unknown/release/trustroute_router.optimized.wasm" }
$RouterId = (stellar contract deploy --wasm $RouterWasm --source $SOURCE --network $NETWORK).Trim()
Write-Host "Router Contract Deployed successfully. ID: $RouterId" -ForegroundColor Gray

Write-Host "`n4. Deploying Escrow Contract..." -ForegroundColor Green
$EscrowWasm = "target/wasm32-unknown-unknown/release/trustroute_escrow.wasm"
if (-not (Test-Path $EscrowWasm)) { $EscrowWasm = "target/wasm32-unknown-unknown/release/trustroute_escrow.optimized.wasm" }
$EscrowId = (stellar contract deploy --wasm $EscrowWasm --source $SOURCE --network $NETWORK).Trim()
Write-Host "Escrow Contract Deployed successfully. ID: $EscrowId" -ForegroundColor Gray

Write-Host "`n5. Initializing Router Contract..." -ForegroundColor Green
# platform_fee_bps: 250 BPS = 2.5%
stellar contract invoke --id $RouterId --source $SOURCE --network $NETWORK -- initialize --admin $AdminAddress --platform_fee_recipient $AdminAddress --platform_fee_bps 250

Write-Host "`n6. Initializing Escrow Contract..." -ForegroundColor Green
stellar contract invoke --id $EscrowId --source $SOURCE --network $NETWORK -- initialize --admin $AdminAddress

Write-Host "`n7. Injecting Contract IDs into frontend codebase..." -ForegroundColor Green
$filePath = "frontend/src/lib/soroban.ts"
if (Test-Path $filePath) {
    $content = Get-Content $filePath -Raw
    # Update fallback IDs in soroban.ts
    $content = $content -replace 'escrow_id"\) \|\| "C[A-Z0-9]{55}"', ("escrow_id"") || """ + $EscrowId + """")
    $content = $content -replace 'router_id"\) \|\| "C[A-Z0-9]{55}"', ("router_id"") || """ + $RouterId + """")
    $content = $content -replace 'router: "C[A-Z0-9]{55}"', ("router: """ + $RouterId + """")
    Set-Content -Path $filePath -Value $content -NoNewline
    Write-Host "Successfully updated '$filePath' with new contract addresses." -ForegroundColor Gray
} else {
    Write-Host "Warning: Frontend file '$filePath' not found." -ForegroundColor Yellow
}

Write-Host "`n8. Updating README.md with live Stellar Expert links..." -ForegroundColor Green
$readmePath = "README.md"
if (Test-Path $readmePath) {
    $readme = Get-Content $readmePath -Raw
    $readme = $readme -replace 'Router Contract ID\*\*: \[`C[A-Z0-9]{55}`\]\(https://stellar\.expert/explorer/testnet/contract/C[A-Z0-9]{55}\)', ("Router Contract ID**: [`" + $RouterId + "`](https://stellar.expert/explorer/testnet/contract/" + $RouterId + ")")
    $readme = $readme -replace 'Escrow Contract ID\*\*: \[`C[A-Z0-9]{55}`\]\(https://stellar\.expert/explorer/testnet/contract/C[A-Z0-9]{55}\)', ("Escrow Contract ID**: [`" + $EscrowId + "`](https://stellar.expert/explorer/testnet/contract/" + $EscrowId + ")")
    Set-Content -Path $readmePath -Value $readme -NoNewline
    Write-Host "Successfully updated '$readmePath' with live Explorer links." -ForegroundColor Gray
}

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host "      Deployment & Automation Complete!  " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Router ID : $RouterId" -ForegroundColor Yellow
Write-Host "Escrow ID : $EscrowId" -ForegroundColor Yellow
Write-Host "`nSubmission Links (Copy & Paste for Orange Belt Submission):" -ForegroundColor Green
Write-Host "Escrow Contract : https://stellar.expert/explorer/testnet/contract/$EscrowId" -ForegroundColor White
Write-Host "Router Contract : https://stellar.expert/explorer/testnet/contract/$RouterId" -ForegroundColor White
Write-Host "=========================================`n" -ForegroundColor Cyan
