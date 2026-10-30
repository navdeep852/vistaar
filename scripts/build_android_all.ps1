$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = "C:\Users\Navdeep\AppData\Local\Programs\Java\jdk-21"
$env:ANDROID_HOME = "C:\Users\Navdeep\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\Navdeep\AppData\Local\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$androidDir = "D:\Project\vistaar-main\vistaar-main\android"
Set-Location $androidDir

Write-Host "Executing: gradlew.bat assembleDebug bundleRelease assembleRelease"
& .\gradlew.bat assembleDebug bundleRelease assembleRelease

Write-Host "`nVerifying built artifacts..."
Get-ChildItem -Path "app\build\outputs" -Recurse -File -Include *.apk, *.aab | Select-Object Name, Length, LastWriteTime, FullName | Format-Table -AutoSize
