TOPIK I Reading IBT Simulation - reading-test
================================================

1. 현재 목적
------------------------------------------------
이 폴더는 TOPIK I 읽기 IBT 체험 시험을 실행하는 reading-test 영역입니다.

reading-test는 읽기 시험 실행만 담당합니다.
시험 결과 분석과 처방 보고서는 reading-diagnosis 폴더에서 담당합니다.

현재 구조는 TOPIK I 읽기 31번~70번, 총 40문항, 100점 만점, 60분 시험을 기준으로 합니다.


2. 현재 주요 기능
------------------------------------------------
1) 인증 비밀번호 입력
2) 응시자 이름 입력
3) 전화번호 입력
4) 시험 시작
5) TOPIK I 읽기 31~70번 총 40문항 표시
6) 60분 타이머
7) 이전 / 다음 / 전체 문제 이동
8) 70번 화면에서만 제출 버튼 표시
9) 제출 후 결과 화면 표시
10) reading-result.json 다운로드
11) reading-result.txt 다운로드
12) localStorage를 통한 reading-diagnosis 자동 연결
13) 새 문제 만들기 버튼
14) question-bank.json 기반 랜덤 시험지 생성
15) generated-reading-questions.json 우선 로드
16) generated-reading-questions.json이 없으면 reading-questions.json으로 대체 로드


3. 인증 비밀번호
------------------------------------------------
현재 인증 비밀번호는 내부 테스트용입니다.

기본 비밀번호:
topik1

주의:
HTML/JS 기반 비밀번호는 완전한 보안 기능이 아닙니다.
외부 공개용 정식 로그인 기능은 서버 기반 인증이 필요합니다.


4. 주요 파일
------------------------------------------------
index.html
- 시험 첫 화면과 전체 UI 구조를 담당합니다.
- 인증 비밀번호, 이름, 전화번호, 새 문제 만들기 버튼, 시험 영역을 포함합니다.

reading-test.js
- 시험 실행 로직을 담당합니다.
- 문제 로드, 답안 저장, 화면 이동, 타이머, 제출, 결과 파일 생성을 처리합니다.
- generated-reading-questions.json을 먼저 읽고, 없으면 reading-questions.json을 읽습니다.

reading-questions.json
- 기본 고정 시험지입니다.
- generated-reading-questions.json이 없을 때 대체로 사용됩니다.

generated-reading-questions.json
- question-bank.json과 exam-template.json을 바탕으로 생성된 랜덤 시험지입니다.
- 31~70번 총 40문항 구조를 유지합니다.

question-bank.json
- 문제은행 파일입니다.
- 현재 기존 문제와 103회 문제를 포함하여 총 80문항 규모로 구성되어 있습니다.
- single_items와 passage_sets 구조를 사용합니다.

exam-template.json
- 31~70번의 유형, 배점, 공통 지문 세트 배치를 고정하는 템플릿입니다.
- 랜덤 출제 시 아무 문제나 섞지 않고, 각 번호 위치에 맞는 유형만 선택하게 합니다.

question-generator.js
- question-bank.json과 exam-template.json을 읽어 새 40문항 시험지를 생성합니다.
- 새 문제 만들기 버튼과 연결됩니다.

question-bank-builder.js
- 문제은행 점검 및 생성 보조 도구입니다.

question-bank-merge-103.js
- 103회 문제를 기존 question-bank.json에 병합하기 위해 사용한 작업 도구입니다.
- 현재 103회 병합은 완료되었습니다.
- 다시 실행하면 중복 병합될 수 있으므로 주의해야 합니다.

images 폴더
- 자료형, 생활문, 공통 지문 이미지 파일을 보관합니다.
- 예: R040.png, R041.png, R042.png, 103_R040.png, 103_R063_064.png


5. 현재 문제은행 상태
------------------------------------------------
현재 question-bank.json 상태:

single_items: 36
passage_sets: 22
passage_set_items: 44
total_questions: 80
total_bank_questions: 80

의미:
기존 40문항
+
103회 40문항
=
총 80문항 문제은행

주의:
question-bank-merge-103.js를 다시 실행하지 마세요.
이미 103회가 병합되어 있으므로 다시 실행하면 문제가 중복될 수 있습니다.


6. 랜덤 시험지 생성 구조
------------------------------------------------
랜덤 시험지 생성 순서:

1) exam-template.json을 읽습니다.
2) question-bank.json을 읽습니다.
3) 31~70번 각 번호의 유형과 배점에 맞는 후보 문제를 찾습니다.
4) 단일 문항은 단일 문항 후보에서 선택합니다.
5) 공통 지문 문제는 세트 단위로 함께 선택합니다.
6) 선택된 문제를 31~70번으로 다시 번호 매깁니다.
7) generated-reading-questions.json 구조를 만듭니다.
8) reading-test.js가 generated-reading-questions.json을 우선 로드합니다.


7. 공통 지문 세트 관리
------------------------------------------------
다음 문항은 공통 지문 세트로 함께 관리합니다.

49~50
51~52
53~54
55~56
57~58
59~60
61~62
63~64
65~66
67~68
69~70

특히 57~58번은 문장 순서 배열 문제이므로 일반 선택형과 다르게 처리합니다.
59번은 문장 삽입 문제이므로 삽입 위치 선택 구조를 유지합니다.


8. 빈칸 표시 처리
------------------------------------------------
현재 reading-test.js는 다음 빈칸 표시를 인식합니다.

(     )
(    )
(   )
(  )
( )
㉠
㉡
㉢
㉣
(㉠)
(㉡)
(㉢)
(㉣)
_____
____
[빈칸]
[blank]

51번, 61번, 69번처럼 지문에 ㉠ 표시가 있는 문제는 선택지를 누르면 해당 위치에 선택 문장이 들어가도록 처리됩니다.


9. 결과 파일 구조
------------------------------------------------
시험 제출 후 생성되는 파일:

reading-result.json
reading-result.txt

reading-result.json 주요 항목:
test_level
section
test_name
test_scope
question_number_start
question_number_end
expected_total_questions
is_full_40_question_set
student_name
student_phone
started_at
submitted_at
time_limit_minutes
total_questions
answered_count
unanswered_count
correct_count
wrong_count
total_possible_points
earned_points
section_score_100
unanswered_questions
items

문항별 주요 항목:
id
question_number
type
category
diagnostic_area
instruction
question
passage
options
points
earned_points
correct_answer
student_answer
is_correct
description

문제은행 기반 추가 항목:
source_bank_id
generated_exam_id
template_slot

주의:
review_marked
review_marked_questions
검토 표시 문항
검토 표시: 아니오

위 항목과 문구는 결과 파일에 포함하지 않습니다.


10. 진단 연결
------------------------------------------------
시험 제출 후 localStorage를 통해 reading-diagnosis와 자동 연결할 수 있습니다.

진단 페이지 위치:
../reading-diagnosis/index.html?auto=1

진단 프로그램은 다음을 생성합니다.

diagnosis-report.json
diagnosis-report.txt
PDF 인쇄 / 저장 보고서

시험 범위 표기는 다음과 같이 유지합니다.

TOPIK I IBT Reading 31-70


11. 로컬 실행 방법
------------------------------------------------
file:/// 직접 실행은 권장하지 않습니다.
반드시 로컬 서버로 실행합니다.

PowerShell에서 실행:

cd C:\topik1-separated-system
python -m http.server 5500

브라우저 주소:

http://localhost:5500/reading-test/index.html


12. GitHub Pages 실행 주소
------------------------------------------------
시험 페이지:

https://jisdcm29-sketch.github.io/topik1-reading-ibt/reading-test/index.html

진단 페이지:

https://jisdcm29-sketch.github.io/topik1-reading-ibt/reading-diagnosis/index.html

캐시 확인용으로 주소 뒤에 버전값을 붙일 수 있습니다.

예:
https://jisdcm29-sketch.github.io/topik1-reading-ibt/reading-test/index.html?v=final-check


13. GitHub Pages 업로드 시 필수 파일
------------------------------------------------
reading-test 폴더에 필요한 핵심 파일:

index.html
reading-test.js
reading-questions.json
generated-reading-questions.json
question-bank.json
exam-template.json
question-generator.js
question-bank-builder.js

images 폴더에 필요한 이미지:

R040.png
R041.png
R042.png
103_R040.png
103_R041.png
103_R042.png
103_R063_064.png
100_R040.png
100_R041.png
100_R042.png
100_R063_064.png


14. 현재 정상 확인된 항목
------------------------------------------------
1) GitHub Pages 배포 성공
2) 인증 비밀번호 화면 정상
3) 새 문제 만들기 버튼 정상
4) 80문항 문제은행 기반 랜덤 40문항 생성 정상
5) 31~70번 번호 구조 정상
6) 총점 100점 정상
7) 103회 문제와 기존 문제가 섞여 출제됨
8) 40번, 63~64번 이미지 표시 정상
9) 51번, 61번, 69번 ㉠ 빈칸 선택지 삽입 정상
10) 70번 제출 정상
11) reading-result.json / txt 생성 정상
12) reading-diagnosis 자동 연결 정상
13) diagnosis-report.json / txt / PDF 생성 정상
14) 시험 범위 TOPIK I IBT Reading 31-70 표시 정상
15) 검토 표시 관련 문구 제거 상태 유지


15. 다음 개발 후보
------------------------------------------------
다음 단계 후보:

1) GitHub 저장소의 작업용 중간 파일 정리
2) 100회 문제를 question-bank.json에 병합
3) PDF 문제지 반자동 변환 도구 설계
4) 문제은행 관리용 점검 도구 강화
5) 새 문제 만들기 결과를 파일로 다운로드하는 기능 정리
6) 외부 배포용 안내문 작성

주의:
듣기, TOPIK II, adaptive 기능은 현재 우선 작업이 아닙니다.
reading-test는 읽기 시험 실행만 담당합니다.
reading-diagnosis는 읽기 결과 분석만 담당합니다.