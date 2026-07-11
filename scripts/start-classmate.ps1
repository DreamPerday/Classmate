$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logDirectory = Join-Path $root "tmp"
$logPath = Join-Path $logDirectory "classmate-launch.log"

Set-Location $root
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

if (-not (Test-Path (Join-Path $root "node_modules"))) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Classmate dependencies are not installed. Run npm install in the project directory first.",
        "Classmate",
        "OK",
        "Warning"
    ) | Out-Null
    exit 1
}

try {
    & rtk npm run dev -w @classmate/desktop *> $logPath
    if ($LASTEXITCODE -ne 0) {
        throw "Desktop process exited with code $LASTEXITCODE"
    }
} catch {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show(
        "Classmate could not start. See tmp/classmate-launch.log for details.",
        "Classmate",
        "OK",
        "Error"
    ) | Out-Null
    exit 1
}
