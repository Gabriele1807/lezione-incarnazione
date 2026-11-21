<#
  Verifica una presentazione (cartella con index.html + data.js) senza Python e senza installare nulla.
  Usa Edge o Chrome in modalità headless. Controlla:
    1. che ogni stringa di testo di data.js compaia identica nella pagina (e che le descrizioni `layout` non siano visibili);
    2. che nessuna scena esca dal palco (index.html?verifica) a 1920x1080 e a 1280x720.
  Uso (da qualunque cartella):
    powershell -ExecutionPolicy Bypass -File strumenti\verifica.ps1 [-Dir <cartella della presentazione>]
  Esce con codice 0 se tutto è a posto, 1 altrimenti.
#>
param([string]$Dir = (Split-Path -Parent $PSScriptRoot))

$ErrorActionPreference = 'Stop'
$Dir = (Resolve-Path $Dir).Path
if (-not (Test-Path "$Dir\index.html")) { Write-Host "ERRORE: manca index.html in $Dir" -ForegroundColor Red; exit 1 }
if (-not (Test-Path "$Dir\data.js"))    { Write-Host "ERRORE: manca data.js in $Dir" -ForegroundColor Red; exit 1 }

$browser = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) { Write-Host 'ERRORE: né Edge né Chrome trovati.' -ForegroundColor Red; exit 1 }

$tmp = Join-Path $env:TEMP ('verifica_' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $tmp | Out-Null
$uri = { param($p) ([Uri]$p).AbsoluteUri }
function Dump($url, $size, $budget) {
  $out = Join-Path $tmp ([guid]::NewGuid().ToString('N') + '.html')
  Start-Process $browser -ArgumentList '--headless=new', '--disable-gpu', "--window-size=$size", "--virtual-time-budget=$budget", '--dump-dom', "--user-data-dir=$tmp\prof", $url `
    -RedirectStandardOutput $out -RedirectStandardError "$out.err" -NoNewWindow -Wait
  return [IO.File]::ReadAllText($out, [Text.Encoding]::UTF8)
}
$bad = 0

# ---------- 1 · testi ----------
$probe = Join-Path $Dir '_verifica_testi.html'
$inject = @'
<script>
(function () {
  const KEYS = new Set(['sec','title','s','l','r','h','cap','rows','ar','hl','tr','m','who','fork','q','em','bism','v']);
  const want = [], layouts = [];
  (function walk(o, key) {
    if (typeof o === 'string') { if (key === 'layout') layouts.push(o); else if (KEYS.has(key) && o.trim()) want.push([key, o]); }
    else if (Array.isArray(o)) o.forEach(x => walk(x, key));
    else if (o && typeof o === 'object') for (const k in o) walk(o[k], k);
  })(window.SCENES, '');
  const b = document.body.cloneNode(true);
  b.querySelectorAll('script,style,#vt').forEach(e => e.remove());
  const T = b.textContent;
  const miss = want.filter(([k, s]) => !T.includes(s));
  const leak = layouts.filter(s => T.includes(s));
  const pre = document.createElement('pre'); pre.id = 'vt';
  pre.textContent = JSON.stringify({ total: want.length, miss: miss.map(m => m[0] + ': ' + m[1]), leak: leak.length });
  document.body.appendChild(pre);
})();
</script>
'@
try {
  $h = [IO.File]::ReadAllText("$Dir\index.html", [Text.Encoding]::UTF8) -replace '</body>', ($inject + '</body>')
  [IO.File]::WriteAllText($probe, $h, (New-Object Text.UTF8Encoding $false))
  $dom = Dump (& $uri $probe) '1600,900' 6000
  $m = [regex]::Match($dom, '<pre id="vt">([\s\S]*?)</pre>')
  if (-not $m.Success) { Write-Host 'ERRORE: la pagina non ha prodotto il risultato del controllo testi (errore in data.js o app.js?).' -ForegroundColor Red; $bad++ }
  else {
    $r = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value) | ConvertFrom-Json
    $found = $r.total - @($r.miss).Count
    Write-Host ("Testi: {0}/{1} stringhe di data.js trovate identiche nella pagina" -f $found, $r.total)
    foreach ($x in $r.miss) { Write-Host "  MANCANTE  $x" -ForegroundColor Red }
    if ($r.leak -gt 0) { Write-Host "  ATTENZIONE: $($r.leak) descrizioni 'layout' visibili nella pagina" -ForegroundColor Red }
    if ($r.total -eq 0) { Write-Host '  ERRORE: data.js non contiene testi (SCENES vuoto o errore di sintassi in data.js).' -ForegroundColor Red; $bad++ }
    if (@($r.miss).Count -or $r.leak -gt 0) { $bad++ }
  }
} finally { Remove-Item $probe -Force -ErrorAction SilentlyContinue }

# ---------- 2 · nessuna scena fuori dal palco ----------
foreach ($sz in '1920,1080', '1280,720') {
  $dom = Dump ((& $uri "$Dir\index.html") + '?verifica') $sz 15000
  $m = [regex]::Match($dom, '<pre id="verifica"[^>]*>([\s\S]*?)</pre>')
  if (-not $m.Success) { Write-Host "Scene @ $sz : ERRORE, nessun risultato (?verifica non attivo?)" -ForegroundColor Red; $bad++; continue }
  $lines = [Net.WebUtility]::HtmlDecode($m.Groups[1].Value) -split "`r?`n" | Where-Object { $_.Trim() }
  $nok = @($lines | Where-Object { $_.Trim() -notmatch ': ok$' })
  Write-Host ("Scene @ {0,-9}: {1} controllate, {2} con problemi" -f $sz, $lines.Count, $nok.Count)
  foreach ($x in $nok) { Write-Host "  $x" -ForegroundColor Red }
  if ($nok.Count) { $bad++ }
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
if ($bad) { Write-Host 'ESITO: ERRORI' -ForegroundColor Red; exit 1 } else { Write-Host 'ESITO: OK' -ForegroundColor Green; exit 0 }
