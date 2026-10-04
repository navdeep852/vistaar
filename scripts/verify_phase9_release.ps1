# Verify Phase 9 Release Artifacts and Generate Checksums

$ErrorActionPreference = "Stop"

$workspaceRoot = "d:\Project\vistaar-main\vistaar-main"
$exePath = Join-Path $workspaceRoot "src-tauri\target\release\vistaar.exe"
$installerSource = Join-Path $workspaceRoot "src-tauri\target\release\bundle\nsis\VISTAAR_1.0.0_x64-setup.exe"
$releaseDir = Join-Path $workspaceRoot "release"
$releaseInstaller = Join-Path $releaseDir "VISTAAR-Setup.exe"
$checksumFile = Join-Path $releaseDir "checksums.txt"

Write-Host "=== 1. Checking Binary and Installer Existence ==="
if (-not (Test-Path $exePath)) {
    throw "Executable not found at $exePath"
}
if (-not (Test-Path $installerSource)) {
    throw "Installer not found at $installerSource"
}

$exeItem = Get-Item $exePath
$installerItem = Get-Item $installerSource

Write-Host ("Executable: {0} ({1:N2} MB, {2} bytes)" -f $exeItem.Name, ($exeItem.Length / 1MB), $exeItem.Length)
Write-Host ("Installer:  {0} ({1:N2} MB, {2} bytes)" -f $installerItem.Name, ($installerItem.Length / 1MB), $installerItem.Length)

Write-Host "`n=== 2. Version Information ==="
$exeVi = $exeItem.VersionInfo
Write-Host ("Executable FileVersion:    {0}" -f $exeVi.FileVersion)
Write-Host ("Executable ProductVersion: {0}" -f $exeVi.ProductVersion)
Write-Host ("Executable ProductName:    {0}" -f $exeVi.ProductName)
Write-Host ("Executable CompanyName:    {0}" -f $exeVi.CompanyName)
Write-Host ("Executable Description:    {0}" -f $exeVi.FileDescription)
Write-Host ("Executable LegalCopyright: {0}" -f $exeVi.LegalCopyright)

Write-Host "`n=== 3. Staging to release/ Directory ==="
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

Copy-Item -Path $installerSource -Destination $releaseInstaller -Force
Copy-Item -Path $installerSource -Destination (Join-Path $releaseDir "VISTAAR_1.0.0_x64-setup.exe") -Force

Write-Host "Copied installer to: $releaseInstaller"

Write-Host "`n=== 4. Calculating SHA-256 Checksums ==="
$hashResult = Get-FileHash -Path $releaseInstaller -Algorithm SHA256
$hashString = $hashResult.Hash.ToLower()

$checksumContent = @"
# VISTAAR Desktop v1.0.0 Release Checksums (SHA-256)
# Generated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC")

$hashString *VISTAAR-Setup.exe
$hashString *VISTAAR_1.0.0_x64-setup.exe
"@

Set-Content -Path $checksumFile -Value $checksumContent -Encoding UTF8
Write-Host ("SHA256: {0}  VISTAAR-Setup.exe" -f $hashString)
Write-Host "Wrote checksums to $checksumFile"
