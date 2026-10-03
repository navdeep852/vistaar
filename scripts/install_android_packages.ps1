$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = "C:\Users\Navdeep\AppData\Local\Programs\Java\jdk-17"
$env:ANDROID_HOME = "C:\Users\Navdeep\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\Navdeep\AppData\Local\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

$sdkManager = "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat"

Write-Host "Accepting all licenses..."
1..30 | ForEach-Object { "y" } | & $sdkManager --licenses

Write-Host "Installing platform-tools, platforms;android-36, and build-tools;36.0.0..."
1..10 | ForEach-Object { "y" } | & $sdkManager "platform-tools" "platforms;android-36" "build-tools;36.0.0"

Write-Host "Creating local.properties in android directory..."
$androidDir = "D:\Project\vistaar-main\vistaar-main\android"
$localProps = Join-Path $androidDir "local.properties"
$sdkDirFormatted = $env:ANDROID_HOME.Replace("\", "\\")
"sdk.dir=$sdkDirFormatted" | Out-File -FilePath $localProps -Encoding ascii -Force

Write-Host "Verifying installed packages..."
if (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe") {
    Write-Host "adb found:" (Get-Item "$env:ANDROID_HOME\platform-tools\adb.exe").FullName
}
if (Test-Path "$env:ANDROID_HOME\platforms\android-36") {
    Write-Host "platform android-36 found!"
}
if (Test-Path "$env:ANDROID_HOME\build-tools\36.0.0") {
    Write-Host "build-tools 36.0.0 found!"
}

Write-Host "=== SDK Component Installation Finished ==="
