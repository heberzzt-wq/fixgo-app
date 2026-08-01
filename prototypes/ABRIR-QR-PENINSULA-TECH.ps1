$ErrorActionPreference = 'Stop'

$Port = 8080
$PrototypeDir = $PSScriptRoot
$RepoRoot = Split-Path -Parent $PrototypeDir
$TargetPath = 'prototypes/peninsula-tech-logo-lab.html'

function Get-PythonCommand {
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }

    $python = Get-Command python -ErrorAction SilentlyContinue
    if ($python) { return $python.Source }

    throw 'No se encontró Python. Instala Python o usa el lanzador normal del laboratorio.'
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

function Ensure-FirewallRule {
    $ruleName = "Peninsula Tech QR Puerto $Port"
    $existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue

    if (-not $existing) {
        try {
            New-NetFirewallRule `
                -DisplayName $ruleName `
                -Direction Inbound `
                -Action Allow `
                -Protocol TCP `
                -LocalPort $Port `
                -Profile Private `
                -ErrorAction Stop | Out-Null
        }
        catch {
            Write-Host 'AVISO: Windows no permitió crear la regla del firewall automáticamente.' -ForegroundColor Yellow
            Write-Host 'Si aparece una ventana de seguridad, permite Python únicamente en redes privadas.' -ForegroundColor Yellow
        }
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

$Python = Get-PythonCommand
$IpAddress = Get-ActiveIPv4
$Url = "http://${IpAddress}:$Port/$TargetPath"
$QrPath = Join-Path $PrototypeDir 'peninsula-tech-qr.png'
$QrViewerPath = Join-Path $PrototypeDir 'peninsula-tech-qr.html'

Ensure-FirewallRule

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
    Start-Process `
        -FilePath $Python `
        -ArgumentList @('-m', 'http.server', "$Port", '--bind', '0.0.0.0') `
        -WorkingDirectory $RepoRoot `
        -WindowStyle Hidden

    Start-Sleep -Seconds 2
}

try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$Port/$TargetPath" -UseBasicParsing -TimeoutSec 5 | Out-Null
}
catch {
    throw "El servidor no respondió en el puerto $Port. Cierra otro programa que esté usando ese puerto y vuelve a ejecutar el lanzador."
}

Ensure-QrModule -Python $Python

& $Python -c "import qrcode,sys; qr=qrcode.QRCode(version=None,error_correction=qrcode.constants.ERROR_CORRECT_M,box_size=12,border=4); qr.add_data(sys.argv[1]); qr.make(fit=True); qr.make_image(fill_color='black',back_color='white').save(sys.argv[2])" $Url $QrPath
if ($LASTEXITCODE -ne 0 -or -not (Test-Path $QrPath)) {
    throw 'No se pudo crear la imagen QR.'
}

$escapedUrl = [System.Net.WebUtility]::HtmlEncode($Url)
$viewer = @"
<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR Península Tech</title>
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
    <h1>PENÍNSULA TECH</h1>
    <p>Escanea este código con el teléfono.</p>
    <img class="qr" src="peninsula-tech-qr.png" alt="Código QR para abrir Península Tech">
    <p><a href="$escapedUrl">$escapedUrl</a></p>
    <p class="note">La computadora y el teléfono deben estar en la misma red Wi-Fi. Mantén esta computadora encendida mientras lo visualizas.</p>
  </main>
</body>
</html>
"@

Set-Content -Path $QrViewerPath -Value $viewer -Encoding UTF8

Write-Host ''
Write-Host 'QR CREADO CORRECTAMENTE' -ForegroundColor Green
Write-Host "URL: $Url" -ForegroundColor Cyan
Write-Host 'Escanéalo con el teléfono conectado a la misma red Wi-Fi.' -ForegroundColor White
Write-Host ''

Start-Process $QrViewerPath
