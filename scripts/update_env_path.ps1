$currentPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$sdkTools = 'C:\Users\Navdeep\AppData\Local\Android\Sdk\platform-tools'
$cmdTools = 'C:\Users\Navdeep\AppData\Local\Android\Sdk\cmdline-tools\latest\bin'
$javaBin = 'C:\Users\Navdeep\AppData\Local\Programs\Java\jdk-21\bin'

$parts = $currentPath -split ';' | Where-Object { $_ -ne '' }
$toAdd = @($javaBin, $sdkTools, $cmdTools)

foreach ($dir in $toAdd) {
    if ($parts -notcontains $dir) {
        $parts = ,$dir + $parts
    }
}

$newPath = $parts -join ';'
[Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
Write-Host "Updated user Path: $newPath"
