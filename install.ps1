#requires -version 5.1
<#
  善驮论文工坊 —— 安装脚本（免管理员）
  用法：
    install.bat                              交互安装（推荐）
    powershell -ExecutionPolicy Bypass -File install.ps1
    powershell -ExecutionPolicy Bypass -File install.ps1 -Target "D:\Apps\善驮论文工坊"
  可选参数：
    -Target <dir>      安装目录，默认 %LOCALAPPDATA%\Programs\善驮论文工坊
    -NoShortcuts       不创建桌面/开始菜单快捷方式
    -NoRegistry        不写卸载登记（控制面板里看不到）
    -NoLaunch          安装后不自动启动
    -Silent            静默（不输出提示）
    -ShortcutRoot <d>  快捷方式创建目录（测试用，默认桌面与开始菜单）
#>
param(
  [string]$Target = (Join-Path $env:LOCALAPPDATA 'Programs\善驮论文工坊'),
  [switch]$NoShortcuts,
  [switch]$NoRegistry,
  [switch]$NoLaunch,
  [switch]$Silent,
  [string]$ShortcutRoot = ''
)

$ErrorActionPreference = 'Stop'
$Source = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExeName = '善驮论文工坊.exe'
$AppTitle = '善驮论文工坊'
$AppVersion = '0.2.0'

function Say($msg, $color) {
  if ($Silent) { return }
  if ($color) { Write-Host $msg -ForegroundColor $color } else { Write-Host $msg }
}

Say ''
Say ('  ' + $AppTitle + ' v' + $AppVersion + ' · 安装程序') 'Cyan'
Say '  ----------------------------------------'

if (-not (Test-Path (Join-Path $Source 'index.html'))) {
  Say '  [错误] 当前目录缺少 index.html，请把安装包解压完整后再运行。' 'Red'
  exit 1
}
if (-not (Test-Path (Join-Path $Source $ExeName))) {
  Say ('  [提示] 未找到 ' + $ExeName + '，将使用 run.bat 作为启动入口。') 'Yellow'
}

# ---------- 1. 复制文件 ----------
Say ('  [1/4] 安装到：' + $Target)
if ($Target.StartsWith($Source, [StringComparison]::OrdinalIgnoreCase)) {
  Say '  [错误] 安装目录不能是源目录本身，请换一个路径。' 'Red'
  exit 1
}
if (Test-Path $Target) {
  Say '        已存在同名目录，将覆盖程序文件（不影响浏览器中的论文数据）。'
  Remove-Item $Target -Recurse -Force
}
New-Item -ItemType Directory -Path $Target -Force | Out-Null

$exclude = @('src', 'install.bat', 'install.ps1', 'uninstall.bat', 'uninstall.ps1', 'PaperLab.exe')
Get-ChildItem -Path $Source -Force | Where-Object { $exclude -notcontains $_.Name } | ForEach-Object {
  Copy-Item -Path $_.FullName -Destination $Target -Recurse -Force
}
Copy-Item -Path (Join-Path $Source 'uninstall.bat') -Destination $Target -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $Source 'uninstall.ps1') -Destination $Target -Force -ErrorAction SilentlyContinue

$sizeKb = [math]::Round(((Get-ChildItem $Target -Recurse -File | Measure-Object -Property Length -Sum).Sum) / 1KB)

# ---------- 2. 快捷方式 ----------
if (-not $NoShortcuts) {
  Say '  [2/4] 创建快捷方式'
  $exePath = Join-Path $Target $ExeName
  $batPath = Join-Path $Target 'run.bat'
  $targetPath = if (Test-Path $exePath) { $exePath } else { $batPath }

  $desktop = if ($ShortcutRoot) { $ShortcutRoot } else { [Environment]::GetFolderPath('Desktop') }
  $startMenu = if ($ShortcutRoot) { Join-Path $ShortcutRoot 'StartMenu' } else {
    Join-Path $env:APPDATA ('Microsoft\Windows\Start Menu\Programs\' + $AppTitle)
  }

  foreach ($dir in @($desktop, $startMenu)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  }

  $ws = New-Object -ComObject WScript.Shell
  foreach ($link in @((Join-Path $desktop ($AppTitle + '.lnk')), (Join-Path $startMenu ($AppTitle + '.lnk')))) {
    $sc = $ws.CreateShortcut($link)
    $sc.TargetPath = $targetPath
    $sc.WorkingDirectory = $Target
    $sc.Description = $AppTitle + ' · 从选题到成稿'
    if (Test-Path $exePath) { $sc.IconLocation = "$exePath,0" }
    $sc.Save()
  }
  Say ('        桌面：' + $desktop)
  Say ('        开始菜单：' + $startMenu)
} else {
  Say '  [2/4] 跳过快捷方式'
}

# ---------- 3. 卸载登记 ----------
if (-not $NoRegistry) {
  Say '  [3/4] 写入卸载登记（当前用户，无需管理员）'
  $legacy = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\PaperLab'
  if (Test-Path $legacy) { Remove-Item $legacy -Recurse -Force -ErrorAction SilentlyContinue }

  $regPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\' + $AppTitle
  New-Item -Path $regPath -Force | Out-Null
  Set-ItemProperty -Path $regPath -Name 'DisplayName' -Value $AppTitle
  Set-ItemProperty -Path $regPath -Name 'DisplayVersion' -Value $AppVersion
  Set-ItemProperty -Path $regPath -Name 'Publisher' -Value 'Local trial build'
  Set-ItemProperty -Path $regPath -Name 'InstallLocation' -Value $Target
  Set-ItemProperty -Path $regPath -Name 'DisplayIcon' -Value (Join-Path $Target $ExeName)
  Set-ItemProperty -Path $regPath -Name 'UninstallString' -Value ('"' + (Join-Path $Target 'uninstall.bat') + '"')
  Set-ItemProperty -Path $regPath -Name 'NoModify' -Value 1 -Type DWord
  Set-ItemProperty -Path $regPath -Name 'NoRepair' -Value 1 -Type DWord
  Set-ItemProperty -Path $regPath -Name 'EstimatedSize' -Value $sizeKb -Type DWord
  Say '        可在「设置 → 应用 → 已安装的应用」中卸载'
} else {
  Say '  [3/4] 跳过卸载登记'
}

Say ('  [4/4] 完成，占用约 ' + $sizeKb + ' KB')
Say ''

if (-not $NoLaunch) {
  $launch = Join-Path $Target $ExeName
  if (Test-Path $launch) {
    Say ('  正在启动 ' + $AppTitle + '（浏览器会自动打开 http://127.0.0.1:8777/）') 'Green'
    Start-Process -FilePath $launch -WorkingDirectory $Target
  } else {
    Say '  请双击安装目录下的 run.bat 启动。' 'Green'
  }
}

Say '  数据说明：论文内容保存在浏览器的 localStorage（与 http://127.0.0.1:8777 绑定），' 'DarkGray'
Say '  卸载程序不会删除浏览器数据；重要稿件请用「项目总览 → 导出项目 JSON」备份。' 'DarkGray'
Say ''
