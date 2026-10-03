$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
$env:Path = "$userPath;$machinePath"

$env:JAVA_HOME = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User')
$env:ANDROID_HOME = [Environment]::GetEnvironmentVariable('ANDROID_HOME', 'User')
$env:ANDROID_SDK_ROOT = [Environment]::GetEnvironmentVariable('ANDROID_SDK_ROOT', 'User')

Write-Host "=== JAVA_HOME ==="
Write-Host $env:JAVA_HOME
Write-Host "`n=== ANDROID_HOME ==="
Write-Host $env:ANDROID_HOME
Write-Host "`n=== ANDROID_SDK_ROOT ==="
Write-Host $env:ANDROID_SDK_ROOT

Write-Host "`n=== 1. java -version ==="
& java -version

Write-Host "`n=== 2. javac -version ==="
& javac -version

Write-Host "`n=== 3. adb --version ==="
& adb --version

Write-Host "`n=== 4. sdkmanager --version ==="
& sdkmanager.bat --version
