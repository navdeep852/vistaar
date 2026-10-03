$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$javaDir = "C:\Users\Navdeep\AppData\Local\Programs\Java"
$jdk21Dest = Join-Path $javaDir "jdk-21"

Write-Host "Target JDK 21 directory: $jdk21Dest"

if (-not (Test-Path (Join-Path $jdk21Dest "bin\java.exe"))) {
    $zipPath = Join-Path $env:TEMP "microsoft-jdk-21.zip"
    $url = "https://aka.ms/download-jdk/microsoft-jdk-21.0.4-windows-x64.zip"
    
    Write-Host "Downloading Microsoft OpenJDK 21 via curl..."
    curl.exe -L -o $zipPath $url
    
    Write-Host "Extracting JDK 21..."
    $tempExtract = Join-Path $env:TEMP "jdk21_extract"
    if (Test-Path $tempExtract) { Remove-Item -Path $tempExtract -Recurse -Force }
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $tempExtract)
    
    $extractedFolder = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
    if (Test-Path $jdk21Dest) { Remove-Item -Path $jdk21Dest -Recurse -Force }
    Move-Item -Path $extractedFolder.FullName -Destination $jdk21Dest
    
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "JDK 21 extracted successfully to $jdk21Dest"
} else {
    Write-Host "JDK 21 already exists."
}

# Verify JDK 21
Write-Host "Testing Java 21..."
& (Join-Path $jdk21Dest "bin\java.exe") -version
& (Join-Path $jdk21Dest "bin\javac.exe") -version

# Update permanent User environment variable
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdk21Dest, 'User')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$java21Bin = Join-Path $jdk21Dest 'bin'
if ($userPath -notlike "*$java21Bin*") {
    [Environment]::SetEnvironmentVariable('Path', "$java21Bin;$userPath", 'User')
}

Write-Host "=== OpenJDK 21 Setup Completed ==="
