[CmdletBinding()]
param(
    [string]$TargetPath = 'prototypes/peninsula-tech-logo-lab.html',
    [string]$Title = 'PENÍNSULA TECH',
    [switch]$PublicTunnel,
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$serverProcess = $null
$tunnelProcess = $null

function Get-Python {
    foreach ($name in @('py', 'python')) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    throw 'No se encontró Python en el PATH.'
}

function Get-FreePort {
    $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

function Wait-Http([string]$Url, [int]$Seconds = 20) {
    $deadline = (Get-Date).AddSeconds($Seconds)
    do {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3 | Out-Null
            return
        }
        catch {
            Start-Sleep -Milliseconds 500
        }
    } while ((Get-Date) -lt $deadline)
    throw "El servidor local no respondió: $Url"
}

function Ensure-Qr([string]$Python) {
    & $Python -c "import qrcode, PIL" 2>$null
    if ($LASTEXITCODE -eq 0) { return }
    Write-Host 'Instalando generador QR local...' -ForegroundColor Cyan
    & $Python -m pip install --user 'qrcode[pil]'
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar qrcode[pil].' }
}

function Get-Cloudflared {
    $dir = Join-Path $env:LOCALAPPDATA 'AdjuntoLabTools'
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    $exe = Join-Path $dir 'cloudflared.exe'
    if (-not (Test-Path -LiteralPath $exe)) {
        Write-Host 'Descargando Cloudflare Tunnel una sola vez...' -ForegroundColor Cyan
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest `
            -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' `
            -OutFile $exe `
            -UseBasicParsing
    }
    return $exe
}

function Start-Tunnel([string]$Exe, [string]$LocalBase, [string]$Slug) {
    $outLog = Join-Path $env:TEMP "$Slug-tunnel-out.log"
    $errLog = Join-Path $env:TEMP "$Slug-tunnel-err.log"
    Remove-Item $outLog, $errLog -Force -ErrorAction SilentlyContinue

    $process = Start-Process `
        -FilePath $Exe `
        -ArgumentList @('tunnel', '--url', $LocalBase, '--no-autoupdate', '--protocol', 'http2') `
        -RedirectStandardOutput $outLog `
        -RedirectStandardError $errLog `
        -WindowStyle Hidden `
        -PassThru

    $deadline = (Get-Date).AddSeconds(90)
    do {
        Start-Sleep -Seconds 1
        $text = ''
        if (Test-Path -LiteralPath $outLog) { $text += Get-Content -LiteralPath $outLog -Raw -ErrorAction SilentlyContinue }
        if (Test-Path -LiteralPath $errLog) { $text += "`n" + (Get-Content -LiteralPath $errLog -Raw -ErrorAction SilentlyContinue) }

        if ($text -match 'https://[-a-z0-9]+\.trycloudflare\.com') {
            return [pscustomobject]@{ Process = $process; BaseUrl = $Matches[0] }
        }
        if ($process.HasExited) { throw "Cloudflare Tunnel terminó antes de crear la URL.`n$text" }
    } while ((Get-Date) -lt $deadline)

    throw 'Cloudflare Tunnel no entregó una URL pública dentro de 90 segundos.'
}

function Show-Qr([string]$Python, [string]$Url, [string]$ViewerTitle, [string]$Note, [string]$Slug) {
    Ensure-Qr -Python $Python
    $png = Join-Path $env:TEMP "$Slug-qr.png"
    $html = Join-Path $env:TEMP "$Slug-qr.html"

    & $Python -c "import qrcode,sys; q=qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=12,border=4); q.add_data(sys.argv[1]); q.make(fit=True); q.make_image(fill_color='black',back_color='white').save(sys.argv[2])" $Url $png
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear el QR.' }

    $qr = [Convert]::ToBase64String([IO.File]::ReadAllBytes($png))
    $safeUrl = [System.Net.WebUtility]::HtmlEncode($Url)
    $safeTitle = [System.Net.WebUtility]::HtmlEncode($ViewerTitle)
    $safeNote = [System.Net.WebUtility]::HtmlEncode($Note)

    $page = @"
<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>QR $safeTitle</title><style>html,body{min-height:100%;margin:0;background:#020812;color:#f4ffff;font-family:Segoe UI,Arial,sans-serif}body{display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(620px,94vw);text-align:center;padding:28px;border:1px solid rgba(75,235,255,.28);border-radius:26px;background:radial-gradient(circle at 50% 18%,rgba(39,244,255,.13),transparent 34%),#04101d;box-shadow:0 0 60px rgba(39,244,255,.12)}h1{margin:0 0 10px}.qr{display:block;width:min(430px,78vw);margin:22px auto;background:#fff;padding:14px;border-radius:18px}p{color:#9fc9db;line-height:1.5}a{color:#74f7ff;overflow-wrap:anywhere;font-weight:700}.note{font-size:13px}</style></head><body><main class="card"><h1>$safeTitle</h1><p>Escanea este código con el teléfono.</p><img class="qr" src="data:image/png;base64,$qr" alt="QR $safeTitle"><p><a href="$safeUrl">$safeUrl</a></p><p class="note">$safeNote</p></main></body></html>
"@
    Set-Content -LiteralPath $html -Value $page -Encoding UTF8
    Start-Process $html
}

try {
    if ($Port -le 0) { $Port = Get-FreePort }
    $targetFile = Join-Path $RepoRoot $TargetPath
    if (-not (Test-Path -LiteralPath $targetFile)) { throw "No se encontró: $targetFile" }

    $python = Get-Python
    $slug = (($Title -replace '[^A-Za-z0-9]+', '-').ToLowerInvariant()).Trim([char[]]'-')
    if (-not $slug) { $slug = 'logo-lab' }

    $serverOut = Join-Path $env:TEMP "$slug-server-out.log"
    $serverErr = Join-Path $env:TEMP "$slug-server-err.log"
    Remove-Item $serverOut, $serverErr -Force -ErrorAction SilentlyContinue
    $bind = if ($PublicTunnel) { '127.0.0.1' } else { '0.0.0.0' }

    $serverProcess = Start-Process `
        -FilePath $python `
        -ArgumentList @('-m', 'http.server', "$Port", '--bind', $bind) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $serverOut `
        -RedirectStandardError $serverErr `
        -WindowStyle Hidden `
        -PassThru

    $localUrl = "http://127.0.0.1:$Port/$TargetPath"
    Wait-Http -Url $localUrl

    if ($PublicTunnel) {
        Write-Host 'Creando URL pública temporal...' -ForegroundColor Cyan
        $tunnel = Start-Tunnel -Exe (Get-Cloudflared) -LocalBase "http://127.0.0.1:$Port" -Slug $slug
        $tunnelProcess = $tunnel.Process
        $url = "$($tunnel.BaseUrl)/$TargetPath"
        $note = 'No necesitas compartir la misma red Wi-Fi. Mantén esta ventana abierta.'
    }
    else {
        $config = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } | Select-Object -First 1
        if (-not $config) { throw 'No se encontró una red activa.' }
        $ip = $config.IPv4Address.IPAddress | Select-Object -First 1
        $url = "http://${ip}:$Port/$TargetPath"
        $note = 'El teléfono y la computadora deben compartir la misma red Wi-Fi.'
    }

    Set-Clipboard -Value $url -ErrorAction SilentlyContinue
    Show-Qr -Python $python -Url $url -ViewerTitle $Title -Note $note -Slug $slug

    Write-Host ''
    Write-Host 'LABORATORIO LISTO' -ForegroundColor Green
    Write-Host "URL: $url" -ForegroundColor Cyan
    Write-Host 'Mantén esta ventana abierta. Presiona Enter para cerrar.' -ForegroundColor Yellow
    [void](Read-Host)
}
finally {
    foreach ($process in @($tunnelProcess, $serverProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
