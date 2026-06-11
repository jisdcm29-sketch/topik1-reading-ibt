# TOPIK I Reading data contract validator - STEP42 v3
# Purpose:
# - Validate fixed round exam JSON files and level-test JSON files.
# - Check structures that protect reading-test.js logic when new exams are added.
# - This script intentionally uses simple ASCII-only PowerShell syntax to avoid parser/encoding problems.

$ErrorCount = 0
$WarningCount = 0

function Add-Err {
    param([string]$Message)
    $script:ErrorCount = $script:ErrorCount + 1
    Write-Host ("[ERROR] " + $Message) -ForegroundColor Red
}

function Add-Warn {
    param([string]$Message)
    $script:WarningCount = $script:WarningCount + 1
    Write-Host ("[WARN]  " + $Message) -ForegroundColor Yellow
}

function Add-Info {
    param([string]$Message)
    Write-Host ("[INFO]  " + $Message) -ForegroundColor Cyan
}

function Read-JsonFile {
    param([string]$Path)
    try {
        $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        return ($raw | ConvertFrom-Json)
    }
    catch {
        Add-Err ("JSON read/parse failed: " + $Path + " / " + $_.Exception.Message)
        return $null
    }
}

function Get-Questions {
    param($JsonObject)
    if ($null -eq $JsonObject) { return @() }

    if ($JsonObject -is [System.Array]) {
        return @($JsonObject)
    }

    if ($null -ne $JsonObject.questions) {
        return @($JsonObject.questions)
    }

    if ($null -ne $JsonObject.items) {
        return @($JsonObject.items)
    }

    return @()
}

function Has-Prop {
    param($Object, [string]$Name)
    if ($null -eq $Object) { return $false }
    return ($Object.PSObject.Properties.Name -contains $Name)
}

function Get-Num {
    param($Value)
    try {
        if ($null -eq $Value) { return $null }
        if ($Value -eq "") { return $null }
        return [int]$Value
    }
    catch {
        return $null
    }
}

function Is-ArrayLike {
    param($Value)
    if ($null -eq $Value) { return $false }
    if ($Value -is [System.Array]) { return $true }
    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) { return $true }
    return $false
}

function Get-QuestionByNumber {
    param($Questions, [int]$QNo)
    foreach ($q in $Questions) {
        $n = Get-Num $q.question_number
        if ($n -eq $QNo) { return $q }
    }
    return $null
}

function Get-QuestionType {
    param($Question)
    if ($null -eq $Question) { return "" }
    if ($null -eq $Question.type) { return "" }
    return [string]$Question.type
}

function Has-NonEmptyText {
    param($Value)
    if ($null -eq $Value) { return $false }
    return ([string]$Value).Trim().Length -gt 0
}

function Has-Options {
    param($Question)
    if ($null -eq $Question) { return $false }
    if ($null -eq $Question.options) { return $false }
    return (@($Question.options).Count -ge 2)
}

function Has-OrderChoiceOrders {
    param($Question)
    if ($null -eq $Question) { return $false }
    if (Has-Prop $Question "order_choice_orders") {
        if ($null -ne $Question.order_choice_orders) { return $true }
    }
    if (Has-Prop $Question "choice_orders") {
        if ($null -ne $Question.choice_orders) { return $true }
    }
    if (Has-Prop $Question "order_choices") {
        if ($null -ne $Question.order_choices) { return $true }
    }
    return $false
}

function Has-CorrectOrder {
    param($Question)
    if ($null -eq $Question) { return $false }
    if (Has-Prop $Question "correct_order") {
        if ($null -ne $Question.correct_order) { return $true }
    }
    if (Has-Prop $Question "correct_sequence") {
        if ($null -ne $Question.correct_sequence) { return $true }
    }
    if (Has-Prop $Question "answer_order") {
        if ($null -ne $Question.answer_order) { return $true }
    }
    return $false
}

function Has-InsertPositions {
    param($Question)
    if ($null -eq $Question) { return $false }
    if (Has-Prop $Question "insert_positions") {
        if ($null -ne $Question.insert_positions) { return $true }
    }
    if (Has-Prop $Question "insert_markers") {
        if ($null -ne $Question.insert_markers) { return $true }
    }
    if (Has-Prop $Question "markers") {
        if ($null -ne $Question.markers) { return $true }
    }
    return $false
}

function Get-PassageGroupId {
    param($Question)
    if ($null -eq $Question) { return "" }
    if (Has-NonEmptyText $Question.passage_group_id) { return ([string]$Question.passage_group_id).Trim() }
    if (Has-NonEmptyText $Question.group_id) { return ([string]$Question.group_id).Trim() }
    if (Has-NonEmptyText $Question.shared_passage_id) { return ([string]$Question.shared_passage_id).Trim() }
    return ""
}

function Validate-CommonPair {
    param($Questions, [int]$A, [int]$B, [string]$FileName)

    $q1 = Get-QuestionByNumber $Questions $A
    $q2 = Get-QuestionByNumber $Questions $B

    if ($null -eq $q1 -or $null -eq $q2) {
        Add-Warn ($FileName + ": common pair " + $A + "-" + $B + " cannot be fully checked because one item is missing.")
        return
    }

    $g1 = Get-PassageGroupId $q1
    $g2 = Get-PassageGroupId $q2

    if ($g1 -ne "" -and $g2 -ne "" -and $g1 -ne $g2) {
        Add-Err ($FileName + ": common pair " + $A + "-" + $B + " has different passage_group_id values.")
    }

    if ($g1 -eq "" -and $g2 -eq "") {
        Add-Warn ($FileName + ": common pair " + $A + "-" + $B + " has no passage_group_id. Existing fallback may work, but new exams should add it.")
    }
}

function Validate-SentenceOrder {
    param($Questions, [int]$QNo, [string]$FileName)

    $q = Get-QuestionByNumber $Questions $QNo
    if ($null -eq $q) {
        Add-Warn ($FileName + ": question " + $QNo + " not found for sentence-order check.")
        return
    }

    $type = Get-QuestionType $q
    if ($type -ne "sentence_order") {
        Add-Warn ($FileName + ": question " + $QNo + " type is not sentence_order. Actual type: " + $type)
    }

    if (-not (Has-Options $q)) {
        Add-Err ($FileName + ": question " + $QNo + " has no options for sentence-order answer choices.")
    }

    if (-not (Has-OrderChoiceOrders $q)) {
        Add-Warn ($FileName + ": question " + $QNo + " has no order_choice_orders. Options text fallback may work, but new exams should add full order arrays.")
    }

    if (-not (Has-CorrectOrder $q)) {
        Add-Warn ($FileName + ": question " + $QNo + " has no correct_order/correct_sequence/answer_order.")
    }
}

function Validate-SentenceInsert {
    param($Questions, [int]$QNo, [string]$FileName)

    $q = Get-QuestionByNumber $Questions $QNo
    if ($null -eq $q) {
        Add-Warn ($FileName + ": question " + $QNo + " not found for sentence-insert check.")
        return
    }

    $type = Get-QuestionType $q
    if ($type -ne "sentence_insert") {
        Add-Warn ($FileName + ": question " + $QNo + " type is not sentence_insert. Actual type: " + $type)
    }

    if (-not (Has-NonEmptyText $q.insert_sentence)) {
        Add-Err ($FileName + ": question " + $QNo + " has no insert_sentence.")
    }

    if (-not (Has-Options $q)) {
        Add-Warn ($FileName + ": question " + $QNo + " has no options. Insert marker buttons may rely on passage markers.")
    }

    if (-not (Has-InsertPositions $q)) {
        Add-Warn ($FileName + ": question " + $QNo + " has no insert_positions/insert_markers. Passage markers may still work, but new exams should add marker data.")
    }
}

function Validate-ImageQuestion {
    param($Questions, [int]$QNo, [string]$FileName, [string]$RootDir)

    $q = Get-QuestionByNumber $Questions $QNo
    if ($null -eq $q) {
        Add-Warn ($FileName + ": image question " + $QNo + " not found.")
        return
    }

    if (-not (Has-NonEmptyText $q.image_url)) {
        Add-Warn ($FileName + ": image question " + $QNo + " has no image_url.")
        return
    }

    $url = ([string]$q.image_url).Trim()
    if ($url.StartsWith("./")) {
        $relative = $url.Substring(2)
    }
    else {
        $relative = $url
    }

    $imagePath = Join-Path $RootDir ("reading-test\" + $relative)
    if (-not (Test-Path -LiteralPath $imagePath)) {
        Add-Warn ($FileName + ": image file not found for question " + $QNo + " -> " + $url)
    }
}

function Validate-ExamFile {
    param([string]$Path, [string]$RootDir)

    $fileName = Split-Path $Path -Leaf
    Add-Info ("Checking " + $fileName)

    $data = Read-JsonFile $Path
    if ($null -eq $data) { return }

    $questions = @(Get-Questions $data)

    if ($questions.Count -eq 0) {
        Add-Err ($fileName + ": no questions array found.")
        return
    }

    $isLevelTest = $fileName -like "level-test-*"
    if ($isLevelTest) {
        if ($questions.Count -ne 20) {
            Add-Warn ($fileName + ": expected 20 level-test questions, found " + $questions.Count)
        }
    }
    else {
        if ($questions.Count -ne 40) {
            Add-Err ($fileName + ": expected 40 full-test questions, found " + $questions.Count)
        }
    }

    $seen = @{}
    foreach ($q in $questions) {
        $n = Get-Num $q.question_number
        if ($null -eq $n) {
            Add-Err ($fileName + ": a question has missing/invalid question_number.")
            continue
        }
        if ($n -lt 31 -or $n -gt 70) {
            Add-Err ($fileName + ": question_number out of range 31-70 -> " + $n)
        }
        if ($seen.ContainsKey([string]$n)) {
            Add-Err ($fileName + ": duplicated question_number -> " + $n)
        }
        else {
            $seen[[string]$n] = $true
        }

        if (-not (Has-NonEmptyText $q.id)) {
            Add-Warn ($fileName + ": question " + $n + " has no id.")
        }

        if (-not (Has-NonEmptyText $q.type)) {
            Add-Err ($fileName + ": question " + $n + " has no type.")
        }

        if (-not (Has-Options $q)) {
            $type = Get-QuestionType $q
            if ($type -ne "sentence_insert") {
                Add-Warn ($fileName + ": question " + $n + " has fewer than 2 options.")
            }
        }
    }

    $pairs = @(
        @(49,50), @(51,52), @(53,54), @(55,56),
        @(59,60), @(61,62), @(63,64), @(65,66),
        @(67,68), @(69,70)
    )

    foreach ($pair in $pairs) {
        $qa = Get-QuestionByNumber $questions $pair[0]
        $qb = Get-QuestionByNumber $questions $pair[1]
        if ($null -ne $qa -or $null -ne $qb) {
            Validate-CommonPair $questions $pair[0] $pair[1] $fileName
        }
    }

    Validate-SentenceOrder $questions 57 $fileName
    Validate-SentenceOrder $questions 58 $fileName
    Validate-SentenceInsert $questions 59 $fileName
    Validate-CommonPair $questions 59 60 $fileName

    Validate-ImageQuestion $questions 40 $fileName $RootDir
    Validate-ImageQuestion $questions 41 $fileName $RootDir
    Validate-ImageQuestion $questions 42 $fileName $RootDir
    Validate-ImageQuestion $questions 63 $fileName $RootDir
    Validate-ImageQuestion $questions 64 $fileName $RootDir
}

function Main {
    $rootDir = (Get-Location).Path
    $examDir = Join-Path $rootDir "reading-test\data\exams"

    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "TOPIK I Reading data contract validator - STEP42 v3" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ("Root: " + $rootDir)

    if (-not (Test-Path -LiteralPath $examDir)) {
        Add-Err ("Exam directory not found: " + $examDir)
    }
    else {
        $files = Get-ChildItem -LiteralPath $examDir -Filter "*.json" | Sort-Object Name
        if ($files.Count -eq 0) {
            Add-Err ("No exam JSON files found in " + $examDir)
        }
        else {
            foreach ($file in $files) {
                Validate-ExamFile $file.FullName $rootDir
            }
        }
    }

    Write-Host ""
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "Validation summary" -ForegroundColor Cyan
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host ("Errors  : " + $script:ErrorCount)
    Write-Host ("Warnings: " + $script:WarningCount)

    if ($script:ErrorCount -gt 0) {
        Write-Host "Result: FAIL - fix errors before adding new exams." -ForegroundColor Red
        exit 1
    }
    else {
        Write-Host "Result: PASS - no fatal errors. Review warnings before release." -ForegroundColor Green
        exit 0
    }
}

Main
