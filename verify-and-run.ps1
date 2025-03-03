Write-Host "Checking build structure..."
$buildDir = "build/electron"
$preloadPath = "$buildDir/preload.js"
$mainPath = "$buildDir/main.js"

if (-not (Test-Path $buildDir)) {
    Write-Host "Creating build directory..."
    New-Item -ItemType Directory -Force -Path $buildDir
}

Write-Host "Compiling TypeScript files..."
npx tsc -p electron/tsconfig.json

if (Test-Path $preloadPath) {
    Write-Host "Preload script exists at: $preloadPath"
} else {
    Write-Host "Error: Preload script not found at: $preloadPath"
    exit 1
}

if (Test-Path $mainPath) {
    Write-Host "Main script exists at: $mainPath"
} else {
    Write-Host "Error: Main script not found at: $mainPath"
    exit 1
}

Write-Host "Starting Electron..."
$env:NODE_ENV = 'production'
./node_modules/.bin/electron .
