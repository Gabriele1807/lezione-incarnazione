<#
  Fa uno screenshot di una scena (o della vista d'insieme) per controllarla a occhio.
  Uso:
    powershell -ExecutionPolicy Bypass -File strumenti\scatta.ps1 -Scena 12 -Out C:\temp\s12.png
    ... -Scena mappa   (vista d'insieme)      ... -Scena fine   (mappa finale)
  Opzioni: -Dir <cartella della presentazione>  -Size 1600,900   -Animato (senza ?statico: le animazioni CSS
  restano però ferme a metà in headless; per le transizioni controlla lo stato nel DOM, non lo screenshot)
  Il numero è la posizione della slide (1, 2, 3… come nell'indice `I` del sito).
#>
param(
  [Parameter(Mandatory = $true)][string]$Scena,
  [Parameter(Mandatory = $true)][string]$Out,
  [string]$Dir = (Split-Path -Parent $PSScriptRoot),
  [string]$Size = '1600,900',
  [switch]$Animato
)
$Dir = (Resolve-Path $Dir).Path
$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host 'ERRORE: né Edge né Chrome trovati.' -ForegroundColor Red; exit 1 }
$q = if ($Animato) { '' } else { '?statico' }
$hash = switch -Regex ($Scena) { '^mappa$' { '' } '^fine$' { '#fine' } default { "#$Scena" } }
$url = ([Uri]"$Dir\index.html").AbsoluteUri + $q + $hash
$tmp = Join-Path $env:TEMP ('scatta_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
$outFull = [IO.Path]::GetFullPath($Out)
Start-Process $browser -ArgumentList '--headless=new', '--disable-gpu', '--hide-scrollbars', "--window-size=$Size", '--virtual-time-budget=4000', "--screenshot=$outFull", "--user-data-dir=$tmp", $url `
  -RedirectStandardError "$tmp.err" -RedirectStandardOutput "$tmp.out" -NoNewWindow -Wait
Remove-Item $tmp, "$tmp.err", "$tmp.out" -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path $outFull) { Write-Host "Salvato: $outFull" } else { Write-Host 'ERRORE: screenshot non creato' -ForegroundColor Red; exit 1 }
