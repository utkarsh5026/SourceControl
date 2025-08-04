# PowerShell setup script for SourceControl CLI on Windows

Write-Host "🚀 Setting up SourceControl CLI..." -ForegroundColor Green

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Host "✅ Node.js found: $nodeVersion" -ForegroundColor Green
}
catch {
    Write-Host "❌ Node.js not found. Please install Node.js from https://nodejs.org/" -ForegroundColor Red
    exit 1
}

# Check if npm is installed
try {
    $npmVersion = npm --version
    Write-Host "✅ npm found: $npmVersion" -ForegroundColor Green
}
catch {
    Write-Host "❌ npm not found. Please install npm." -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to install dependencies" -ForegroundColor Red
    exit 1
}

# Build the project
Write-Host "🔨 Building project..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

# Run tests
Write-Host "🧪 Running tests..." -ForegroundColor Yellow
npm test

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️ Some tests failed, but continuing..." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 Setup completed successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now run the CLI with:" -ForegroundColor Cyan
Write-Host "  node dist/cli.js --help" -ForegroundColor White
Write-Host ""
Write-Host "Or install globally with:" -ForegroundColor Cyan
Write-Host "  npm install -g ." -ForegroundColor White
Write-Host ""
Write-Host "For development:" -ForegroundColor Cyan
Write-Host "  npm run dev" -ForegroundColor White