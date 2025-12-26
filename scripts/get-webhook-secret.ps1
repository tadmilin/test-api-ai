# Get Replicate Webhook Secret
# Windows PowerShell

# 1. Load from .env file
$envContent = Get-Content .env -Raw
$envContent -split "`n" | ForEach-Object {
    if ($_ -match '^REPLICATE_API_TOKEN=(.+)$') {
        $REPLICATE_API_TOKEN = $matches[1].Trim()
    }
}

if (-not $REPLICATE_API_TOKEN) {
    Write-Host "❌ REPLICATE_API_TOKEN not found in .env" -ForegroundColor Red
    exit 1
}

# 2. Fetch the webhook secret
Write-Host "🔍 Fetching webhook secret from Replicate..." -ForegroundColor Cyan

$headers = @{
    "Authorization" = "Bearer $REPLICATE_API_TOKEN"
}

try {
    $response = Invoke-RestMethod -Uri "https://api.replicate.com/v1/webhooks/default/secret" -Headers $headers -Method Get
    
    Write-Host "`n✅ Webhook Secret Found!" -ForegroundColor Green
    Write-Host "`n📋 Copy this to your .env and Vercel:" -ForegroundColor Yellow
    Write-Host "━" * 60 -ForegroundColor Gray
    Write-Host "REPLICATE_WEBHOOK_SECRET=$($response.key)" -ForegroundColor White
    Write-Host "━" * 60 -ForegroundColor Gray
    Write-Host "`n🔐 Keep this secret safe!" -ForegroundColor Red
    Write-Host "`n📝 Next steps:" -ForegroundColor Yellow
    Write-Host "1. Add to .env file (if not already there)"
    Write-Host "2. Add to Vercel: Settings → Environment Variables"
    Write-Host "3. Redeploy your app"
    
} catch {
    Write-Host "`n❌ Error fetching webhook secret:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}
