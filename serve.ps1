#requires -version 5.1
<#
  善驮论文工坊 v0.2.0 —— 本地静态服务器
  仅使用 Windows 自带 PowerShell，无需安装 Python / Node。
  只监听 127.0.0.1（本机回环），不对外网开放；关闭窗口即停止服务。

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1 -Open
    powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1 -Port 9000
    $env:PAPERLAB_NO_BROWSER=1  # 不自动打开浏览器（脚本化测试用）

  参数：
    -Port     起始端口，默认 8777；被占用时自动顺延，最多尝试 20 个端口
    -Open     启动后自动用默认浏览器打开
    -NoBrowser 不打开浏览器
#>
param(
  [int]$Port = 8777,
  [switch]$Open,
  [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootFull = [System.IO.Path]::GetFullPath($root).TrimEnd('\')

$mime = @{
  '.html'  = 'text/html; charset=utf-8'
  '.htm'   = 'text/html; charset=utf-8'
  '.css'   = 'text/css; charset=utf-8'
  '.js'    = 'application/javascript; charset=utf-8'
  '.json'  = 'application/json; charset=utf-8'
  '.md'    = 'text/markdown; charset=utf-8'
  '.txt'   = 'text/plain; charset=utf-8'
  '.svg'   = 'image/svg+xml'
  '.png'   = 'image/png'
  '.jpg'   = 'image/jpeg'
  '.jpeg'  = 'image/jpeg'
  '.gif'   = 'image/gif'
  '.ico'   = 'image/x-icon'
  '.woff'  = 'font/woff'
  '.woff2' = 'font/woff2'
  '.pdf'   = 'application/pdf'
}

function Test-PortFree {
  param([int]$p)
  $listener = $null
  try {
    $listener = New-Object System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, $p)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) { try { $listener.Stop() } catch { } }
  }
}

function Send-Response {
  param(
    [System.IO.Stream]$stream,
    [string]$status,
    [string]$contentType,
    [byte[]]$body,
    [bool]$headOnly
  )
  $header = "HTTP/1.1 $status`r`n" +
            "Content-Type: $contentType`r`n" +
            "Content-Length: $($body.Length)`r`n" +
            "Cache-Control: no-store`r`n" +
            "X-Content-Type-Options: nosniff`r`n" +
            "Connection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($hb, 0, $hb.Length)
  if (-not $headOnly -and $body.Length -gt 0) {
    $stream.Write($body, 0, $body.Length)
  }
  $stream.Flush()
}

$preferred = $Port
while (-not (Test-PortFree $Port) -and $Port -lt ($preferred + 20)) { $Port++ }
if (-not (Test-PortFree $Port)) {
  Write-Host "端口 $preferred 至 $($preferred + 20) 均被占用，请用 -Port 指定其他端口。" -ForegroundColor Red
  exit 1
}

$listener = New-Object System.Net.Sockets.TcpListener -ArgumentList @([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$url = "http://127.0.0.1:$Port/"

Write-Host ""
Write-Host "  善驮论文工坊 v0.2.0 · 本地服务器已启动" -ForegroundColor Cyan
Write-Host "  访问地址 : $url" -ForegroundColor Green
Write-Host "  文件目录 : $rootFull"
Write-Host "  按 Ctrl+C 或关闭本窗口即停止服务。" -ForegroundColor DarkGray
Write-Host ""

if ($Open -and -not $NoBrowser -and -not $env:PAPERLAB_NO_BROWSER) {
  try { Start-Process $url | Out-Null } catch { }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $null
    try {
      $client.ReceiveTimeout = 5000
      $stream = $client.GetStream()
      $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 4096, $true)

      $requestLine = $reader.ReadLine()
      while (($line = $reader.ReadLine()) -ne $null -and $line -ne '') { }

      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

      $tokens = $requestLine.Split(' ')
      if ($tokens.Length -lt 2) { continue }

      $method = $tokens[0].ToUpperInvariant()
      $headOnly = ($method -eq 'HEAD')
      if ($method -ne 'GET' -and -not $headOnly) {
        Send-Response $stream '405 Method Not Allowed' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('405 Method Not Allowed')) $false
        continue
      }

      $rawPath = ($tokens[1] -split '\?')[0]
      $rawPath = [System.Uri]::UnescapeDataString($rawPath)
      if ([string]::IsNullOrEmpty($rawPath) -or $rawPath -eq '/') { $rawPath = '/index.html' }

      $rel = $rawPath.TrimStart('/') -replace '/', '\'
      $full = [System.IO.Path]::GetFullPath((Join-Path $rootFull $rel))

      if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Response $stream '403 Forbidden' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes('403 Forbidden')) $headOnly
        continue
      }
      if ([System.IO.Directory]::Exists($full)) { $full = Join-Path $full 'index.html' }
      if (-not [System.IO.File]::Exists($full)) {
        Send-Response $stream '404 Not Found' 'text/plain; charset=utf-8' ([System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawPath")) $headOnly
        continue
      }

      $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
      $ctype = $mime[$ext]
      if (-not $ctype) { $ctype = 'application/octet-stream' }

      $bytes = [System.IO.File]::ReadAllBytes($full)
      Send-Response $stream '200 OK' $ctype $bytes $headOnly
    } catch {
      # 单个请求异常不影响服务器运行
    } finally {
      if ($stream) { try { $stream.Close() } catch { } }
      try { $client.Close() } catch { }
    }
  }
} finally {
  try { $listener.Stop() } catch { }
}
