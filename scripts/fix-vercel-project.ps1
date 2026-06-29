# 一键修复 Vercel 项目 infinite-canvas-jay：Root Directory=web、Node=20.x，并触发重新部署
# 用法（PowerShell）：
#   cd D:\canvas\infinite-canvas
#   npx vercel login    # 只需做一次
#   .\scripts\fix-vercel-project.ps1

$ErrorActionPreference = "Stop"

$ProjectId = "prj_WFDr15QMmKCt7ENKV3u9ERVzOGA9"
$ProjectName = "infinite-canvas-jay"

function Get-VercelToken {
    if ($env:VERCEL_TOKEN) { return $env:VERCEL_TOKEN.Trim() }

    $candidates = @(
        (Join-Path $env:USERPROFILE ".vercel\auth.json"),
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
    Write-Host ""
    Write-Host "未找到 Vercel 登录令牌。请先执行：" -ForegroundColor Yellow
    Write-Host "  npx vercel login" -ForegroundColor Cyan
    Write-Host "登录完成后重新运行本脚本。" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
}

Write-Host "正在更新项目设置（Root Directory = web, Node.js = 20.x）..." -ForegroundColor Cyan

$patchBody = @{
    rootDirectory = "web"
    nodeVersion   = "20.x"
} | ConvertTo-Json

try {
    Invoke-RestMethod -Method PATCH `
        -Uri "https://api.vercel.com/v9/projects/$ProjectId" `
        -Headers $headers `
        -Body $patchBody | Out-Null
} catch {
    Write-Host "PATCH 项目失败：$($_.Exception.Message)" -ForegroundColor Red
    Write-Host "若 token 过期，请重新运行：npx vercel login" -ForegroundColor Yellow
    exit 1
}

Write-Host "设置已保存。正在从 GitHub main 触发 production 部署..." -ForegroundColor Green

$repoMeta = Invoke-RestMethod -Uri "https://api.github.com/repos/study666-creme/infinite-canvas-jay"
$deployBody = @{
    name    = $ProjectName
    project = $ProjectId
    target  = "production"
    gitSource = @{
        type   = "github"
        repoId = [int]$repoMeta.id
        ref    = "main"
    }
} | ConvertTo-Json -Depth 5

try {
    $deployment = Invoke-RestMethod -Method POST `
        -Uri "https://api.vercel.com/v13/deployments" `
        -Headers $headers `
        -Body $deployBody
    $url = if ($deployment.url) { "https://$($deployment.url)" } else { "https://vercel.com/study666-cremes-projects/$ProjectName" }
    Write-Host "部署已排队：$url" -ForegroundColor Green
} catch {
    Write-Host "自动部署触发失败：$($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "设置已改好。请到 Vercel → Deployments → 最新一条 → Redeploy。" -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "约 1～3 分钟后打开：https://infinite-canvas-jay.vercel.app/canvas" -ForegroundColor Green
