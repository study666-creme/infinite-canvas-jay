# Fix Vercel project infinite-canvas-jay: rootDirectory=web, node=20.x, npm build, redeploy
# Usage:
#   cd D:\canvas\infinite-canvas
#   npx vercel login
#   powershell -ExecutionPolicy Bypass -File .\scripts\fix-vercel-project.ps1

$ErrorActionPreference = "Stop"

$ProjectId = "prj_WFDr15QMeKCt7ENKV3u9ERVzOGA9"
$TeamId = "team_Yx9OAaDQjv28cShhYACANruM"
$ProjectName = "infinite-canvas-jay"
$RepoId = 1284099744

function Get-VercelToken {
    if ($env:VERCEL_TOKEN) { return $env:VERCEL_TOKEN.Trim() }

    $candidates = @(
        (Join-Path $env:USERPROFILE ".vercel\auth.json"),
        (Join-Path $env:APPDATA "xdg.data\com.vercel.cli\auth.json"),
        (Join-Path $env:LOCALAPPDATA "com.vercel.cli\auth.json"),
        (Join-Path $env:APPDATA "com.vercel.cli\auth.json")
    )
    foreach ($path in $candidates) {
        if (-not (Test-Path $path)) { continue }
        try {
            $auth = Get-Content $path -Raw | ConvertFrom-Json
            if ($auth.token) { return [string]$auth.token }
        } catch { }
    }
    return $null
}

$token = Get-VercelToken
if (-not $token) {
    Write-Host "[fix-vercel] No Vercel token. Run: npx vercel login" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "[fix-vercel] PATCH rootDirectory=web, nodeVersion=20.x, npm build ..." -ForegroundColor Cyan

$patchBody = @{
    rootDirectory   = "web"
    nodeVersion     = "20.x"
    framework       = "nextjs"
    buildCommand    = "npm run build"
    installCommand  = "npm ci || npm install"
    outputDirectory = ".next"
} | ConvertTo-Json

$patchUri = "https://api.vercel.com/v9/projects/$ProjectId`?teamId=$TeamId"
Invoke-RestMethod -Method PATCH -Uri $patchUri -Headers $headers -Body $patchBody | Out-Null

Write-Host "[fix-vercel] Settings saved. Trigger production deploy from main ..." -ForegroundColor Green

$deployBody = @"
{"name":"$ProjectName","project":"$ProjectId","target":"production","gitSource":{"type":"github","repoId":$RepoId,"ref":"main"}}
"@

try {
    $deployUri = "https://api.vercel.com/v13/deployments?teamId=$TeamId"
    $deployment = Invoke-RestMethod -Method POST -Uri $deployUri -Headers $headers -Body $deployBody
    $deployUrl = if ($deployment.url) { "https://$($deployment.url)" } else { "https://vercel.com/study666-cremes-projects/$ProjectName" }
    Write-Host "[fix-vercel] Deploy queued: $deployUrl" -ForegroundColor Green
} catch {
    Write-Host "[fix-vercel] Auto deploy failed: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "[fix-vercel] Vercel -> Deployments -> Redeploy latest." -ForegroundColor Yellow
    exit 0
}

Write-Host "[fix-vercel] Done. Open: https://infinite-canvas-jay.vercel.app/canvas" -ForegroundColor Green
