#requires -version 5.1
<#
  善驮论文工坊 —— 卸载脚本（免管理员）
  用法：双击 uninstall.bat，或 powershell -ExecutionPolicy Bypass -File uninstall.ps1
  说明：只删除程序文件、快捷方式与卸载登记；浏览器里的论文数据不会被删除。
  参数：-Silent 静默卸载（不询问、不输出）
#>
param(
  [switch]$Silent
)

$ErrorActionPreference = 'SilentlyContinue'
$target = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppTitle = '善驮论文工坊'
$LegacyTitle = '论文工坊 PaperLab'

function Say($msg, $color) {
  if ($Silent) { return }
  if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg }
}

Say ''
Say ('  ' + $AppTitle + ' · 卸载') 'Cyan'
Say "  安装目录：$target"
Say ''
if (-not $Silent) {
  $ans = Read-Host '  确认卸载？(Y/N)'
  if ($ans -notmatch '^(y|Y)') { Say '  已取消。'; exit 0 }
}

# 1. 结束正在运行的进程（含旧版本名）
foreach ($name in @($AppTitle, 'PaperLab')) {
  Get-Process -Name $name -ErrorAction SilentlyContinue | ForEach-Object {
    Say ('  结束进程 ' + $_.ProcessName + ' PID ' + $_.Id)
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Milliseconds 400

# 2. 删除快捷方式（新旧命名都清理）
$desktop = [Environment]::GetFolderPath('Desktop')
$programs = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$links = @(
  (Join-Path $desktop ($AppTitle + '.lnk')),
  (Join-Path $desktop ($LegacyTitle + '.lnk')),
  (Join-Path $programs ($AppTitle + '\' + $AppTitle + '.lnk')),
  (Join-Path $programs ('PaperLab\' + $LegacyTitle + '.lnk'))
)
foreach ($p in $links) {
  if (Test-Path $p) { Remove-Item $p -Force; Say "  已删除快捷方式：$p" }
}
foreach ($dir in @((Join-Path $programs $AppTitle), (Join-Path $programs 'PaperLab'))) {
  if (Test-Path $dir) { Remove-Item $dir -Recurse -Force }
}

# 3. 删除卸载登记（新旧键都清理）
foreach ($key in @($AppTitle, 'PaperLab')) {
  $regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $key
  if (Test-Path $regPath) { Remove-Item $regPath -Recurse -Force; Say ('  已移除卸载登记：' + $key) }
}

# 4. 删除安装目录（用独立进程延时删除，避免文件被占用）
Say '  正在删除程序文件…'
$cmd = 'ping -n 3 127.0.0.1 >nul & rd /s /q "' + $target + '"'
Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmd -WorkingDirectory $env:TEMP -WindowStyle Hidden

Say ''
Say '  卸载完成。论文数据仍在浏览器中（与 http://127.0.0.1:8777 绑定），' 'DarkGray'
Say '  如需彻底清理，请在浏览器设置中清除该站点的网站数据。' 'DarkGray'
Say ''
if (-not $Silent) { Start-Sleep -Seconds 2 }
