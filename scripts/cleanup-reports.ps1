param(
  [int]$Days = 30,
  [string]$ReportsPath = ".\reports"
)

$cutoff = (Get-Date).AddDays(-$Days)
Write-Host "Removing files in $ReportsPath older than $cutoff (>$Days days)..."

Get-ChildItem -Path $ReportsPath -Recurse -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Write-Host "Removing: $($_.FullName) (LastWrite: $($_.LastWriteTime))"
    Remove-Item -LiteralPath $_.FullName -Force
  }

Write-Host "Cleanup completed."
