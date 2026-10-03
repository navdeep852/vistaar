$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = "C:\Users\Navdeep\AppData\Local\Programs\Java\jdk-21"
$env:ANDROID_HOME = "C:\Users\Navdeep\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\Navdeep\AppData\Local\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$androidDir = "D:\Project\vistaar-main\vistaar-main\android"

Write-Host "Java version for build:"
& "$env:JAVA_HOME\bin\java.exe" -version

Write-Host "`nEntering Android directory: $androidDir"
Set-Location $androidDir

Write-Host "Executing: gradlew.bat assembleDebug"
& .\gradlew.bat assembleDebug

Write-Host "`nChecking output APK..."
$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apkPath) {
    $apkItem = Get-Item $apkPath
    $sizeMB = [math]::Round($apkItem.Length / 1MB, 2)
    Write-Host "SUCCESS! Debug APK generated:"
    Write-Host "Path: $($apkItem.FullName)"
    Write-Host "Size: $($apkItem.Length) bytes ($sizeMB MB)"
    Write-Host "Created: $($apkItem.CreationTime)"
} else {
    Write-Host "ERROR: APK not found at $apkPath"
}
