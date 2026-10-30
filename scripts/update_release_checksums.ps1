$sourceInstaller = "D:\Project\vistaar-main\vistaar-main\src-tauri\target\release\bundle\nsis\VISTAAR_1.0.0_x64-setup.exe"
$releaseDir = "D:\Project\vistaar-main\vistaar-main\release"

Copy-Item -Path $sourceInstaller -Destination "$releaseDir\VISTAAR_1.0.0_x64-setup.exe" -Force
Copy-Item -Path $sourceInstaller -Destination "$releaseDir\VISTAAR-Setup.exe" -Force

$hash1 = (Get-FileHash "$releaseDir\VISTAAR-Setup.exe" -Algorithm SHA256).Hash.ToLower()
$hash2 = (Get-FileHash "$releaseDir\VISTAAR_1.0.0_x64-setup.exe" -Algorithm SHA256).Hash.ToLower()

$dateStr = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
$checksumContent = @"
# VISTAAR Desktop Release Checksums
# Generated: $dateStr

$hash1  VISTAAR-Setup.exe
$hash2  VISTAAR_1.0.0_x64-setup.exe
"@

Set-Content -Path "$releaseDir\checksums.txt" -Value $checksumContent -Encoding UTF8

Write-Host "Updated release installers and checksums.txt"
Write-Host "SHA256: $hash1"
Get-ChildItem -Path $releaseDir | Select-Object Name, Length, LastWriteTime | Format-Table -AutoSize
