param(
  [int]$Days = 30,
  [string]$ReportsPath = ".\reports"
)

$cutoff = (Get-Date).AddDays(-$Days)
Write-Host "Eliminando archivos en $ReportsPath anteriores a $cutoff (>$Days días)..."

Get-ChildItem -Path $ReportsPath -Recurse -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  ForEach-Object {
    Write-Host "Eliminando: $($_.FullName) (LastWrite: $($_.LastWriteTime))"
    Remove-Item -LiteralPath $_.FullName -Force
  }

Write-Host "Limpieza completada."
