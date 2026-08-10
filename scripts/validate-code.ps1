# Script de Validador de Sintaxe e Integridade - Controle de Squads

$ErrorActionPreference = "Stop"

function Check-JsSyntax {
    param([string]$filePath)
    
    if (-not (Test-Path $filePath)) {
        Write-Host "Arquivo nao encontrado: $filePath"
        return $true
    }

    $lines = Get-Content -Path $filePath
    $cleanCodeBuilder = New-Object System.Text.StringBuilder

    foreach ($line in $lines) {
        $cleanLine = $line -replace '//.*$', ''
        [void]$cleanCodeBuilder.AppendLine($cleanLine)
    }

    $content = $cleanCodeBuilder.ToString()
    
    $openBraces = ($content | Select-String -Pattern '\{' -AllMatches).Matches.Count
    $closeBraces = ($content | Select-String -Pattern '\}' -AllMatches).Matches.Count
    
    $openParens = ($content | Select-String -Pattern '\(' -AllMatches).Matches.Count
    $closeParens = ($content | Select-String -Pattern '\)' -AllMatches).Matches.Count

    $openBrackets = ($content | Select-String -Pattern '\[' -AllMatches).Matches.Count
    $closeBrackets = ($content | Select-String -Pattern '\]' -AllMatches).Matches.Count

    Write-Host "Analisando arquivo: $filePath"
    Write-Host "   Chaves { }: $openBraces / $closeBraces"
    Write-Host "   Parenteses ( ): $openParens / $closeParens"
    Write-Host "   Colchetes [ ]: $openBrackets / $closeBrackets"

    if ($openBraces -ne $closeBraces) {
        Write-Host "ERRO DE SINTAXE: Desbalanceamento de chaves em $filePath ($openBraces vs $closeBraces)"
        return $false
    }
    if ($openParens -ne $closeParens) {
        Write-Host "ERRO DE SINTAXE: Desbalanceamento de parenteses em $filePath ($openParens vs $closeParens)"
        return $false
    }
    if ($openBrackets -ne $closeBrackets) {
        Write-Host "ERRO DE SINTAXE: Desbalanceamento de colchetes em $filePath ($openBrackets vs $closeBrackets)"
        return $false
    }

    $matches = [regex]::Matches($content, "\}\s*(?!else|catch|finally|while|if|for|switch)[a-zA-Z0-9_]+\s*\([^)]*\)\s*\{")
    if ($matches.Count -gt 0) {
        Write-Host "ERRO DE SINTAXE: Possivel falta de virgula entre metodos em $filePath"
        foreach ($m in $matches) {
            Write-Host "   Trecho suspeito: $($m.Value)"
        }
        return $false
    }

    Write-Host "Arquivo $filePath validado com sucesso!"
    return $true
}

$filesToValidate = @("app.js", "rpa-pendencies.js", "jira-sync.js")
$allValid = $true

foreach ($file in $filesToValidate) {
    $res = Check-JsSyntax -filePath $file
    if (-not $res) {
        $allValid = $false
    }
}

if (-not $allValid) {
    Write-Host "VALIDACAO FALHOU: Corrija os erros acima antes de realizar o deploy!"
    exit 1
} else {
    Write-Host "VALIDACAO CONCLUIDA COM SUCESSO: O codigo esta 100% integro!"
    exit 0
}
