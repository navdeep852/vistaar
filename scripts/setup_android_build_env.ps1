# Setup script for JDK 17 and Android SDK in user-space (zero admin required)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$userPrograms = Join-Path $env:LOCALAPPDATA 'Programs'
$javaDir = Join-Path $userPrograms 'Java'
$jdkDest = Join-Path $javaDir 'jdk-17'
$androidSdkDir = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

Write-Host "Java Target: $jdkDest"
Write-Host "Android SDK Target: $androidSdkDir"

# 1. Download and Extract JDK 17 if not present
if (-not (Test-Path (Join-Path $jdkDest 'bin\java.exe'))) {
    Write-Host "Downloading Microsoft OpenJDK 17 zip..."
    if (-not (Test-Path $javaDir)) { New-Item -ItemType Directory -Path $javaDir -Force | Out-Null }
    
    $jdkZip = Join-Path $env:TEMP 'microsoft-jdk-17-windows-x64.zip'
    $jdkUrl = 'https://aka.ms/download-jdk/microsoft-jdk-17.0.12-windows-x64.zip'
    
    Write-Host "Fetching from $jdkUrl to $jdkZip using curl..."
    curl.exe -L -o $jdkZip $jdkUrl
    
    Write-Host "Extracting JDK 17..."
    $tempExtract = Join-Path $env:TEMP 'jdk_extract'
    if (Test-Path $tempExtract) { Remove-Item -Path $tempExtract -Recurse -Force }
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($jdkZip, $tempExtract)
    
    $extractedFolder = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
    if (Test-Path $jdkDest) { Remove-Item -Path $jdkDest -Recurse -Force }
    Move-Item -Path $extractedFolder.FullName -Destination $jdkDest
    
    Remove-Item -Path $jdkZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "JDK 17 installed successfully to $jdkDest"
} else {
    Write-Host "JDK 17 already exists at $jdkDest"
}

# 2. Verify Java
$javaExe = Join-Path $jdkDest 'bin\java.exe'
$javacExe = Join-Path $jdkDest 'bin\javac.exe'
Write-Host "Testing Java..."
& $javaExe -version
Write-Host "Testing Javac..."
& $javacExe -version

# Set permanent User environment variables for JAVA_HOME
[Environment]::SetEnvironmentVariable('JAVA_HOME', $jdkDest, 'User')
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$javaBin = Join-Path $jdkDest 'bin'
if ($userPath -notlike "*$javaBin*") {
    [Environment]::SetEnvironmentVariable('Path', "$javaBin;$userPath", 'User')
    Write-Host "Added $javaBin to User PATH"
}

# 3. Android Command-Line Tools
$cmdlineToolsDir = Join-Path $androidSdkDir 'cmdline-tools'
$latestToolsDir = Join-Path $cmdlineToolsDir 'latest'

if (-not (Test-Path (Join-Path $latestToolsDir 'bin\sdkmanager.bat'))) {
    Write-Host "Downloading Android Command-Line Tools..."
    if (-not (Test-Path $androidSdkDir)) { New-Item -ItemType Directory -Path $androidSdkDir -Force | Out-Null }
    
    $toolsZip = Join-Path $env:TEMP 'commandlinetools-win.zip'
    $toolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'
    
    Write-Host "Fetching from $toolsUrl to $toolsZip using curl..."
    curl.exe -L -o $toolsZip $toolsUrl
    
    Write-Host "Extracting Android Command-Line Tools..."
    $tempToolsExtract = Join-Path $env:TEMP 'tools_extract'
    if (Test-Path $tempToolsExtract) { Remove-Item -Path $tempToolsExtract -Recurse -Force }
    
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($toolsZip, $tempToolsExtract)
    
    # Structure must be cmdline-tools/latest/bin...
    if (-not (Test-Path $cmdlineToolsDir)) { New-Item -ItemType Directory -Path $cmdlineToolsDir -Force | Out-Null }
    if (Test-Path $latestToolsDir) { Remove-Item -Path $latestToolsDir -Recurse -Force }
    
    $extractedCmdline = Join-Path $tempToolsExtract 'cmdline-tools'
    Move-Item -Path $extractedCmdline -Destination $latestToolsDir
    
    Remove-Item -Path $toolsZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempToolsExtract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "Android Command-Line Tools installed to $latestToolsDir"
} else {
    Write-Host "Android Command-Line Tools already exist at $latestToolsDir"
}

# Set permanent User environment variables for Android
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $androidSdkDir, 'User')
[Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $androidSdkDir, 'User')

Write-Host "=== User-Space SDK & JDK Setup Completed ==="
