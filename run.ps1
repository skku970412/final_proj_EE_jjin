Param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSCommandPath
$SetupScript = Join-Path $Root 'setup.ps1'

function Write-RunLog {
    Param([string]$Message)
    Write-Host "[run] $Message"
}

function Get-VenvPython {
    Param([string]$VenvPath)

    $windowsPython = Join-Path $VenvPath 'Scripts\python.exe'
    if (Test-Path $windowsPython) {
        return $windowsPython
    }

    $unixPython = Join-Path $VenvPath 'bin/python'
    if (Test-Path $unixPython) {
        return $unixPython
    }

    return $null
}

if (Test-Path $SetupScript) {
    Write-RunLog "setup.ps1 을 실행하여 의존성을 준비합니다."
    & $SetupScript
} else {
    Write-Warning "[run] setup.ps1 을 찾을 수 없어 의존성 확인을 건너뜁니다."
}

$VenvPath = Join-Path $Root '.venv'
$backendPython = Get-VenvPython -VenvPath $VenvPath
if (-not $backendPython) {
    $fallback = Get-Command python -ErrorAction SilentlyContinue
    if ($null -ne $fallback) {
        $backendPython = $fallback.Path
    }
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if ($null -eq $npm) {
    Write-Warning "[run] npm 명령을 찾을 수 없어 프론트엔드를 시작하지 않습니다."
}

function Get-LocalIPv4Addresses {
    try {
        return Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -notlike '127.*' -and
                $_.IPAddress -notlike '169.254.*'
            } |
            Select-Object -ExpandProperty IPAddress -Unique
    } catch {
        Write-RunLog ("로컬 IPv4 주소를 확인하지 못했습니다: {0}" -f $_.Exception.Message)
        return @()
    }
}

function Build-DefaultOrigins {
    Param(
        [string[]]$LocalIps,
        [string[]]$Ports = @("5173", "5174", "5175")
    )

    $origins = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($origin in @(
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:5175"
        )) {
        [void]$origins.Add($origin)
    }

    foreach ($ip in $LocalIps) {
        foreach ($port in $Ports) {
            [void]$origins.Add("http://$ip`:$port")
        }
    }

    return $origins
}

$localIps = Get-LocalIPv4Addresses
$defaultOrigins = Build-DefaultOrigins -LocalIps $localIps

if ([string]::IsNullOrWhiteSpace($env:AUTO_SEED_SESSIONS)) {
    $env:AUTO_SEED_SESSIONS = "1"
}
if ([string]::IsNullOrWhiteSpace($env:CORS_ORIGINS)) {
    $env:CORS_ORIGINS = ($defaultOrigins | Sort-Object) -join ","
}
if ([string]::IsNullOrWhiteSpace($env:VITE_API_BASE)) {
    $primaryIp = $localIps | Where-Object { $_ -and $_ -notlike '127.*' } | Select-Object -First 1
    if ($primaryIp) {
        $env:VITE_API_BASE = "http://$primaryIp`:8000"
    } else {
        $env:VITE_API_BASE = "http://localhost:8000"
    }
}
if ([string]::IsNullOrWhiteSpace($env:PLATE_SERVICE_URL)) {
    $env:PLATE_SERVICE_URL = "http://localhost:8001/v1/recognize"
}

Write-RunLog ("환경 변수 설정: AUTO_SEED_SESSIONS={0}, CORS_ORIGINS={1}, VITE_API_BASE={2}" -f `
    $env:AUTO_SEED_SESSIONS, $env:CORS_ORIGINS, $env:VITE_API_BASE)

Write-RunLog "필요 시 아래 명령으로 CORS_ORIGINS를 덮어쓴 뒤 다시 실행하세요."
Write-RunLog ('$env:CORS_ORIGINS = "{0}"' -f $env:CORS_ORIGINS)
Write-RunLog '.\run.ps1'

$processes = New-Object System.Collections.Generic.List[System.Diagnostics.Process]

function Start-ServiceProcess {
    Param(
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    Write-RunLog "$Name 프로세스를 시작합니다."
    $proc = Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -NoNewWindow -PassThru
    $script:processes.Add($proc) | Out-Null
}

Push-Location $Root
try {
    if ($backendPython -and (Test-Path (Join-Path $Root 'backend\requirements.txt'))) {
        Start-ServiceProcess -Name 'backend' -FilePath $backendPython -Arguments @(
            '-m', 'uvicorn', 'backend.app:app', '--reload', '--host', '0.0.0.0', '--port', '8000'
        ) -WorkingDirectory $Root
    } else {
        Write-Warning "[run] 백엔드 실행을 위한 Python 또는 requirements.txt 를 찾지 못했습니다."
    }

    if ($null -ne $npm) {
        foreach ($project in @('admin-front', 'user-front')) {
            $projPath = Join-Path $Root $project
            if (-not (Test-Path (Join-Path $projPath 'package.json'))) {
                Write-Warning "[run] $project/package.json 이 없어 실행을 건너뜁니다."
                continue
            }

            Start-ServiceProcess -Name $project -FilePath $npm.Path -Arguments @('run', 'dev', '--', '--host') -WorkingDirectory $projPath
        }
    }

    if ($processes.Count -eq 0) {
        throw "실행 가능한 프로세스가 없어 run.ps1 을 종료합니다."
    }

    $pids = $processes | ForEach-Object { $_.Id }
    Wait-Process -Id $pids
} finally {
    foreach ($proc in $processes) {
        if ($null -ne $proc -and -not $proc.HasExited) {
            try {
                Write-RunLog "프로세스 (Id=$($proc.Id)) 를 종료합니다."
                $proc.Kill()
            } catch {
                Write-Warning "[run] 프로세스 종료 중 오류: $($_.Exception.Message)"
            }
        }
    }
    Pop-Location
}
