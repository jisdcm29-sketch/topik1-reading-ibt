param(
  [switch]$Strict
)

$ErrorCount = 0
$WarnCount = 0

function Write-Ok($Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn($Message) {
  $script:WarnCount += 1
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err($Message) {
  $script:ErrorCount += 1
  Write-Host "[ERROR] $Message" -ForegroundColor Red
}

$Root = Get-Location
$PracticeJs = Join-Path $Root "practice-print\practice-print.js"
$Manifest = Join-Path $Root "reading-test\data\exam-manifest.json"
$ExamsDir = Join-Path $Root "reading-test\data\exams"

if (!(Test-Path $PracticeJs)) {
  Write-Err "practice-print\practice-print.js not found."
} else {
  Write-Ok "practice-print\practice-print.js exists."

  $JsText = Get-Content $PracticeJs -Raw -Encoding UTF8

  if ($JsText -match "EXAM_MANIFEST_URL") {
    Write-Ok "practice-print reads exam-manifest.json."
  } else {
    Write-Err "practice-print does not read exam-manifest.json."
  }

  if ($JsText -match "loadExamRecordsFromManifest") {
    Write-Ok "practice-print loads actual fixed exam files from manifest."
  } else {
    Write-Err "manifest-based exam loading function is missing."
  }

  if ($JsText -match "isPseudoQuestionNumberRound") {
    Write-Ok "pseudo rounds such as 031~070 are filtered."
  } else {
    Write-Err "pseudo round filtering is missing."
  }

  if ($JsText -match "isFullReadingExamEntry") {
    Write-Ok "random and level-test entries are excluded from print round list."
  } else {
    Write-Err "full reading exam entry filter is missing."
  }

  if ($JsText -match "normalizeExamFileUrl") {
    Write-Ok "exam file paths are normalized for practice-print."
  } else {
    Write-Err "exam file path normalization is missing."
  }

  if (Get-Command node -ErrorAction SilentlyContinue) {
    $nodeResult = & node --check $PracticeJs 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "practice-print.js passed node syntax check."
    } else {
      Write-Err "practice-print.js failed node syntax check: $nodeResult"
    }
  } else {
    Write-Warn "Node.js not found. Skipped JS syntax check."
  }
}

if (!(Test-Path $Manifest)) {
  Write-Err "reading-test\data\exam-manifest.json not found."
} else {
  Write-Ok "exam-manifest.json exists."

  try {
    $ManifestJson = Get-Content $Manifest -Raw -Encoding UTF8 | ConvertFrom-Json
    $Entries = @()
    if ($ManifestJson -is [System.Array]) {
      $Entries = $ManifestJson
    } elseif ($ManifestJson.exams) {
      $Entries = $ManifestJson.exams
    } elseif ($ManifestJson.items) {
      $Entries = $ManifestJson.items
    } elseif ($ManifestJson.exam_list) {
      $Entries = $ManifestJson.exam_list
    }

    $FullReadingEntries = @($Entries | Where-Object {
      $file = "" + $_.file
      $label = "" + $_.label
      $id = "" + $_.id + " " + $_.value
      $enabledOk = -not ($_.PSObject.Properties.Name -contains "enabled") -or $_.enabled -ne $false
      $studentVisibleOk = -not ($_.PSObject.Properties.Name -contains "student_visible") -or $_.student_visible -ne $false
      $isLevel = ($file + " " + $label + " " + $id) -match "level[-_ ]?test|레벨"
      $isRandom = ($label + " " + $id) -match "random|랜덤"
      $isReadingFile = $file -match "reading-\d+\.json$"
      $enabledOk -and $studentVisibleOk -and !$isLevel -and !$isRandom -and $isReadingFile
    })

    if ($FullReadingEntries.Count -gt 0) {
      Write-Ok ("manifest has {0} fixed reading exams." -f $FullReadingEntries.Count)
    } else {
      Write-Err "manifest has no fixed reading exam entries."
    }

    foreach ($entry in $FullReadingEntries) {
      $file = "" + $entry.file
      if ($file -match "reading-(\d+)\.json$") {
        $round = $Matches[1]
        $path = $file
        if ($path -match "^data/") {
          $path = Join-Path $Root ("reading-test\" + ($path -replace "/", "\"))
        } elseif ($path -match "^exams/") {
          $path = Join-Path $Root ("reading-test\data\" + ($path -replace "/", "\"))
        } elseif ($path -match "^reading-\d+\.json$") {
          $path = Join-Path $ExamsDir $path
        } else {
          $path = Join-Path $Root ($path -replace "/", "\")
        }

        if (Test-Path $path) {
          Write-Ok ("reading-{0}.json exists." -f $round)
        } else {
          Write-Warn ("manifest points to reading-{0}.json, but file was not found at {1}" -f $round, $path)
        }
      }
    }
  } catch {
    Write-Err ("exam-manifest.json parse failed: " + $_.Exception.Message)
  }
}

Write-Host ""
Write-Host "Validation summary" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host ("Errors  : {0}" -f $ErrorCount)
Write-Host ("Warnings: {0}" -f $WarnCount)

if ($ErrorCount -gt 0) {
  Write-Host "Result: FAIL - fix errors." -ForegroundColor Red
  exit 1
}

if ($Strict -and $WarnCount -gt 0) {
  Write-Host "Result: FAIL - warnings are treated as errors in Strict mode." -ForegroundColor Red
  exit 1
}

Write-Host "Result: PASS - STEP46-5 practice-print actual round fix is ready." -ForegroundColor Green
exit 0
