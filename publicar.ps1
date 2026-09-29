# Monta a pasta dist\ com SÓ o que vai para o Netlify: a página, css, js,
# imagens e _headers. Fica de fora o que não é do site (.git, .claude e este
# script).
#
# Uso (PowerShell, dentro da pasta painel):
#   .\publicar.ps1
# Depois arraste a pasta dist\ para https://app.netlify.com/drop — ou, num
# site já criado, para a área "Deploys" dele.

$ErrorActionPreference = 'Stop'
$raiz = $PSScriptRoot
$dist = Join-Path $raiz 'dist'

if (Test-Path $dist) { Remove-Item $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null

foreach ($item in @('index.html', 'movimentacoes.html', '_headers', 'css', 'js', 'img')) {
  Copy-Item (Join-Path $raiz $item) $dist -Recurse
}

Write-Host "Pronto: $dist"
Get-ChildItem $dist -Recurse -File | ForEach-Object { $_.FullName.Substring($dist.Length + 1) }
