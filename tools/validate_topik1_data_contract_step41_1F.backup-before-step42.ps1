param(
  [string]$Root = "C:\topik1-separated-system"
)

$ErrorActionPreference = "Stop"
$script:ErrorCount = 0
$script:WarnCount = 0

function Write-Ok {
  param([string]$Message)
  Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-Warn {
  param([string]$Message)
  $script:WarnCount++
  Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-Err {
  param([string]$Message)
  $script:ErrorCount++
  Write-Host "[ERROR] $Message" -ForegroundColor Red
}

function Get-Prop {
  param(
    [object]$Obj,
    [string[]]$Names
  )

  if ($null -eq $Obj) {
    return $null
  }

  foreach ($Name in $Names) {
    $Prop = $Obj.PSObject.Properties[$Name]
    if ($null -ne $Prop) {
      return $Prop.Value
    }
  }

  return $null
}

function Has-NonEmpty {
  param(
    [object]$Obj,
    [string[]]$Names
  )

  $Value = Get-Prop $Obj $Names

  if ($null -eq $Value) {
    return $false
  }

  if ($Value -is [string]) {
    return ($Value.Trim().Length -gt 0)
  }

  if ($Value -is [System.Array]) {
    return ($Value.Count -gt 0)
  }

  return $true
}

function Normalize-QNo {
  param([object]$Item)

  $Value = Get-Prop $Item @("question_number", "number", "qno", "original_question_number")
  if ($null -eq $Value) {
    return $null
  }

  try {
    return [int]$Value
  } catch {
    return $null
  }
}

function Read-JsonFile {
  param([string]$Path)

  try {
    return Get-Content -Raw -Encoding UTF8 $Path | ConvertFrom-Json
  } catch {
    Write-Err "JSON 파싱 실패: $Path"
    Write-Err $_.Exception.Message
    return $null
  }
}

function Get-Items {
  param([object]$Json)

  if ($null -eq $Json) {
    return @()
  }

  if ($Json -is [System.Array]) {
    return @($Json)
  }

  if ($null -ne $Json.PSObject.Properties["questions"]) {
    return @($Json.questions)
  }

  if ($null -ne $Json.PSObject.Properties["items"]) {
    return @($Json.items)
  }

  return @()
}

function Get-QuestionMap {
  param([object[]]$Items)

  $Map = @{}

  foreach ($Item in $Items) {
    $QNo = Normalize-QNo $Item
    if ($null -ne $QNo) {
      $Map[$QNo] = $Item
    }
  }

  return $Map
}

function Get-QuestionType {
  param([object]$Question)

  $Type = Get-Prop $Question @("type")
  if ($null -eq $Type) {
    return ""
  }

  return $Type.ToString()
}

function Validate-ExpectedQuestionCount {
  param(
    [object[]]$Items,
    [string]$FileName
  )

  $ExpectedCount = 0

  if ($FileName -match "^reading-\d+\.json$") {
    $ExpectedCount = 40
  } elseif ($FileName -match "^level-test-\d+\.json$") {
    $ExpectedCount = 20
  }

  if ($ExpectedCount -eq 0) {
    return
  }

  if ($Items.Count -eq $ExpectedCount) {
    Write-Ok "$FileName : 문항 수 $($Items.Count)개"
  } else {
    Write-Err "$FileName : 문항 수가 $($Items.Count)개입니다. 예상 문항 수는 $ExpectedCount개입니다."
  }
}

function Validate-PointTotal {
  param(
    [object[]]$Items,
    [string]$FileName
  )

  $ExpectedTotal = $null

  if ($FileName -match "^reading-\d+\.json$") {
    $ExpectedTotal = 100
  } elseif ($FileName -match "^level-test-\d+\.json$") {
    $ExpectedTotal = 51
  }

  if ($null -eq $ExpectedTotal) {
    return
  }

  $Total = 0

  foreach ($Item in $Items) {
    $PointValue = Get-Prop $Item @("points", "score")
    if ($null -ne $PointValue) {
      try {
        $Total += [int]$PointValue
      } catch {
        Write-Warn "$FileName : 배점 숫자 변환 확인 필요 - 문항 $(Normalize-QNo $Item)"
      }
    }
  }

  if ($Total -eq $ExpectedTotal) {
    Write-Ok "$FileName : 배점 합계 $Total점"
  } else {
    Write-Err "$FileName : 배점 합계가 $Total점입니다. 예상 합계는 $ExpectedTotal점입니다."
  }
}

function Validate-QuestionNumberRange {
  param(
    [hashtable]$Map,
    [string]$FileName
  )

  foreach ($Key in $Map.Keys) {
    $Number = [int]$Key
    if ($Number -lt 31 -or $Number -gt 70) {
      Write-Err "$FileName : TOPIK I 읽기 범위를 벗어난 문항 번호 $Number"
    }
  }
}

function Validate-CommonSetPair {
  param(
    [hashtable]$Map,
    [int]$FirstQNo,
    [int]$SecondQNo,
    [string]$FileName
  )

  $HasFirst = $Map.ContainsKey($FirstQNo)
  $HasSecond = $Map.ContainsKey($SecondQNo)

  if (-not $HasFirst -and -not $HasSecond) {
    return
  }

  if ($HasFirst -and -not $HasSecond) {
    Write-Warn "$FileName : 공통 세트 $FirstQNo-$SecondQNo 중 $FirstQNo번만 있습니다. 레벨테스트 파일이면 정상일 수 있습니다."
    return
  }

  if (-not $HasFirst -and $HasSecond) {
    Write-Warn "$FileName : 공통 세트 $FirstQNo-$SecondQNo 중 $SecondQNo번만 있습니다. 레벨테스트 파일이면 정상일 수 있습니다."
    return
  }

  $First = $Map[$FirstQNo]
  $Second = $Map[$SecondQNo]

  $GroupA = Get-Prop $First @("passage_group_id", "set_id", "group_id", "passageGroupId", "shared_passage_id")
  $GroupB = Get-Prop $Second @("passage_group_id", "set_id", "group_id", "passageGroupId", "shared_passage_id")

  if ($GroupA -and $GroupB -and ($GroupA -eq $GroupB)) {
    Write-Ok "$FileName : $FirstQNo-$SecondQNo passage_group_id 연결 정상 ($GroupA)"
  } elseif ($GroupA -or $GroupB) {
    Write-Warn "$FileName : $FirstQNo-$SecondQNo passage_group_id가 서로 다릅니다. 화면 동기화 확인 필요"
  } else {
    Write-Warn "$FileName : $FirstQNo-$SecondQNo passage_group_id 없음. JS fallback 규칙으로만 동작합니다."
  }

  $FirstType = Get-QuestionType $First

  $IsInsert = ($FirstType -match "insert")
  $IsBlank = ($FirstType -match "blank") -or (Has-NonEmpty $First @("blank_answer_map", "blank_options", "blank_marker"))

  if ($IsInsert) {
    if (Has-NonEmpty $First @("insert_sentence", "sentence_to_insert", "target_sentence", "insertText")) {
      Write-Ok "$FileName : $FirstQNo-$SecondQNo 삽입 문장 필드 정상"
    } else {
      Write-Err "$FileName : $FirstQNo번은 삽입형인데 insert_sentence 필드가 없습니다."
    }

    if (Has-NonEmpty $First @("insert_positions", "insert_markers", "markers")) {
      Write-Ok "$FileName : $FirstQNo-$SecondQNo 삽입 위치 후보 필드 정상"
    } else {
      Write-Warn "$FileName : $FirstQNo번 삽입 위치 후보 필드가 명확하지 않습니다. passage 안의 ㄱ/ㄴ/ㄷ/ㄹ 표시도 화면에서 확인하세요."
    }
  }

  if ($IsBlank) {
    if (Has-NonEmpty $First @("options")) {
      Write-Ok "$FileName : $FirstQNo-$SecondQNo 빈칸 선택 options 존재"
    } else {
      Write-Warn "$FileName : $FirstQNo번 빈칸형 options 확인 필요"
    }
  }
}

function Validate-SentenceOrder {
  param(
    [hashtable]$Map,
    [int]$QNo,
    [string]$FileName
  )

  if (-not $Map.ContainsKey($QNo)) {
    return
  }

  $Question = $Map[$QNo]
  $Type = Get-QuestionType $Question

  if ($Type -notmatch "sentence_order") {
    return
  }

  if (Has-NonEmpty $Question @("order_choice_orders", "choice_orders", "order_choices")) {
    Write-Ok "$FileName : $QNo 조건부 순서 배열 보기 구조 존재"
  } else {
    Write-Warn "$FileName : $QNo sentence_order 문항에 order_choice_orders가 없습니다. 회차별 실제 ①~④ 배열과 후보 분기 확인 필요"
  }

  if (Has-NonEmpty $Question @("correct_order", "correct_sequence", "answer_order")) {
    Write-Ok "$FileName : $QNo correct_order 또는 별칭 필드 존재"
  } elseif (Has-NonEmpty $Question @("correct_answer", "answer")) {
    Write-Warn "$FileName : $QNo correct_order 없음. correct_answer만으로 채점될 수 있으므로 실제 보기 배열 화면 확인 필요"
  } else {
    Write-Err "$FileName : $QNo 정답 필드를 찾지 못했습니다."
  }

  if (Has-NonEmpty $Question @("sentence_items", "sentences", "order_sentences")) {
    Write-Ok "$FileName : $QNo 문장 배열 원문 필드 존재"
  } else {
    Write-Warn "$FileName : $QNo sentence_items가 없습니다. options 문자열에서 문장 배열을 추출하는 구조인지 확인하세요."
  }
}

function Validate-ImageQuestion {
  param(
    [hashtable]$Map,
    [int]$QNo,
    [string]$FileName,
    [string]$Root
  )

  if (-not $Map.ContainsKey($QNo)) {
    return
  }

  $Question = $Map[$QNo]
  $ImageValue = Get-Prop $Question @("image_url", "image", "imageUrl", "shared_image_url", "common_image_url")

  if ($null -eq $ImageValue -or $ImageValue.ToString().Trim().Length -eq 0) {
    Write-Warn "$FileName : $QNo 이미지 문항인데 image_url이 비어 있습니다."
    return
  }

  $ImagePath = $ImageValue.ToString().Replace("./", "")
  $FullImagePath = Join-Path (Join-Path $Root "reading-test") $ImagePath

  if (Test-Path $FullImagePath) {
    Write-Ok "$FileName : $QNo 이미지 파일 존재: $ImageValue"
  } else {
    Write-Err "$FileName : $QNo 이미지 파일 없음: $ImageValue"
  }
}

function Validate-ExamFile {
  param([string]$Path)

  $FileName = Split-Path $Path -Leaf

  Write-Host ""
  Write-Host "[$FileName] 검증" -ForegroundColor Cyan

  $Json = Read-JsonFile $Path
  if ($null -eq $Json) {
    return
  }

  $Items = Get-Items $Json
  if ($Items.Count -lt 1) {
    Write-Err "$FileName : 문항 배열을 찾지 못했습니다."
    return
  }

  Validate-ExpectedQuestionCount $Items $FileName
  Validate-PointTotal $Items $FileName

  $Map = Get-QuestionMap $Items
  Validate-QuestionNumberRange $Map $FileName

  $Pairs = @(
    @(49, 50),
    @(51, 52),
    @(53, 54),
    @(55, 56),
    @(59, 60),
    @(61, 62),
    @(63, 64),
    @(65, 66),
    @(67, 68),
    @(69, 70)
  )

  foreach ($Pair in $Pairs) {
    Validate-CommonSetPair $Map $Pair[0] $Pair[1] $FileName
  }

  Validate-SentenceOrder $Map 57 $FileName
  Validate-SentenceOrder $Map 58 $FileName

  foreach ($QNo in @(40, 41, 42, 63, 64)) {
    Validate-ImageQuestion $Map $QNo $FileName $Root
  }
}

$ExamDir = Join-Path $Root "reading-test\data\exams"

if (-not (Test-Path $ExamDir)) {
  Write-Err "시험지 폴더 없음: $ExamDir"
  exit 1
}

Write-Host "TOPIK I 데이터 계약 검증 STEP42" -ForegroundColor Cyan
Write-Host "대상: $ExamDir" -ForegroundColor Cyan

$Files = Get-ChildItem -Path $ExamDir -Filter "*.json" | Where-Object {
  $_.Name -match "^(reading|level-test)-\d+\.json$"
}

if ($Files.Count -eq 0) {
  Write-Err "검증할 reading-회차.json 또는 level-test-회차.json 파일이 없습니다."
} else {
  foreach ($File in $Files) {
    Validate-ExamFile $File.FullName
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "검증 완료: 오류 $($script:ErrorCount)개 / 경고 $($script:WarnCount)개" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($script:ErrorCount -eq 0) {
  Write-Host "STEP42 데이터 계약 검증 완료: 치명 오류 없음" -ForegroundColor Green
  if ($script:WarnCount -gt 0) {
    Write-Host "경고는 회차별 JSON 보강 권장 사항입니다. 화면 테스트로 확인하세요." -ForegroundColor Yellow
  }
  exit 0
} else {
  Write-Host "오류가 있습니다. 위 메시지를 확인하세요." -ForegroundColor Red
  exit 1
}
