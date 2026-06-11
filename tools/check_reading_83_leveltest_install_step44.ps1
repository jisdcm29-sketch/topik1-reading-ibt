param(
  [string]$Root = "C:\topik1-separated-system"
)

$ErrorActionPreference = "Stop"
$ErrorCount = 0

function Ok($msg) { Write-Host "[OK] $msg" -ForegroundColor Green }
function Err($msg) { $script:ErrorCount++; Write-Host "[ERROR] $msg" -ForegroundColor Red }

$manifestPath = Join-Path $Root "reading-test\data\exam-manifest.json"
$reading83Path = Join-Path $Root "reading-test\data\exams\reading-83.json"
$level83Path = Join-Path $Root "reading-test\data\exams\level-test-83.json"
$answer83Path = Join-Path $Root "reading-test\data\answer-keys\answer-key-83.json"

if (Test-Path $manifestPath) { Ok "exam-manifest.json exists." } else { Err "exam-manifest.json not found." }
if (Test-Path $reading83Path) { Ok "reading-83.json exists." } else { Err "reading-83.json not found." }
if (Test-Path $level83Path) { Ok "level-test-83.json exists." } else { Err "level-test-83.json not found." }
if (Test-Path $answer83Path) { Ok "answer-key-83.json exists." } else { Err "answer-key-83.json not found." }

if (Test-Path $manifestPath) {
  $manifest = Get-Content -Raw -Encoding UTF8 $manifestPath | ConvertFrom-Json
  $examIds = @($manifest.exams | ForEach-Object { $_.id })

  if ($examIds -contains "reading-83") { Ok "manifest has reading-83." } else { Err "manifest missing reading-83." }
  if ($examIds -contains "leveltest-83") { Ok "manifest has leveltest-83." } else { Err "manifest missing leveltest-83." }

  $order = @($manifest.student_visible_order)
  if ($order -contains "leveltest-83") { Ok "student_visible_order has leveltest-83." } else { Err "student_visible_order missing leveltest-83." }
}

if (Test-Path $level83Path) {
  $level = Get-Content -Raw -Encoding UTF8 $level83Path | ConvertFrom-Json
  $questions = @($level.questions)

  if ($questions.Count -eq 20) { Ok "level-test-83 has 20 questions." } else { Err ("level-test-83 question count is " + $questions.Count) }
  if ([int]$level.total_possible_points -eq 51) { Ok "level-test-83 total_possible_points is 51." } else { Err ("level-test-83 total_possible_points is " + $level.total_possible_points) }

  $q57 = $questions | Where-Object { [int]$_.question_number -eq 57 } | Select-Object -First 1
  $q58 = $questions | Where-Object { [int]$_.question_number -eq 58 } | Select-Object -First 1
  $q59 = $questions | Where-Object { [int]$_.question_number -eq 59 } | Select-Object -First 1
  $q60 = $questions | Where-Object { [int]$_.question_number -eq 60 } | Select-Object -First 1

  if ($q57 -and $q57.correct_order -and $q57.order_choice_orders) { Ok "Q57 sentence order fields exist." } else { Err "Q57 sentence order fields missing." }
  if ($q58 -and $q58.correct_order -and $q58.order_choice_orders) { Ok "Q58 sentence order fields exist." } else { Err "Q58 sentence order fields missing." }
  if ($q59 -and $q59.insert_sentence -and $q59.insert_positions -and $q59.correct_position) { Ok "Q59 insert fields exist." } else { Err "Q59 insert fields missing." }
  if ($q59 -and $q60 -and $q59.passage_group_id -eq $q60.passage_group_id) { Ok "Q59/Q60 passage_group_id is synchronized." } else { Err "Q59/Q60 passage_group_id mismatch." }
}

if ($ErrorCount -eq 0) {
  Write-Host "[PASS] STEP44 level-test-83 install is ready." -ForegroundColor Green
  exit 0
}

Write-Host ("[FAIL] Errors: " + $ErrorCount) -ForegroundColor Red
exit 1
