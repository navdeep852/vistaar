$env:JAVA_HOME = "C:\Users\Navdeep\AppData\Local\Programs\Java\jdk-17"
$env:ANDROID_HOME = "C:\Users\Navdeep\AppData\Local\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:ANDROID_HOME\platform-tools;$env:Path"

Write-Host "=== 1. JAVA VERSION ==="
& "$env:JAVA_HOME\bin\java.exe" -version

Write-Host "`n=== 2. JAVAC VERSION ==="
& "$env:JAVA_HOME\bin\javac.exe" -version

Write-Host "`n=== 3. ADB VERSION ==="
& "$env:ANDROID_HOME\platform-tools\adb.exe" --version

Write-Host "`n=== 4. SDKMANAGER VERSION ==="
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --version
