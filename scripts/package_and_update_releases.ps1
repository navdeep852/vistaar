$sourceExe = "D:\Project\vistaar-main\vistaar-main\src-tauri\target\release\bundle\nsis\VISTAAR_1.0.1_x64-setup.exe"
$sourceApk = "D:\Project\vistaar-main\vistaar-main\android\app\build\outputs\apk\debug\app-debug.apk"

$repoRelease = "D:\Project\vistaar-main\vistaar-main\release"
$artifactRelease = "C:\Users\Navdeep\.gemini\antigravity\brain\423c1909-bce8-42f9-9315-a88782e7ecfb\release"

if (!(Test-Path $artifactRelease)) {
    New-Item -ItemType Directory -Path $artifactRelease -Force | Out-Null
}

# 1. Copy to repo release directory
Copy-Item $sourceExe "$repoRelease\VISTAAR_1.0.1_x64-setup.exe" -Force
Copy-Item $sourceExe "$repoRelease\VISTAAR-Setup.exe" -Force
Copy-Item $sourceApk "$repoRelease\VISTAAR_1.0.1_mobile-debug.apk" -Force
Copy-Item $sourceApk "$repoRelease\VISTAAR-Android-Latest.apk" -Force

# 2. Copy to artifact directory
Copy-Item $sourceExe "$artifactRelease\VISTAAR_1.0.1_x64-setup.exe" -Force
Copy-Item $sourceExe "$artifactRelease\VISTAAR-Setup.exe" -Force
Copy-Item $sourceApk "$artifactRelease\VISTAAR_1.0.1_mobile-debug.apk" -Force
Copy-Item $sourceApk "$artifactRelease\VISTAAR-Android-Latest.apk" -Force

# 3. Calculate hashes
$hashExe = (Get-FileHash "$repoRelease\VISTAAR-Setup.exe" -Algorithm SHA256).Hash.ToLower()
$hashApk = (Get-FileHash "$repoRelease\VISTAAR-Android-Latest.apk" -Algorithm SHA256).Hash.ToLower()
$dateStr = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")

$checksumContent = @"
# VISTAAR Official Release Checksums
# Generated: $dateStr
# Platform: Windows x64 Desktop & Android Mobile

$hashExe  VISTAAR-Setup.exe
$hashExe  VISTAAR_1.0.1_x64-setup.exe
$hashApk  VISTAAR-Android-Latest.apk
$hashApk  VISTAAR_1.0.1_mobile-debug.apk
"@

Set-Content -Path "$repoRelease\checksums.txt" -Value $checksumContent -Encoding UTF8
Set-Content -Path "$artifactRelease\checksums.txt" -Value $checksumContent -Encoding UTF8

Write-Host "Releases copied and checksums updated successfully!"
Write-Host "Windows Desktop Setup SHA256: $hashExe"
Write-Host "Android Debug APK SHA256:      $hashApk"
