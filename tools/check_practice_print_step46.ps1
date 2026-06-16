param(
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

$script:ErrorCount = 0
$script:WarningCount = 0

function Write-Ok {
  param([string]$Message)
  Write-Host ("[OK] " + $Message) -ForegroundColor Green
}

function Write-Info {
  param([string]$Message)
  Write-Host ("[INFO] " + $Message) -ForegroundColor Cyan
}

function Write-Warn2 {
  param([string]$Message)
  $script:WarningCount += 1
  Write-Host ("[WARN] " + $Message) -ForegroundColor Yellow
}

function Write-Error2 {
  param([string]$Message)
  $script:ErrorCount += 1
  Write-Host ("[ERROR] " + $Message) -ForegroundColor Red
}

function Get-ProjectRoot {
  $scriptFolder = $null

  if ($PSScriptRoot) {
    $scriptFolder = $PSScriptRoot
  } elseif ($MyInvocation.MyCommand.Path) {
    $scriptFolder = Split-Path -Parent $MyInvocation.MyCommand.Path
  }

  if ($scriptFolder) {
    $candidate = Resolve-Path (Join-Path $scriptFolder "..") -ErrorAction SilentlyContinue
    if ($candidate -and (Test-Path (Join-Path $candidate.Path "reading-test")) -and (Test-Path (Join-Path $candidate.Path "practice-print"))) {
      return $candidate.Path
    }
  }

  $current = (Get-Location).Path
  if ((Test-Path (Join-Path $current "reading-test")) -and (Test-Path (Join-Path $current "practice-print"))) {
    return $current
  }

  return $current
}

function Test-RequiredFile {
  param([string]$RelativePath)

  if (Test-Path $RelativePath -PathType Leaf) {
    Write-Ok "$RelativePath exists."
    return $true
  }

  Write-Error2 "$RelativePath not found."
  return $false
}

function Test-RequiredDir {
  param([string]$RelativePath)

  if (Test-Path $RelativePath -PathType Container) {
    Write-Ok "$RelativePath exists."
    return $true
  }

  Write-Error2 "$RelativePath not found."
  return $false
}

function Read-TextFile {
  param([string]$RelativePath)

  try {
    return Get-Content $RelativePath -Raw -Encoding UTF8
  } catch {
    Write-Error2 "Cannot read $RelativePath. $($_.Exception.Message)"
    return ""
  }
}

function Test-TextPattern {
  param(
    [string]$Label,
    [string]$Text,
    [string]$Pattern,
    [switch]$WarningOnly
  )

  if ($Text -match $Pattern) {
    Write-Ok $Label
    return $true
  }

  if ($WarningOnly) {
    Write-Warn2 $Label
  } else {
    Write-Error2 $Label
  }

  return $false
}

function Normalize-ImageReference {
  param([string]$Reference)

  $value = [string]$Reference
  $value = $value.Trim()

  if (-not $value) {
    return $null
  }

  if ($value -match "^(https?:|data:)") {
    return $null
  }

  $value = $value -replace "/", "\"
  $value = $value.TrimStart("\")

  if ($value -match "^\.\\images\\(.+)$") {
    return Join-Path "reading-test\images" $Matches[1]
  }

  if ($value -match "^images\\(.+)$") {
    return Join-Path "reading-test\images" $Matches[1]
  }

  if ($value -match "^(\.\.\\)?reading-test\\images\\(.+)$") {
    return Join-Path "reading-test\images" $Matches[2]
  }

  if ($value -match "^reading-test\\images\\(.+)$") {
    return $value
  }

  if ($value -match "\.(png|jpg|jpeg|webp|gif)$") {
    return $value
  }

  return $null
}

function Find-ImageRefs {
  param(
    [Parameter(ValueFromPipeline=$true)]
    $Node,
    [System.Collections.Generic.List[string]]$Result
  )

  if ($null -eq $Node) {
    return
  }

  if ($Node -is [string]) {
    return
  }

  if ($Node -is [System.Collections.IEnumerable] -and -not ($Node -is [string])) {
    foreach ($item in $Node) {
      Find-ImageRefs -Node $item -Result $Result
    }
    return
  }

  if ($Node.PSObject -and $Node.PSObject.Properties) {
    foreach ($prop in $Node.PSObject.Properties) {
      $name = [string]$prop.Name
      $value = $prop.Value

      if (($name -match "image") -and ($value -is [string]) -and ($value -match "\.(png|jpg|jpeg|webp|gif)")) {
        $normalized = Normalize-ImageReference $value
        if ($normalized) {
          $Result.Add($normalized)
        }
      }

      Find-ImageRefs -Node $value -Result $Result
    }
  }
}

$root = Get-ProjectRoot
Set-Location $root

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "TOPIK I STEP46 practice-print validation" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Info "Project root: $root"

# 1. Required files and folders
$requiredFiles = @(
  "practice-print\index.html",
  "practice-print\practice-print.js",
  "practice-print\README.txt",
  "reading-test\practice-print-link.js",
  "reading-test\index.html",
  "reading-test\data\bank\question-bank.json"
)

$requiredDirs = @(
  "practice-print",
  "reading-test",
  "reading-test\data\bank",
  "reading-test\images"
)

foreach ($dir in $requiredDirs) {
  Test-RequiredDir $dir | Out-Null
}

foreach ($file in $requiredFiles) {
  Test-RequiredFile $file | Out-Null
}

if ($script:ErrorCount -gt 0) {
  Write-Host ""
  Write-Host "Required file check failed. Fix missing files first." -ForegroundColor Red
}

# 2. Read operation files
$readingIndexText = ""
$linkText = ""
$practiceIndexText = ""
$practiceJsText = ""
$bankText = ""

if (Test-Path "reading-test\index.html") {
  $readingIndexText = Read-TextFile "reading-test\index.html"
}
if (Test-Path "reading-test\practice-print-link.js") {
  $linkText = Read-TextFile "reading-test\practice-print-link.js"
}
if (Test-Path "practice-print\index.html") {
  $practiceIndexText = Read-TextFile "practice-print\index.html"
}
if (Test-Path "practice-print\practice-print.js") {
  $practiceJsText = Read-TextFile "practice-print\practice-print.js"
}
if (Test-Path "reading-test\data\bank\question-bank.json") {
  $bankText = Read-TextFile "reading-test\data\bank\question-bank.json"
}

# 3. reading-test link checks
if ($readingIndexText) {
  Test-TextPattern "reading-test/index.html loads practice-print-link.js." $readingIndexText "practice-print-link\.js" | Out-Null

  $linkCount = ([regex]::Matches($readingIndexText, "practice-print-link\.js")).Count
  if ($linkCount -eq 1) {
    Write-Ok "practice-print-link.js is loaded once."
  } elseif ($linkCount -gt 1) {
    Write-Warn2 "practice-print-link.js appears $linkCount times. It should normally appear once."
  }
}

if ($linkText) {
  Test-TextPattern "practice-print-link.js keeps teacher print button text." $linkText "교사용 문제지 출력" | Out-Null
  Test-TextPattern "practice-print-link.js opens ../practice-print/index.html." $linkText "\.\./practice-print/index\.html" | Out-Null
  Test-TextPattern "practice-print-link.js does not change exam execution logic directly." $linkText "installPracticePrintLink" | Out-Null
}

# 4. practice-print/index.html checks
if ($practiceIndexText) {
  Test-TextPattern "practice-print/index.html has start number input." $practiceIndexText "id=""startNumberInput""" | Out-Null
  Test-TextPattern "practice-print/index.html has end number input." $practiceIndexText "id=""endNumberInput""" | Out-Null
  Test-TextPattern "practice-print/index.html has student print button." $practiceIndexText "id=""printStudentButton""" | Out-Null
  Test-TextPattern "practice-print/index.html has with-answer print button." $practiceIndexText "id=""printWithAnswerButton""" | Out-Null
  Test-TextPattern "practice-print/index.html has answer-only print button." $practiceIndexText "id=""printAnswerOnlyButton""" | Out-Null
  Test-TextPattern "practice-print/index.html hides top print meta line." $practiceIndexText "(?s)\.print-meta\s*\{.*?display\s*:\s*none\s*!important" | Out-Null
  Test-TextPattern "practice-print/index.html hides problem-title during answer-only printing." $practiceIndexText "(?s)body\.print-answer-only\s+\.print-title\s*\{.*?display\s*:\s*none\s*!important" | Out-Null
  Test-TextPattern "practice-print/index.html includes student answer sheet styles." $practiceIndexText "student-answer-sheet" | Out-Null
  Test-TextPattern "practice-print/index.html includes compact sentence-order print styles." $practiceIndexText "sentence-order-set" | Out-Null
  Test-TextPattern "practice-print/index.html loads practice-print.js." $practiceIndexText "practice-print\.js" | Out-Null
  Test-TextPattern "practice-print/index.html includes table-based student answer sheet CSS." $practiceIndexText "student-answer-table" | Out-Null
  Test-TextPattern "practice-print/index.html starts student answer sheet on a new page." $practiceIndexText "student-answer-sheet\s*\{[\s\S]*?page-break-before\s*:\s*always" | Out-Null
  Test-TextPattern "practice-print/index.html includes 40-question answer group CSS." $practiceIndexText "student-answer-group" | Out-Null
  Test-TextPattern "practice-print/index.html includes two-column answer sheet CSS." $practiceIndexText "student-answer-columns" | Out-Null
  Test-TextPattern "practice-print/index.html includes expanded answer bubble CSS." $practiceIndexText "student-answer-bubble" | Out-Null
}

# 5. practice-print.js checks
if ($practiceJsText) {
  Test-TextPattern "practice-print.js reads ../reading-test/data/bank/question-bank.json." $practiceJsText "\.\./reading-test/data/bank/question-bank\.json" | Out-Null
  Test-TextPattern "practice-print.js keeps TOPIK I 31~70 conversion logic." $practiceJsText "convertToDisplayNumber" | Out-Null
  Test-TextPattern "practice-print.js keeps sentence order label normalization." $practiceJsText "normalizeSentenceLabel" | Out-Null
  Test-TextPattern "practice-print.js renders order_choice_orders with ①②③④ order." $practiceJsText "renderOrderChoices" | Out-Null
  Test-TextPattern "practice-print.js uses getChoiceLabel(index), not raw option keys." $practiceJsText "getChoiceLabel\(index\)" | Out-Null
  Test-TextPattern "practice-print.js supports insert_positions/insert_markers." $practiceJsText "insert_positions|insert_markers" | Out-Null
  Test-TextPattern "practice-print.js hides duplicate text passage when common-passage image exists." $practiceJsText "shouldRenderGroupPassageText" | Out-Null
  Test-TextPattern "practice-print.js hides passage text when imageUrl is present." $practiceJsText "!normalizeImageUrl\(imageUrl\)" | Out-Null
  Test-TextPattern "practice-print.js assigns output-order question numbers for problem cards." $practiceJsText "assignPrintNumbers" | Out-Null
  Test-TextPattern "practice-print.js stores print_number on selected records." $practiceJsText "print_number" | Out-Null
  Test-TextPattern "practice-print.js formats TOPIK II-style question line numbers." $practiceJsText "formatQuestionLineNumber" | Out-Null
  Test-TextPattern "practice-print.js formats problem card headers with output-order numbers." $practiceJsText "formatPrintQuestionNumber" | Out-Null
  Test-TextPattern "practice-print.js removes duplicated shared passage for sentence-order sets." $practiceJsText "isSentenceOrderSet" | Out-Null
  Test-TextPattern "practice-print.js renders student answer recording sheet." $practiceJsText "renderStudentAnswerSheet" | Out-Null
  Test-TextPattern "practice-print.js prints answer choices ①②③④ on answer sheet." $practiceJsText "student-answer-choices" | Out-Null
  Test-TextPattern "practice-print.js renders answer sheet as a table for wider check spacing." $practiceJsText "student-answer-table" | Out-Null
  Test-TextPattern "practice-print.js renders each answer choice as a separate printable bubble." $practiceJsText "student-answer-bubble" | Out-Null
  Test-TextPattern "practice-print.js groups student answer sheet by 40 questions." $practiceJsText "chunkList\(indexedRecords,\s*40\)" | Out-Null
  Test-TextPattern "practice-print.js renders answer sheet range labels such as 1~40번." $practiceJsText "makePrintRangeLabel" | Out-Null
  Test-TextPattern "practice-print.js renders two-column answer tables." $practiceJsText "student-answer-columns" | Out-Null
  Test-TextPattern "practice-print.js recovers sentence-order items from passage/group_passage when sentence_items is missing." $practiceJsText "getFallbackSentenceItemsFromText|getSentenceOrderItems" | Out-Null
}

# 6. JavaScript syntax check when Node.js is available
if ($practiceJsText) {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) {
    Write-Info "Running node --check for practice-print.js ..."
    & node --check "practice-print\practice-print.js" | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "practice-print.js passed node --check."
    } else {
      Write-Error2 "practice-print.js failed node --check."
    }
  } else {
    Write-Warn2 "Node.js is not available. Skipped practice-print.js syntax check."
  }
}

# 7. question-bank JSON and image path checks
$bank = $null
if ($bankText) {
  try {
    $bank = $bankText | ConvertFrom-Json
    Write-Ok "question-bank.json is valid JSON."
  } catch {
    Write-Error2 "question-bank.json is not valid JSON. $($_.Exception.Message)"
  }
}

if ($bank) {
  $singleCount = 0
  $setCount = 0

  if ($bank.single_items) {
    $singleCount = @($bank.single_items).Count
  }
  if ($bank.passage_sets) {
    $setCount = @($bank.passage_sets).Count
  }

  if (($singleCount + $setCount) -gt 0) {
    Write-Ok "question-bank has single_items=$singleCount, passage_sets=$setCount."
  } else {
    Write-Error2 "question-bank has no single_items or passage_sets."
  }

  if ($bankText -match '"source_round"\s*:\s*"?83"?') {
    Write-Ok "question-bank includes 83회 items."
  } else {
    Write-Warn2 "question-bank does not appear to include 83회 items."
  }

  $imageRefs = New-Object System.Collections.Generic.List[string]
  Find-ImageRefs -Node $bank -Result $imageRefs

  $uniqueImages = @($imageRefs | Sort-Object -Unique)
  if ($uniqueImages.Count -gt 0) {
    Write-Info "Checking referenced images: $($uniqueImages.Count)"
    foreach ($img in $uniqueImages) {
      if (Test-Path $img -PathType Leaf) {
        Write-Ok "$img exists."
      } else {
        Write-Error2 "$img not found."
      }
    }
  } else {
    Write-Warn2 "No image references found in question-bank.json."
  }
}

# 8. Final summary
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "Validation summary" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ("Errors  : " + $script:ErrorCount)
Write-Host ("Warnings: " + $script:WarningCount)

if ($script:ErrorCount -gt 0) {
  Write-Host "Result: FAIL - fix errors before GitHub release." -ForegroundColor Red
  exit 1
}

if ($Strict -and $script:WarningCount -gt 0) {
  Write-Host "Result: FAIL - Strict mode treats warnings as errors." -ForegroundColor Red
  exit 1
}

Write-Host "Result: PASS - STEP46-9 practice-print final student answer sheet is ready." -ForegroundColor Green
exit 0
