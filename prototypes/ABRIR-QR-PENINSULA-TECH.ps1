[CmdletBinding()]
param(
    [string]$TargetPath = 'prototypes/peninsula-tech-logo-lab.html',
    [string]$Title = 'PENÍNSULA TECH',
    [switch]$PublicTunnel,
    [int]$Port = 0
)

$ErrorActionPreference = 'Stop'
$PrototypeDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent $PrototypeDir
$ServerProcess = $null
$TunnelProcess = $null

function Get-PythonCommand {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) { return $python.Source }

    throw 'No se encontró Python. Instala Python o agrega py/python al PATH.'
}

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

function Get-ActiveIPv4 {
    $configs = Get-NetIPConfiguration | Where-Object {
        $_.IPv4DefaultGateway -and
        $_.IPv4Address -and
        $_.NetAdapter.Status -eq 'Up'
    }

    $preferred = $configs |
        Where-Object { $_.InterfaceAlias -match 'Wi-Fi|WLAN|Wireless|Ethernet' } |
        Select-Object -First 1

    if (-not $preferred) {
        $preferred = $configs | Select-Object -First 1
    }

    if (-not $preferred) {
        throw 'No se encontró una conexión de red activa con puerta de enlace.'
    }

    return ($preferred.IPv4Address | Select-Object -First 1 -ExpandProperty IPAddress)
}

function Ensure-FirewallRule([int]$LocalPort) {
    $ruleName = "Laboratorio QR Puerto $LocalPort"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if ($existing) { return }

    try {
        New-NetFirewallRule `
            -DisplayName $ruleName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalPort $LocalPort `
            -Profile Private `
            -ErrorAction Stop | Out-Null
    }
    catch {
        Write-Host 'AVISO: Windows no permitió crear la regla del firewall automáticamente.' -ForegroundColor Yellow
        Write-Host 'Si aparece una ventana de seguridad, permite Python sólo en redes privadas.' -ForegroundColor Yellow
    }
}

function Ensure-QrModule([string]$Python) {
    & $Python -c "import qrcode, PIL" 2>$null
    if ($LASTEXITCODE -eq 0) { return }

    Write-Host 'Instalando generador QR local...' -ForegroundColor Cyan
    & $Python -m pip install --user 'qrcode[pil]'
    if ($LASTEXITCODE -ne 0) {
        throw 'No se pudo instalar el generador QR local.'
    }
}

function Get-CloudflaredPath {
    $toolDir = Join-Path $env:LOCALAPPDATA 'AdjuntoLabTools'
    if (-not (Test-Path -LiteralPath $toolDir)) {
        New-Item -ItemType Directory -Path $toolDir -Force | Out-Null
    }

    $cloudflared = Join-Path $toolDir 'cloudflared.exe'
    if (Test-Path -LiteralPath $cloudflared) { return $cloudflared }

    Write-Host 'Descargando Cloudflare Tunnel una sola vez...' -ForegroundColor Cyan
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest `
        -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' `
        -OutFile $cloudflared `
        -UseBasicParsing

    return $cloudflared
}

function Wait-ForLocalServer([string]$Url) {
    $deadline = (Get-Date).AddSeconds(20)
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

function Start-PublicTunnel([string]$Cloudflared, [string]$LocalUrl, [string]$OutLog, [string]$ErrLog) {
    $process = Start-Process `
        -FilePath $Cloudflared `
        -ArgumentList @('tunnel', '--url', $LocalUrl, '--no-autoupdate', '--protocol', 'http2') `
        -RedirectStandardOutput $OutLog `
        -RedirectStandardError $ErrLog `
        -WindowStyle Hidden `
        -PassThru

    $deadline = (Get-Date).AddSeconds(90)
    $publicBase = $null

    do {
        Start-Sleep -Seconds 1
        $combined = ''
        if (Test-Path -LiteralPath $OutLog) { $combined += (Get-Content -LiteralPath $OutLog -Raw -ErrorAction SilentlyContinue) }
        if (Test-Path -LiteralPath $ErrLog) { $combined += "`n" + (Get-Content -LiteralPath $ErrLog -Raw -ErrorAction SilentlyContinue) }

        if ($combined -match 'https://[-a-z0-9]+\.trycloudflare\.com') {
            $publicBase = $Matches[0]
            break
        }

        if ($process.HasExited) {
            throw "Cloudflare Tunnel terminó antes de crear la URL.`n$combined"
        }
    } while ((Get-Date) -lt $deadline)

    if (-not $publicBase) {
        throw 'Cloudflare Tunnel no entregó una URL pública dentro de 90 segundos.'
    }

    return [pscustomobject]@{
        Process = $process
        PublicBase = $publicBase
    }
}

function New-QrViewer([string]$Python, [string]$Url, [string]$ViewerTitle, [string]$Note, [string]$Slug) {
    Ensure-QrModule -Python $Python

    $qrPath = Join-Path $env:TEMP "$Slug-qr.png"
    $viewerPath = Join-Path $env:TEMP "$Slug-qr.html"

    & $Python -c "import qrcode,sys; qr=qrcode.QRCode(version=None,error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=12,border=4); qr.add_data(sys.argv[1]); qr.make(fit=True); qr.make_image(fill_color='black',back_color='white').save(sys.argv[2])" $Url $qrPath
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $qrPath)) {
        throw 'No se pudo crear la imagen QR.'
    }

    $qrBase64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($qrPath))
    $escapedUrl = [System.Net.WebUtility]::HtmlEncode($Url)
    $escapedTitle = [System.Net.WebUtility]::HtmlEncode($ViewerTitle)
    $escapedNote = [System.Net.WebUtility]::HtmlEncode($Note)

    $viewer = @"
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR $escapedTitle</title>
<style>
html,body{min-height:100%;margin:0;background:#020812;color:#f4ffff;font-family:Segoe UI,Arial,sans-serif}
body{display:grid;place-items:center;padding:24px;box-sizing:border-box}
.card{width:min(620px,94vw);text-align:center;padding:28px;border:1px solid rgba(75,235,255,.28);border-radius:26px;background:radial-gradient(circle at 50% 18%,rgba(39,244,255,.13),transparent 34%),#04101d;box-shadow:0 0 60px rgba(39,244,255,.12)}
h1{margin:0 0 10px;letter-spacing:.08em}p{color:#9fc9db;line-height:1.5}.qr{display:block;width:min(430px,78vw);height:auto;margin:22px auto;background:white;padding:14px;border-radius:18px;box-shadow:0 0 38px rgba(39,244,255,.32)}
a{color:#74f7ff;overflow-wrap:anywhere;font-weight:700}.note{font-size:13px;margin-top:18px}
</style>
</head>
<body>
  <main class="card">
    <h1>$escapedTitle</h1>
    <p>Escanea este código con el teléfono.</p>
    <img class="qr" src="data:image/png;base64,$qrBase64" alt="Código QR para abrir $escapedTitle">
    <p><a href="$escapedUrl">$escapedUrl</a></p>
    <p class="note">$escapedNote</p>
  </main>
</body>
</html>
"@

    Set-Content -LiteralPath $viewerPath -Value $viewer -Encoding UTF8
    Start-Process $viewerPath
}

try {
    if ($Port -le 0) { $Port = Get-FreeTcpPort }

    $targetFile = Join-Path $RepoRoot ($TargetPath -replace '/', '\')
    if (-not (Test-Path -LiteralPath $targetFile)) {
        throw "No se encontró el laboratorio: $targetFile"
    }

    $Python = Get-PythonCommand
    $slug = (($Title -replace '[^A-Za-z0-9]+', '-').ToLowerInvariant()).Trim([char[]]'-')
    if (-not $slug) { $slug = 'logo-lab' }

    $serverOut = Join-Path $env:TEMP "$slug-server-out.log"
    $serverErr = Join-Path $env:TEMP "$slug-server-err.log"
    Remove-Item $serverOut, $serverErr -Force -ErrorAction SilentlyContinue

    $bindAddress = if ($PublicTunnel) { '127.0.0.1' } else { '0.0.0.0' }
    if (-not $PublicTunnel) { Ensure-FirewallRule -LocalPort $Port }

    $ServerProcess = Start-Process `
        -FilePath $Python `
        -ArgumentList @('-m', 'http.server', "$Port", '--bind', $bindAddress) `
        -WorkingDirectory $RepoRoot `
        -RedirectStandardOutput $serverOut `
        -RedirectStandardError $serverErr `
        -WindowStyle Hidden `
        -PassThru

    $localTargetUrl = "http://127.0.0.1:$Port/$TargetPath"
    Wait-ForLocalServer -Url $localTargetUrl

    if ($PublicTunnel) {
        $cloudflared = Get-CloudflaredPath
        $tunnelOut = Join-Path $env:TEMP "$slug-tunnel-out.log"
        $tunnelErr = Join-Path $env:TEMP "$slug-tunnel-err.log"
        Remove-Item $tunnelOut, $tunnelErr -Force -ErrorAction SilentlyContinue

        Write-Host 'Creando URL pública temporal...' -ForegroundColor Cyan
        $tunnel = Start-PublicTunnel `
            -Cloudflared $cloudflared `
            -LocalUrl "http://127.0.0.1:$Port" `
            -OutLog $tunnelOut `
            -ErrLog $tunnelErr

        $TunnelProcess = $tunnel.Process
        $url = "$($tunnel.PublicBase)/$TargetPath"
        $note = 'No necesitas compartir la misma red Wi-Fi. Mantén esta ventana abierta mientras lo visualizas.'
    }
    else {
        $ipAddress = Get-ActiveIPv4
        $url = "http://${ipAddress}:$Port/$TargetPath"
        $note = 'La computadora y el teléfono deben estar en la misma red Wi-Fi. Mantén esta ventana abierta mientras lo visualizas.'
    }

    Set-Clipboard -Value $url -ErrorAction SilentlyContinue
    New-QrViewer -Python $Python -Url $url -ViewerTitle $Title -Note $note -Slug $slug

    Write-Host ''
    Write-Host 'LABORATORIO LISTO' -ForegroundColor Green
    Write-Host "URL: $url" -ForegroundColor Cyan
    Write-Host 'La URL también quedó copiada al portapapeles.' -ForegroundColor White
    Write-Host 'Mantén esta ventana abierta. Presiona Enter cuando quieras cerrar el servidor y el túnel.' -ForegroundColor Yellow
    [void](Read-Host)
}
finally {
    foreach ($process in @($TunnelProcess, $ServerProcess)) {
        if ($process -and -not $process.HasExited) {
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
