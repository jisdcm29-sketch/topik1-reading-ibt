$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$BankPath = Join-Path $Root "reading-test\data\bank\question-bank.json"
$GeneratorPath = Join-Path $Root "reading-test\question-generator.js"

function Fail($Message) {
  Write-Host "[FAIL] $Message" -ForegroundColor Red
  exit 1
}

function Ok($Message) {
  Write-Host "[OK] $Message" -ForegroundColor Green
}

if (!(Test-Path $BankPath)) { Fail "question-bank.json not found." }
Ok "question-bank.json exists."

if (!(Test-Path $GeneratorPath)) { Fail "question-generator.js not found." }
Ok "question-generator.js exists."

$Bank = Get-Content -Raw -Encoding UTF8 $BankPath | ConvertFrom-Json

$Single83 = @($Bank.single_items | Where-Object { $_.source_round -eq "83" })
$Sets83 = @($Bank.passage_sets | Where-Object { $_.source_round -eq "83" })

if ($Single83.Count -ne 18) { Fail "83 single_items count is $($Single83.Count), expected 18." }
Ok "83 single_items count is 18."

if ($Sets83.Count -ne 11) { Fail "83 passage_sets count is $($Sets83.Count), expected 11." }
Ok "83 passage_sets count is 11."

$SetItems83Count = 0
foreach ($Set in $Sets83) {
  $SetItems83Count += @($Set.items).Count
}
if ($SetItems83Count -ne 22) { Fail "83 passage set items count is $SetItems83Count, expected 22." }
Ok "83 passage set items count is 22."

$Q57Set = $Sets83 | Where-Object { ($_.target_slots -join ",") -eq "57,58" } | Select-Object -First 1
if (!$Q57Set) { Fail "83 sentence order set 57-58 not found." }
Ok "83 sentence order set 57-58 exists."

$Q57 = $Q57Set.items | Where-Object { $_.target_slot -eq 57 } | Select-Object -First 1
$Q58 = $Q57Set.items | Where-Object { $_.target_slot -eq 58 } | Select-Object -First 1

if (!$Q57.correct_order -or !$Q57.order_choice_orders -or !$Q57.start_candidate_labels) {
  Fail "Q57 sentence order fields are incomplete."
}
Ok "Q57 sentence order fields exist."

if (!$Q58.correct_order -or !$Q58.order_choice_orders -or !$Q58.start_candidate_labels) {
  Fail "Q58 sentence order fields are incomplete."
}
Ok "Q58 sentence order fields exist."

$Q59Set = $Sets83 | Where-Object { ($_.target_slots -join ",") -eq "59,60" } | Select-Object -First 1
if (!$Q59Set) { Fail "83 sentence insert set 59-60 not found." }
Ok "83 sentence insert set 59-60 exists."

if ($Q59Set.set_type -ne "sentence_insert_common_passage_2_questions") {
  Fail "Q59/Q60 set_type is $($Q59Set.set_type)."
}
Ok "Q59/Q60 set_type is correct."

$Q59 = $Q59Set.items | Where-Object { $_.target_slot -eq 59 } | Select-Object -First 1
$Q60 = $Q59Set.items | Where-Object { $_.target_slot -eq 60 } | Select-Object -First 1

if (!$Q59.insert_sentence -or !$Q59.insert_positions -or !$Q59.insert_markers -or !$Q59.correct_position) {
  Fail "Q59 insert fields are incomplete."
}
Ok "Q59 insert fields exist."

if (!$Q60 -or $Q60.type -ne "common_passage_question") {
  Fail "Q60 common passage question is incomplete."
}
Ok "Q60 common passage question exists."

$GeneratorText = Get-Content -Raw -Encoding UTF8 $GeneratorPath
if ($GeneratorText -notmatch "order_choice_orders") {
  Fail "question-generator.js does not preserve order_choice_orders."
}
Ok "question-generator.js preserves order_choice_orders."

if ($GeneratorText -notmatch "insert_markers") {
  Fail "question-generator.js does not preserve insert_markers."
}
Ok "question-generator.js preserves insert_markers."

if ($GeneratorText -notmatch "start_candidate_labels") {
  Fail "question-generator.js does not preserve start_candidate_labels."
}
Ok "question-generator.js preserves start_candidate_labels."

Write-Host "[PASS] STEP45 question-bank 83 install is ready." -ForegroundColor Green
