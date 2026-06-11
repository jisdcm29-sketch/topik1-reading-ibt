# STEP38-5 validator: include 99회 fixed exam / leveltest / answer key / image links
param(
  [string]$RootPath = "C:\topik1-separated-system"
)

$ErrorActionPreference = "Stop"

$script:ErrorCount = 0
$script:WarnCount = 0

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnMessage {
  param([string]$Message)
  $script:WarnCount += 1
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-ErrorMessage {
  param([string]$Message)
  $script:ErrorCount += 1
  Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Test-RequiredFile {
  param([string]$Path, [string]$Label)

  if (Test-Path -LiteralPath $Path) {
    Write-Ok "$Label 존재: $Path"
    return $true
  }

  Write-ErrorMessage "$Label 없음: $Path"
  return $false
}

function Read-JsonFile {
  param([string]$Path, [string]$Label)

  try {
    $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    return $raw | ConvertFrom-Json
  } catch {
    Write-ErrorMessage "$Label JSON 읽기 실패: $($_.Exception.Message)"
    return $null
  }
}

function Get-QuestionArray {
  param($JsonData)

  if ($null -eq $JsonData) {
    return @()
  }

  if ($JsonData -is [System.Array]) {
    return @($JsonData)
  }

  if ($JsonData.PSObject.Properties.Name -contains "questions" -and $JsonData.questions) {
    return @($JsonData.questions)
  }

  if ($JsonData.PSObject.Properties.Name -contains "items" -and $JsonData.items) {
    return @($JsonData.items)
  }

  if (
    ($JsonData.PSObject.Properties.Name -contains "exam") -and
    $JsonData.exam -and
    ($JsonData.exam.PSObject.Properties.Name -contains "questions") -and
    $JsonData.exam.questions
  ) {
    return @($JsonData.exam.questions)
  }

  return @()
}

function Get-QuestionNumber {
  param($Item)

  $candidates = @(
    $Item.question_number,
    $Item.target_slot,
    $Item.original_question_number
  )

  foreach ($candidate in $candidates) {
    if ($null -ne $candidate -and "$candidate" -ne "") {
      $number = 0
      if ([int]::TryParse("$candidate", [ref]$number)) {
        return $number
      }
    }
  }

  return $null
}

function Get-PointValue {
  param($Item)

  if ($null -eq $Item -or $null -eq $Item.points -or "$($Item.points)" -eq "") {
    return 0
  }

  $point = 0
  if ([int]::TryParse("$($Item.points)", [ref]$point)) {
    return $point
  }

  return 0
}

function Test-NumberSet {
  param(
    [int[]]$ActualNumbers,
    [int[]]$ExpectedNumbers,
    [string]$Label
  )

  $actualSorted = @($ActualNumbers | Sort-Object)
  $expectedSorted = @($ExpectedNumbers | Sort-Object)

  $missing = @($expectedSorted | Where-Object { $actualSorted -notcontains $_ })
  $extra = @($actualSorted | Where-Object { $expectedSorted -notcontains $_ })
  $duplicates = @(
    $actualSorted |
      Group-Object |
      Where-Object { $_.Count -gt 1 } |
      ForEach-Object { [int]$_.Name }
  )

  if ($missing.Count -gt 0) {
    Write-ErrorMessage "$Label 누락 문항: $($missing -join ', ')"
  }

  if ($extra.Count -gt 0) {
    Write-ErrorMessage "$Label 범위 밖 문항: $($extra -join ', ')"
  }

  if ($duplicates.Count -gt 0) {
    Write-ErrorMessage "$Label 중복 문항: $($duplicates -join ', ')"
  }

  if ($missing.Count -eq 0 -and $extra.Count -eq 0 -and $duplicates.Count -eq 0) {
    Write-Ok "$Label 문항 번호 정상"
  }
}

function Test-QuestionFile {
  param(
    [string]$Path,
    [string]$Label,
    [int[]]$ExpectedNumbers,
    [int]$ExpectedCount,
    [int]$ExpectedPointSum
  )

  if (-not (Test-RequiredFile -Path $Path -Label $Label)) {
    return
  }

  $json = Read-JsonFile -Path $Path -Label $Label
  $questions = @(Get-QuestionArray -JsonData $json)

  if ($questions.Count -ne $ExpectedCount) {
    Write-ErrorMessage "$Label 문항 수 오류: 현재 $($questions.Count)개, 기대 $($ExpectedCount)개"
  } else {
    Write-Ok "$Label 문항 수 정상: $($ExpectedCount)개"
  }

  $numbers = @()
  foreach ($question in $questions) {
    $number = Get-QuestionNumber -Item $question
    if ($null -ne $number) {
      $numbers += $number
    }
  }

  Test-NumberSet -ActualNumbers $numbers -ExpectedNumbers $ExpectedNumbers -Label $Label

  $pointSum = 0
  foreach ($question in $questions) {
    $pointSum += Get-PointValue -Item $question
  }

  if ($pointSum -ne $ExpectedPointSum) {
    Write-ErrorMessage "$Label 배점 합계 오류: 현재 $($pointSum)점, 기대 $($ExpectedPointSum)점"
  } else {
    Write-Ok "$Label 배점 합계 정상: $($ExpectedPointSum)점"
  }
}

function Test-AnswerKeyFile {
  param(
    [string]$Path,
    [string]$Label,
    [int[]]$ExpectedNumbers
  )

  if (-not (Test-RequiredFile -Path $Path -Label $Label)) {
    return
  }

  $json = Read-JsonFile -Path $Path -Label $Label
  $items = @()

  if ($json -is [System.Array]) {
    $items = @($json)
  } elseif ($json.PSObject.Properties.Name -contains "items" -and $json.items) {
    $items = @($json.items)
  } elseif ($json.PSObject.Properties.Name -contains "answer_key" -and $json.answer_key) {
    $items = @($json.answer_key)
  } elseif ($json.PSObject.Properties.Name -contains "answers" -and $json.answers) {
    $items = @($json.answers)
  }

  if ($items.Count -ne 40) {
    Write-ErrorMessage "$Label 정답 수 오류: 현재 $($items.Count)개, 기대 40개"
  } else {
    Write-Ok "$Label 정답 수 정상: 40개"
  }

  $numbers = @()
  $missingAnswerNumbers = @()
  $pointSum = 0

  foreach ($item in $items) {
    $number = Get-QuestionNumber -Item $item
    if ($null -ne $number) {
      $numbers += $number
    }

    $answerValue = $null
    if ($item.PSObject.Properties.Name -contains "correct_answer") {
      $answerValue = $item.correct_answer
    } elseif ($item.PSObject.Properties.Name -contains "answer") {
      $answerValue = $item.answer
    }

    if ($null -eq $answerValue -or "$answerValue" -eq "") {
      if ($null -ne $number) {
        $missingAnswerNumbers += $number
      }
    }

    $pointSum += Get-PointValue -Item $item
  }

  Test-NumberSet -ActualNumbers $numbers -ExpectedNumbers $ExpectedNumbers -Label $Label

  if ($missingAnswerNumbers.Count -gt 0) {
    Write-ErrorMessage "$Label correct_answer 누락: $($missingAnswerNumbers -join ', ')"
  } else {
    Write-Ok "$Label correct_answer 필드 정상"
  }

  if ($pointSum -ne 100) {
    Write-ErrorMessage "$Label 배점 합계 오류: 현재 $($pointSum)점, 기대 100점"
  } else {
    Write-Ok "$Label 배점 합계 정상: 100점"
  }
}

function Find-ManifestEntry {
  param(
    $Manifest,
    [string]$Round,
    [string]$ExamType
  )

  if ($null -eq $Manifest -or -not ($Manifest.PSObject.Properties.Name -contains "exams")) {
    return $null
  }

  foreach ($entry in @($Manifest.exams)) {
    $entryRound = ""
    if ($entry.PSObject.Properties.Name -contains "round" -and $entry.round) {
      $entryRound = "$($entry.round)"
    } elseif ($entry.PSObject.Properties.Name -contains "source_round" -and $entry.source_round) {
      $entryRound = "$($entry.source_round)"
    }

    $entryType = "full"
    if ($entry.PSObject.Properties.Name -contains "exam_type" -and $entry.exam_type) {
      $entryType = "$($entry.exam_type)"
    }

    if ($entryRound -eq $Round -and $entryType -eq $ExamType) {
      return $entry
    }
  }

  return $null
}

function Test-ManifestLink {
  param(
    $Manifest,
    [string]$Round,
    [string]$ExamType,
    [string]$ExpectedFile,
    [string]$ExpectedAnswerKeyFile
  )

  $label = "$Round회 $ExamType manifest 항목"
  $entry = Find-ManifestEntry -Manifest $Manifest -Round $Round -ExamType $ExamType

  if ($null -eq $entry) {
    Write-ErrorMessage "$label 없음"
    return
  }

  Write-Ok "$label 존재"

  if ($entry.PSObject.Properties.Name -contains "file" -and "$($entry.file)" -eq $ExpectedFile) {
    Write-Ok "$label file 연결 정상: $ExpectedFile"
  } else {
    $currentFile = ""
    if ($entry.PSObject.Properties.Name -contains "file") {
      $currentFile = "$($entry.file)"
    }
    Write-ErrorMessage "$label file 연결 오류: 현재 '$currentFile', 기대 '$ExpectedFile'"
  }

  if ($entry.PSObject.Properties.Name -contains "answer_key_file" -and "$($entry.answer_key_file)" -eq $ExpectedAnswerKeyFile) {
    Write-Ok "$label answer_key_file 연결 정상: $ExpectedAnswerKeyFile"
  } else {
    $currentKey = ""
    if ($entry.PSObject.Properties.Name -contains "answer_key_file") {
      $currentKey = "$($entry.answer_key_file)"
    }
    Write-ErrorMessage "$label answer_key_file 연결 오류: 현재 '$currentKey', 기대 '$ExpectedAnswerKeyFile'"
  }
}


function Find-QuestionByNumber {
  param(
    [object[]]$Questions,
    [int]$QuestionNumber
  )

  foreach ($question in $Questions) {
    $number = Get-QuestionNumber -Item $question
    if ($number -eq $QuestionNumber) {
      return $question
    }
  }

  return $null
}

function Get-ImageUrl {
  param($Item)

  if ($null -eq $Item) {
    return ""
  }

  if ($Item.PSObject.Properties.Name -contains "image_url" -and $Item.image_url) {
    return "$($Item.image_url)"
  }

  if ($Item.PSObject.Properties.Name -contains "imageUrl" -and $Item.imageUrl) {
    return "$($Item.imageUrl)"
  }

  if ($Item.PSObject.Properties.Name -contains "image" -and $Item.image) {
    return "$($Item.image)"
  }

  return ""
}

function Convert-RelativeImagePathToFullPath {
  param(
    [string]$ImageUrl,
    [string]$ReadingTestPath
  )

  $clean = "$ImageUrl".Trim().Replace("/", "\")
  $clean = $clean -replace "^\.\\", ""

  if ($clean -match "^[A-Za-z]:\\") {
    return $clean
  }

  return Join-Path $ReadingTestPath $clean
}

function Test-ExpectedImageLink {
  param(
    [object[]]$Questions,
    [int]$QuestionNumber,
    [string]$ExpectedImageUrl,
    [string]$ReadingTestPath,
    [string]$Label
  )

  $question = Find-QuestionByNumber -Questions $Questions -QuestionNumber $QuestionNumber

  if ($null -eq $question) {
    Write-ErrorMessage "$Label $($QuestionNumber)번 문항을 찾을 수 없습니다."
    return
  }

  $actualImageUrl = Get-ImageUrl -Item $question

  if ($actualImageUrl -ne $ExpectedImageUrl) {
    Write-ErrorMessage "$Label $($QuestionNumber)번 image_url 오류: 현재 '$actualImageUrl', 기대 '$ExpectedImageUrl'"
  } else {
    Write-Ok "$Label $($QuestionNumber)번 image_url 정상: $ExpectedImageUrl"
  }

  $fullImagePath = Convert-RelativeImagePathToFullPath -ImageUrl $ExpectedImageUrl -ReadingTestPath $ReadingTestPath

  if (Test-Path -LiteralPath $fullImagePath) {
    Write-Ok "$Label $($QuestionNumber)번 이미지 파일 존재: $fullImagePath"
  } else {
    Write-ErrorMessage "$Label $($QuestionNumber)번 이미지 파일 없음: $fullImagePath"
  }
}

function Test-Round99ImageLinks {
  param(
    [string]$Reading99Path,
    [string]$LevelTest99Path,
    [string]$ReadingTestPath
  )

  Write-Host ""
  Write-Host "[5] 99회 이미지 경로 검증" -ForegroundColor Cyan

  if (-not (Test-Path -LiteralPath $Reading99Path)) {
    Write-ErrorMessage "99회 40문항 시험지 없음: $Reading99Path"
    return
  }

  if (-not (Test-Path -LiteralPath $LevelTest99Path)) {
    Write-ErrorMessage "99회 레벨테스트 없음: $LevelTest99Path"
    return
  }

  $readingJson = Read-JsonFile -Path $Reading99Path -Label "99회 40문항 시험지"
  $readingQuestions = @(Get-QuestionArray -JsonData $readingJson)

  Test-ExpectedImageLink -Questions $readingQuestions -QuestionNumber 40 -ExpectedImageUrl "./images/99_R040.png" -ReadingTestPath $ReadingTestPath -Label "99회 40문항"
  Test-ExpectedImageLink -Questions $readingQuestions -QuestionNumber 41 -ExpectedImageUrl "./images/99_R041.png" -ReadingTestPath $ReadingTestPath -Label "99회 40문항"
  Test-ExpectedImageLink -Questions $readingQuestions -QuestionNumber 42 -ExpectedImageUrl "./images/99_R042.png" -ReadingTestPath $ReadingTestPath -Label "99회 40문항"
  Test-ExpectedImageLink -Questions $readingQuestions -QuestionNumber 63 -ExpectedImageUrl "./images/99_R063_064.png" -ReadingTestPath $ReadingTestPath -Label "99회 40문항"
  Test-ExpectedImageLink -Questions $readingQuestions -QuestionNumber 64 -ExpectedImageUrl "./images/99_R063_064.png" -ReadingTestPath $ReadingTestPath -Label "99회 40문항"

  $levelJson = Read-JsonFile -Path $LevelTest99Path -Label "99회 레벨테스트"
  $levelQuestions = @(Get-QuestionArray -JsonData $levelJson)

  Test-ExpectedImageLink -Questions $levelQuestions -QuestionNumber 40 -ExpectedImageUrl "./images/99_R040.png" -ReadingTestPath $ReadingTestPath -Label "99회 레벨테스트"
  Test-ExpectedImageLink -Questions $levelQuestions -QuestionNumber 63 -ExpectedImageUrl "./images/99_R063_064.png" -ReadingTestPath $ReadingTestPath -Label "99회 레벨테스트"
  Test-ExpectedImageLink -Questions $levelQuestions -QuestionNumber 64 -ExpectedImageUrl "./images/99_R063_064.png" -ReadingTestPath $ReadingTestPath -Label "99회 레벨테스트"
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "TOPIK I STEP38 99회 포함 데이터 분리 구조 검증 v38-5" -ForegroundColor Cyan
Write-Host "대상 루트: $RootPath" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path -LiteralPath $RootPath)) {
  Write-ErrorMessage "루트 폴더가 없습니다: $RootPath"
  exit 1
}

$readingTestPath = Join-Path $RootPath "reading-test"
$dataPath = Join-Path $readingTestPath "data"
$manifestPath = Join-Path $dataPath "exam-manifest.json"
$bankPath = Join-Path $dataPath "bank\question-bank.json"
$templatePath = Join-Path $dataPath "bank\exam-template.json"
$examsPath = Join-Path $dataPath "exams"
$answerKeysPath = Join-Path $dataPath "answer-keys"

Test-RequiredFile -Path $manifestPath -Label "exam-manifest.json" | Out-Null
Test-RequiredFile -Path $bankPath -Label "question-bank.json" | Out-Null
Test-RequiredFile -Path $templatePath -Label "exam-template.json" | Out-Null

if (Test-Path -LiteralPath $examsPath) {
  Write-Ok "data\exams 폴더 존재"
} else {
  Write-ErrorMessage "data\exams 폴더 없음: $examsPath"
}

if (Test-Path -LiteralPath $answerKeysPath) {
  Write-Ok "data\answer-keys 폴더 존재"
} else {
  Write-ErrorMessage "data\answer-keys 폴더 없음: $answerKeysPath"
}

$manifest = Read-JsonFile -Path $manifestPath -Label "exam-manifest.json"

$fullNumbers = 31..70
$levelTestNumbers = @(31, 33, 34, 37, 40, 43, 46, 48, 49, 50, 57, 58, 59, 60, 63, 64, 67, 68, 69, 70)

# 레벨테스트는 20문항을 100점으로 환산해 보고서에 표시하지만,
# data/exams/level-test-xxx.json 파일 자체의 원문 배점 합계는 선택된 20문항 기준 51점이다.
# 따라서 구조 검증에서는 파일 원본 배점 합계 51점을 정상 기준으로 본다.
$levelTestExpectedPointSum = 51
$rounds = @("99", "100", "102", "103")

Write-Host ""
Write-Host "[1] manifest 연결 검증" -ForegroundColor Cyan

foreach ($round in $rounds) {
  Test-ManifestLink `
    -Manifest $manifest `
    -Round $round `
    -ExamType "full" `
    -ExpectedFile "data/exams/reading-$round.json" `
    -ExpectedAnswerKeyFile "data/answer-keys/answer-key-$round.json"

  Test-ManifestLink `
    -Manifest $manifest `
    -Round $round `
    -ExamType "leveltest" `
    -ExpectedFile "data/exams/level-test-$round.json" `
    -ExpectedAnswerKeyFile "data/answer-keys/answer-key-$round.json"
}

Write-Host ""
Write-Host "[2] 40문항 회차별 시험지 검증" -ForegroundColor Cyan

foreach ($round in $rounds) {
  Test-QuestionFile `
    -Path (Join-Path $examsPath "reading-$round.json") `
    -Label "$round회 40문항 시험지" `
    -ExpectedNumbers $fullNumbers `
    -ExpectedCount 40 `
    -ExpectedPointSum 100
}

Write-Host ""
Write-Host "[3] 레벨테스트 회차별 시험지 검증" -ForegroundColor Cyan

foreach ($round in $rounds) {
  Test-QuestionFile `
    -Path (Join-Path $examsPath "level-test-$round.json") `
    -Label "$round회 레벨테스트" `
    -ExpectedNumbers $levelTestNumbers `
    -ExpectedCount 20 `
    -ExpectedPointSum $levelTestExpectedPointSum
}

Write-Host ""
Write-Host "[4] 정답표 검증" -ForegroundColor Cyan

foreach ($round in $rounds) {
  Test-AnswerKeyFile `
    -Path (Join-Path $answerKeysPath "answer-key-$round.json") `
    -Label "$round회 정답표" `
    -ExpectedNumbers $fullNumbers
}


Test-Round99ImageLinks `
  -Reading99Path (Join-Path $examsPath "reading-99.json") `
  -LevelTest99Path (Join-Path $examsPath "level-test-99.json") `
  -ReadingTestPath $readingTestPath

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "검증 완료: 오류 $($script:ErrorCount)개 / 경고 $($script:WarnCount)개" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($script:ErrorCount -gt 0) {
  Write-Host "오류가 있으므로 위 메시지를 확인하세요." -ForegroundColor Red
  exit 1
}

Write-Host "STEP38 99회 포함 데이터 분리 구조가 정상입니다." -ForegroundColor Green
exit 0
