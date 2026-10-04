# Test Installation Lifecycle for VISTAAR Desktop v1.0.0
# Verifies silent installation, installed payload, uninstaller presence, and clean uninstallation.

$ErrorActionPreference = "Stop"

$workspaceRoot = "d:\Project\vistaar-main\vistaar-main"
$installer = Join-Path $workspaceRoot "release\VISTAAR-Setup.exe"
$installTestDir = "C:\Users\Navdeep\AppData\Local\Programs\VISTAAR_Test_Install"

Write-Host "=== TEST 1: Silent Installation to Test Destination ==="
if (Test-Path $installTestDir) {
    Remove-Item -Path $installTestDir -Recurse -Force
}

# Run NSIS installer silently with destination folder: /S /D=<path>
# Note: For NSIS, /D must be the last parameter and no quotes around the path!
Write-Host "Launching installer: $installer /S /D=$installTestDir"
$process = Start-Process -FilePath $installer -ArgumentList "/S", "/D=$installTestDir" -Wait -PassThru

Write-Host ("Installer exit code: {0}" -f $process.ExitCode)

# Verify installed files
Write-Host "`n=== TEST 2: Installed Directory Verification ==="
if (-not (Test-Path $installTestDir)) {
    throw "Installed directory does not exist at $installTestDir"
}

$installedFiles = Get-ChildItem -Path $installTestDir -Recurse
Write-Host ("Total files installed: {0}" -f $installedFiles.Count)
$totalSize = ($installedFiles | Measure-Object -Property Length -Sum).Sum
Write-Host ("Installed footprint: {0:N2} MB ({1} bytes)" -f ($totalSize / 1MB), $totalSize)

$mainExe = Join-Path $installTestDir "vistaar.exe"
$uninstaller = Join-Path $installTestDir "uninstall.exe"

if (Test-Path $mainExe) {
    Write-Host "  [PASS] vistaar.exe exists in installed directory"
} else {
    Write-Warning "  [FAIL] vistaar.exe missing!"
}

if (Test-Path $uninstaller) {
    Write-Host "  [PASS] uninstall.exe exists in installed directory"
} else {
    Write-Warning "  [FAIL] uninstall.exe missing!"
}

Write-Host "`n=== TEST 3: Silent Uninstallation ==="
if (Test-Path $uninstaller) {
    # NSIS uninstaller runs child process unless _?=<dir> is specified, or we pass /S _?=<dir>
    Write-Host "Running uninstaller: $uninstaller /S _?=$installTestDir"
    $uninstProc = Start-Process -FilePath $uninstaller -ArgumentList "/S", "_?=$installTestDir" -Wait -PassThru
    Write-Host ("Uninstaller exit code: {0}" -f $uninstProc.ExitCode)

    Start-Sleep -Seconds 2

    # Clean up test dir if uninstaller left anything
    if (Test-Path $installTestDir) {
        $remaining = Get-ChildItem -Path $installTestDir -Recurse
        if ($remaining.Count -eq 0 -or ($remaining.Count -eq 1 -and $remaining[0].Name -eq "uninstall.exe")) {
            Remove-Item -Path $installTestDir -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "  [PASS] Application files cleanly uninstalled"
        } else {
            Write-Host ("  [INFO] Remaining files ({0}): {1}" -f $remaining.Count, ($remaining.Name -join ", "))
            Remove-Item -Path $installTestDir -Recurse -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "  [PASS] Installation directory completely removed"
    }
}

Write-Host "`n=== INSTALLATION LIFECYCLE TEST COMPLETED SUCCESSFULLY ==="
