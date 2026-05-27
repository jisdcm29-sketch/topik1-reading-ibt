TOPIK I Reading IBT Simulation - reading-test
================================================

1. 현재 목적
------------------------------------------------
이 폴더는 TOPIK I 읽기 PBT 문제를 컴퓨터 화면에서 풀 수 있도록 만든
PBT형 IBT 시뮬레이션의 시험 실행 영역입니다.

이 프로그램은 공식 TOPIK I IBT 복제 프로그램이 아닙니다.
TOPIK I PBT 읽기 31~70번 문제를 화면 기반으로 구현한
TOPIK I Reading PBT-type IBT Simulation입니다.

reading-test는 읽기 시험 실행만 담당합니다.
시험 결과 분석과 진단 보고서는 reading-diagnosis 폴더에서 담당합니다.

현재 기본 구조는 다음과 같습니다.

- TOPIK I 읽기
- 31번~70번
- 총 40문항
- 60분
- 100점 만점
- 회차 고정 출제
- 문제은행 기반 랜덤 출제
- 제출 후 reading-diagnosis 자동 연결


2. 현재 주요 기능
------------------------------------------------
현재 reading-test의 주요 기능은 다음과 같습니다.

1) 인증 비밀번호 입력
2) 응시자 이름 입력
3) 전화번호 입력
4) 시험지 선택
5) 회차 고정 출제
6) 문제은행 기반 랜덤 출제
7) TOPIK I 읽기 31~70번 총 40문항 표시
8) 60분 타이머
9) 이전 / 다음 / 전체 문제 이동
10) 마지막 문항에서 제출 버튼 표시
11) 제출 후 결과 요약 표시
12) reading-result.json 구조 생성
13) reading-result.txt 생성
14) localStorage를 통한 reading-diagnosis 자동 연결
15) 오답 다시 풀기 연결
16) 미응답 문항도 오답풀이 대상에 포함
17) 오답풀이 후 남은 오답만 다시 출제
18) 남은 오답풀이 문항 수 갱신
19) 새 문제 만들기 버튼
20) question-bank.json 기반 랜덤 시험지 생성
21) generated-reading-questions.json 우선 로드
22) generated-reading-questions.json이 없으면 reading-questions.json으로 대체 로드


3. 인증 비밀번호
------------------------------------------------
현재 인증 비밀번호는 내부 테스트용입니다.

기본 비밀번호:
topik1

주의:
HTML/JS 기반 비밀번호는 완전한 보안 기능이 아닙니다.
외부 공개용 정식 로그인 기능이 필요하면 서버 기반 인증을 별도로 구축해야 합니다.


4. 주요 폴더 구조
------------------------------------------------
기본 폴더:

C:\topik1-separated-system\reading-test
C:\topik1-separated-system\reading-diagnosis

reading-test는 시험 실행만 담당합니다.
reading-diagnosis는 결과 분석과 진단 보고서만 담당합니다.

듣기, 쓰기, TOPIK II, adaptive 기능은 이 구조에 섞지 않습니다.


5. reading-test 주요 파일
------------------------------------------------
index.html
- 시험 첫 화면과 전체 UI 구조를 담당합니다.
- 인증 비밀번호, 이름, 전화번호, 시험지 선택, 새 문제 만들기 버튼, 시험 화면, 결과 화면을 포함합니다.
- 하단 이전 / 전체 문제 / 다음 / 제출 버튼의 화면 구조도 포함합니다.
- 학생 화면에서 개발자용 다운로드 버튼은 노출하지 않는 방향을 유지합니다.

reading-test.js
- 시험 실행 로직을 담당합니다.
- 문제 로드, 답안 저장, 화면 이동, 타이머, 제출, 결과 파일 생성을 처리합니다.
- generated-reading-questions.json을 먼저 읽고, 없으면 reading-questions.json을 읽습니다.
- question-generator.js와 연결하여 새 문제 만들기 기능을 처리합니다.
- 오답 다시 풀기 모드도 처리합니다.

reading-questions.json
- 기본 고정 시험지입니다.
- generated-reading-questions.json이 없을 때 대체로 사용됩니다.

generated-reading-questions.json
- question-bank.json과 exam-template.json을 바탕으로 생성된 랜덤 시험지입니다.
- 31~70번 총 40문항 구조를 유지합니다.
- GitHub Pages에서는 서버 파일을 직접 덮어쓰지 못하므로, 브라우저 실행 중 생성된 문제 세트는 현재 세션에서 적용됩니다.

question-bank.json
- 기본 문제은행 파일입니다.
- 100회, 103회 및 기존 문제를 포함하는 구조로 확장되어 있습니다.
- 단일 문항과 공통 지문 세트를 함께 관리합니다.
- 문제은행 내부 id와 시험 표시 번호는 구분합니다.

exam-template.json
- 31~70번의 유형, 배점, 공통 지문 세트 배치를 고정하는 템플릿입니다.
- 랜덤 출제 시 아무 문제나 섞지 않고, 각 번호 위치에 맞는 유형만 선택하게 합니다.
- TOPIK I 31~70번 위치 구조를 유지합니다.

question-generator.js
- question-bank.json과 exam-template.json을 읽어 새 40문항 시험지를 생성합니다.
- 새 문제 만들기 버튼과 연결됩니다.
- 공통 지문 세트와 문장 순서 세트는 세트 단위로 함께 선택해야 합니다.

question-bank-builder.js
- 문제은행 점검 및 생성 보조 도구입니다.
- 운영 필수 파일은 아니지만, 문제은행 유지·검토용으로 보관할 수 있습니다.

question-bank-merge-100.js
question-bank-merge-103.js
- 100회, 103회 문제를 question-bank.json에 병합하기 위해 사용한 작업 도구입니다.
- 이미 병합이 끝난 상태에서 다시 실행하면 중복 병합될 수 있으므로 주의해야 합니다.

images 폴더
- 자료형, 생활문, 공통 지문 이미지 파일을 보관합니다.
- 이미지 경로는 상대 경로를 유지합니다.
- 예:
  R040.png
  R041.png
  R042.png
  100_R040.png
  100_R041.png
  100_R042.png
  100_R063_064.png
  103_R040.png
  103_R041.png
  103_R042.png
  103_R063_064.png


6. 현재 문제은행 상태
------------------------------------------------
현재 question-bank.json은 TOPIK I 읽기 31~70번 구조를 기준으로
회차 고정 출제와 랜덤 출제를 모두 지원하는 문제은행입니다.

현재 포함된 주요 회차:
- 기존 기본 문제 세트
- 100회 문제
- 103회 문제

중요:
정확한 문항 수는 항상 최신 question-bank.json을 기준으로 확인합니다.
앞으로 다른 회차 문제지가 계속 추가될 예정이므로,
README에 고정된 문항 수를 단정하기보다 최신 question-bank.json 상태를 우선 확인합니다.

문제은행 관리 기준:
- type
- category
- diagnostic_area
- source_round
- original_question_number
- passage_group_id
- original passage set 구조
- TOPIK I 31~70번 위치 구조

주의:
이미 병합된 회차의 merge 스크립트를 다시 실행하지 마세요.
중복 병합 위험이 있습니다.


7. 시험지 선택 구조
------------------------------------------------
시험지 선택 영역은 유지합니다.

현재 구조는 다음을 지원합니다.

1) 회차 고정 출제
   - 예: 100회 고정 출제
   - 예: 103회 고정 출제

2) 랜덤 출제
   - 문제은행에서 번호 위치와 유형 구조에 맞게 문제를 선택합니다.
   - 랜덤 출제는 아무 문제나 섞는 것이 아닙니다.
   - 31~70번 각 위치의 유형과 배점을 유지합니다.

3) 새 문제 만들기
   - question-generator.js가 question-bank.json과 exam-template.json을 읽고 새 40문항 세트를 구성합니다.
   - 회차가 더 늘어나도 확장 가능한 구조를 유지합니다.

주의:
완성된 회차에는 “준비 중”이라고 표시하지 않습니다.
실제로 작동하는 랜덤 출제는 “랜덤 출제”로 표시합니다.
시험 시작 전에 현재 선택된 시험지를 다시 불러와 실제 문제지와 화면 선택값이 어긋나지 않게 합니다.


8. 랜덤 시험지 생성 구조
------------------------------------------------
랜덤 시험지 생성 순서:

1) exam-template.json을 읽습니다.
2) question-bank.json을 읽습니다.
3) 31~70번 각 번호의 유형과 배점에 맞는 후보 문제를 찾습니다.
4) 단일 문항은 단일 문항 후보에서 선택합니다.
5) 공통 지문 문제는 세트 단위로 함께 선택합니다.
6) 문장 순서 세트와 문장 삽입 세트는 개별 문항처럼 분리하지 않습니다.
7) 선택된 문제를 31~70번으로 다시 번호 매깁니다.
8) generated-reading-questions.json 구조를 만듭니다.
9) reading-test.js가 생성된 문제 세트를 우선 적용합니다.

중요:
랜덤 출제는 유형 구조를 무시하고 섞는 방식이 아닙니다.
TOPIK I PBT 읽기 31~70번의 위치별 유형 구조를 유지해야 합니다.


9. TOPIK I 31~70번 기본 구간
------------------------------------------------
현재 진단 보고서와 문제 구조는 다음 구간 기준을 사용합니다.

31~34번
- 빈칸·어휘·문법
- 문맥에 맞는 어휘, 조사, 연결 표현 선택

35~38번
- 짧은 글 내용 파악
- 짧은 글의 주제, 소재, 내용 일치·불일치 파악

39~42번
- 자료·그림 정보 파악
- 그림, 표, 안내 자료의 핵심 정보 이해

43~46번
- 문장 순서·흐름 이해
- 문장 배열, 시간 흐름, 지시어와 연결 관계 파악

47~48번
- 중심 내용·세부 정보
- 글의 중심 생각과 구체적 정보 이해

49~56번
- 공통 지문·생활문 정보
- 공통 지문, 안내문, 생활문에서 필요한 정보 찾기

57~60번
- 문장 순서·문장 삽입
- 글의 흐름, 삽입 위치, 문장 간 연결 단서 파악

61~70번
- 긴 지문·공통 지문 이해
- 긴 글의 세부 내용, 추론, 글쓴이 의도 파악


10. 공통 지문 세트 관리
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

특히 다음 유형은 일반 선택형과 다르게 처리합니다.

57~58번
- 문장 순서 배열 문제
- 선택지 문장을 순서대로 배치해야 합니다.
- 오른쪽 문장을 더블클릭하면 왼쪽 다음 빈칸에 자동 배치되도록 개선되었습니다.
- TOPIK II 화면 방식처럼 먼저 시작 문장 후보를 고르고, 이후 남은 문장을 순서대로 선택하는 방식으로 개선되었습니다.

59번
- 문장 삽입 문제
- 삽입할 문장은 별도 강조 박스로 표시합니다.
- “삽입할 문장”이라는 불필요한 제목 문구는 제거하고 문장 자체만 보이도록 정리했습니다.

51번, 61번, 69번 등
- 지문 안에 ㉠ 또는 빈칸 표시가 있는 문제는 선택지를 누르면 해당 위치에 선택 문장이 들어가도록 처리합니다.


11. 빈칸 표시 처리
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

지문에 ㉠ 표시가 있는 문제는 선택지를 누르면 해당 위치에 선택 문장이 들어가도록 처리합니다.


12. 화면 UI 개선 상태
------------------------------------------------
현재 reading-test 화면에는 다음 개선이 반영되어 있습니다.

1) TOPIK I 첫 화면 정리
- TOPIK II 화면을 참고하여 TOPIK I 첫 화면을 정돈했습니다.
- 단, TOPIK II 코드를 그대로 섞지 않았습니다.

2) 시험 화면 확대
- 하단 이전 / 전체 문제 / 다음 / 제출 버튼은 고정 유지합니다.
- 상단 응시자 정보와 남은 시험 시간이 보이도록 유지합니다.
- 본문 영역은 화면을 더 효율적으로 사용하도록 조정했습니다.

3) “맞지 않는 것” 강조
- “맞지 않는 것”을 고르는 문제에서 해당 표현을 빨간색으로 강조하여 응시자가 문제 요구를 더 쉽게 인식하도록 했습니다.

4) 선택지 패널 정리
- 불필요한 “선택지” 문구를 줄이고, 오른쪽 문제 패널에는 문제 번호가 자연스럽게 보이도록 정리했습니다.

5) 이미지형 문제 정리
- 40~42번 자료형 문제는 좌우 2단 구조를 유지합니다.
- 이미지가 잘 보이도록 크기를 조정했습니다.
- 이미지 아래에 중복 텍스트가 나오지 않도록 정리했습니다.

6) 공통 지문 이미지 문제 정리
- 63~64번처럼 이미지 안에 글이 들어 있는 문제는 이미지 아래 중복 지문을 숨깁니다.
- 이미지가 왼쪽 패널 폭에 맞게 크게 보이도록 조정했습니다.

7) 문장 순서 문제 개선
- 오른쪽 문장을 더블클릭하면 왼쪽 다음 빈칸에 자동 배치됩니다.
- 먼저 시작 문장 후보를 선택하고 이후 남은 문장을 순서대로 배치하는 구조를 사용합니다.
- 기존 drag/drop 방식도 유지합니다.

8) 문장 삽입 문제 개선
- 삽입할 문장은 색이 있는 박스 안에 표시합니다.
- 박스 안의 불필요한 제목 문구는 제거했습니다.


13. 결과 파일 구조
------------------------------------------------
시험 제출 후 생성되는 파일:

reading-result.json
reading-result.txt

reading-result.json 필수 상위 항목:

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
generated_exam_mode
generated_exam_round
generated_exam_label
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
source_round
original_question_number
generated_exam_id
template_slot
passage_group_id

주의:
다음 항목과 문구는 결과 파일에 포함하지 않습니다.

review_marked
review_marked_questions
검토 표시 문항
검토 표시: 아니오
검토 표시 후
검토 표시를 활용
표시하고 넘어가는
표시 후 돌아오는


14. localStorage 연결 구조
------------------------------------------------
TOPIK I 전용 localStorage 키만 사용합니다.

권장 키:

topik1_latest_reading_result
topik1_wrong_review_question_numbers
topik1_wrong_review_source_result

topik1_latest_reading_result
- 첫 번째 40문항 일반 시험 결과를 저장합니다.
- 오답풀이 결과가 이 값을 덮어쓰면 안 됩니다.

topik1_wrong_review_question_numbers
- 틀린 문항과 미응답 문항을 모두 포함합니다.
- 남은 오답이 0개여도 삭제하지 말고 []로 저장합니다.

topik1_wrong_review_source_result
- 오답풀이의 원본 시험 결과를 보관합니다.
- 오답풀이 중간 복귀와 남은 오답 갱신에 사용합니다.


15. 오답 다시 풀기 구조
------------------------------------------------
오답 다시 풀기 기능은 다음 원칙을 따릅니다.

1) 틀린 문항과 미응답 문항을 모두 포함합니다.
2) 오답풀이 결과는 진단 보고서를 덮어쓰지 않습니다.
3) 오답풀이 중간 종료가 가능해야 합니다.
4) 오답풀이 후 남은 오답 수가 진단 보고서에 갱신되어야 합니다.
5) 다시 오답 다시 풀기를 누르면 남은 오답만 출제되어야 합니다.
6) 오답풀이 버튼은 TOPIK II가 아니라 TOPIK I reading-test로 연결되어야 합니다.
7) 남은 오답이 0개이면 오답 다시 풀기 버튼은 비활성화됩니다.


16. reading-diagnosis 연결
------------------------------------------------
시험 제출 후 localStorage를 통해 reading-diagnosis와 자동 연결할 수 있습니다.

진단 페이지 위치:

../reading-diagnosis/index.html?auto=1

진단 프로그램은 다음을 생성합니다.

diagnosis-report.json
diagnosis-report.txt
PDF 인쇄 / 저장 보고서

현재 진단 보고서에는 다음 내용이 포함됩니다.

1) TOPIK I 읽기 진단 보고서 제목
2) 응시자 / 읽기 점수 / 정답 수 / 미응답 요약 카드
3) TOPIK I 읽기 예상 수준
4) 공식 급수 안내
5) 시험 정보
6) 문항 구간별 분석
7) 강점과 약점
8) 유형별 분석
9) 진단 영역별 분석
10) 오답 문항 목록
11) 학습 처방 및 2주 학습 계획
12) 오답 다시 풀기 버튼
13) 남은 오답풀이 문항 수 표시

중요:
공식 TOPIK I 급수는 듣기와 읽기 합산 200점 기준으로 결정됩니다.
진단 보고서는 읽기 영역만 기준으로 한 예상 수준임을 안내해야 합니다.


17. PDF 보고서 개선 상태
------------------------------------------------
현재 reading-diagnosis PDF 보고서는 다음 개선이 반영되어 있습니다.

1) 상단 요약 카드 구조 적용
2) 공식 급수 안내 추가
3) 문항 구간별 분석 추가
4) category별 분석 → 유형별 분석으로 표현 변경
5) diagnostic_area → 진단 영역별 분석으로 표현 변경
6) 학습 처방 카드형 정리
7) 2주 학습 계획 추가
8) 불필요한 마지막 “다음 목표” 섹션 제거
9) PDF 저장 방법 문구 제거
10) 오답 문항 카드가 페이지 중간에서 잘리지 않도록 인쇄 CSS 개선

현재 PDF는 7쪽 안팎으로 안정화된 상태입니다.


18. 로컬 실행 방법
------------------------------------------------
file:/// 직접 실행은 권장하지 않습니다.
반드시 로컬 서버로 실행합니다.

PowerShell에서 실행:

cd C:\topik1-separated-system
python -m http.server 5500

브라우저 주소:

http://localhost:5500/reading-test/index.html

진단 보고서 주소:

http://localhost:5500/reading-diagnosis/index.html?auto=1


19. GitHub Pages 실행 주소
------------------------------------------------
시험 페이지:

https://jisdcm29-sketch.github.io/topik1-reading-ibt/reading-test/index.html

진단 페이지:

https://jisdcm29-sketch.github.io/topik1-reading-ibt/reading-diagnosis/index.html

캐시 확인용으로 주소 뒤에 버전값을 붙일 수 있습니다.

예:

https://jisdcm29-sketch.github.io/topik1-reading-ibt/reading-test/index.html?v=final-check-1

https://jisdcm29-sketch.github.io/topik1-reading-ibt/reading-diagnosis/index.html?auto=1&v=final-check-1

GitHub Pages 확인 시 Ctrl + F5로 강력 새로고침하세요.


20. GitHub Pages 업로드 시 권장 파일
------------------------------------------------
이번 업데이트 후 GitHub에 올릴 핵심 파일:

reading-test/index.html
reading-test/reading-test.js
reading-test/README.txt
reading-diagnosis/index.html
reading-diagnosis/reading-diagnosis.js

이미지 파일은 수정하지 않았다면 다시 올리지 않아도 됩니다.

현재 images 폴더의 주요 이미지:

reading-test/images/R040.png
reading-test/images/R041.png
reading-test/images/R042.png
reading-test/images/100_R040.png
reading-test/images/100_R041.png
reading-test/images/100_R042.png
reading-test/images/100_R063_064.png
reading-test/images/103_R040.png
reading-test/images/103_R041.png
reading-test/images/103_R042.png
reading-test/images/103_R063_064.png

GitHub Pages에서 이미지가 안 보이면 먼저 이미지 경로와 파일명 대소문자를 확인합니다.


21. GitHub Pages 업로드 시 운영 필수 파일
------------------------------------------------
reading-test 폴더 운영 필수 파일:

index.html
reading-test.js
reading-questions.json
generated-reading-questions.json
question-bank.json
exam-template.json
question-generator.js

reading-test/images 폴더:

필요한 PNG 이미지 전체

reading-diagnosis 폴더 운영 필수 파일:

index.html
reading-diagnosis.js

작업 도구 또는 중간 파일:

question-bank-builder.js
question-bank-merge-100.js
question-bank-merge-103.js
bank-import-draft-*.json
question-bank-before-*.json
question-bank-merged-*.json
question-bank-merged-*-failed.json

위 작업 도구와 중간 파일은 운영 필수 파일은 아닙니다.
보관 목적이면 GitHub에 남겨 둘 수 있지만, 학생용 배포 파일로 반드시 필요한 것은 아닙니다.


22. 현재 정상 확인된 항목
------------------------------------------------
현재 정상 확인된 항목:

1) 로컬 서버 실행 정상
2) GitHub Pages 배포 구조 정상
3) 인증 비밀번호 화면 정상
4) 응시자 이름 입력 정상
5) 전화번호 입력 정상
6) 시험지 선택 정상
7) 회차 고정 출제 정상
8) 랜덤 출제 정상
9) 새 문제 만들기 정상
10) TOPIK I 읽기 31~70번 구조 정상
11) 총 40문항 정상
12) 총점 100점 정상
13) 60분 타이머 정상
14) 이전 / 다음 / 전체 문제 이동 정상
15) 70번 제출 정상
16) reading-result.json / txt 생성 정상
17) localStorage 진단 자동 연결 정상
18) reading-diagnosis 보고서 생성 정상
19) PDF 인쇄 / 저장 정상
20) 오답 다시 풀기 정상
21) 남은 오답풀이 수 표시 정상
22) 남은 오답만 다시 출제 정상
23) TOPIK II로 잘못 연결되는 문제 수정됨
24) 미응답 문항도 오답풀이 대상에 포함됨
25) 결과지 7쪽 안팎으로 안정화됨
26) 오답 카드 PDF 잘림 문제 수정됨
27) 검토 표시 관련 문구 제거 상태 유지


23. 테스트 체크리스트
------------------------------------------------
업로드 전 확인:

1) 로컬 서버 실행
   cd C:\topik1-separated-system
   python -m http.server 5500

2) 시험 페이지 접속
   http://localhost:5500/reading-test/index.html?v=local-final-check

3) 인증 비밀번호 입력
   topik1

4) 시험지 선택
   - 회차 고정 출제
   - 랜덤 출제

5) 시험 시작

6) 다음 유형 확인
   - 빈칸 문제
   - 그림 / 자료형 문제
   - 공통 지문 문제
   - 문장 순서 문제
   - 문장 삽입 문제
   - 긴 지문 문제

7) 일부 문항만 풀고 제출

8) 진단 보고서 자동 연결 확인
   http://localhost:5500/reading-diagnosis/index.html?auto=1

9) PDF로 인쇄 / 저장 확인

10) 오답 다시 풀기 확인

11) 오답풀이 후 남은 오답 수 갱신 확인

12) 남은 오답이 0개일 때 버튼 비활성화 확인


24. 작업 시 주의사항
------------------------------------------------
1) 기존 코드를 먼저 검토합니다.
2) 한 번에 크게 바꾸지 않고 작은 단계로 진행합니다.
3) 한 번에 최대 1~2개 파일만 수정합니다.
4) HTML 요소와 버튼은 삭제하지 말고 숨김 처리합니다.
5) HTML과 JS가 같은 버튼을 각각 만들지 않습니다.
6) result.json 구조를 임의로 깨뜨리지 않습니다.
7) 이미지 경로는 상대 경로를 유지합니다.
8) 브라우저 캐시 문제를 코드 오류로 단정하지 않습니다.
9) GitHub Pages 확인 시 URL에 ?v=버전명을 붙입니다.
10) Ctrl + F5로 강력 새로고침합니다.
11) file:/// 직접 실행은 피하고 로컬 서버 또는 웹 호스팅으로 실행합니다.
12) TOPIK II 코드를 그대로 섞지 않습니다.
13) TOPIK II localStorage 키를 사용하지 않습니다.
14) reading-test에 diagnosis 분석 코드를 넣지 않습니다.
15) reading-diagnosis에 시험 실행 코드를 넣지 않습니다.
16) 미응답 문항을 오답풀이 대상에서 제외하지 않습니다.
17) 오답풀이 결과가 첫 40문항 진단 보고서를 덮어쓰게 하지 않습니다.
18) 학생 화면에서 개발자용 다운로드 버튼을 노출하지 않습니다.


25. PDF 문제지 변환 관련 주의
------------------------------------------------
PDF에서 문제를 완전히 자동 추출할 수 있다고 단정하지 않습니다.

다음 요소는 반드시 사람이 검토해야 합니다.

- 이미지
- 표
- 공통 지문
- 문장 배열
- 문장 삽입
- 특수 기호
- 문항 번호와 배점
- 정답 근거
- 지문과 문항 세트 연결

검토 없이 PDF 내용을 바로 question-bank.json에 넣지 않습니다.


26. 다음 개발 후보
------------------------------------------------
다음 단계 후보:

1) GitHub 저장소의 작업용 중간 파일 정리
2) 새 회차 문제를 question-bank.json에 추가
3) exam-list.json 방식으로 회차 목록 관리 확장
4) PDF 문제지 반자동 변환 도구 설계
5) 문제은행 관리용 점검 도구 강화
6) 새 문제 만들기 결과를 파일로 다운로드하는 기능 정리
7) 외부 배포용 안내문 작성
8) 학생용 시작 안내 문구 정리
9) 관리자용 문제은행 점검 화면 분리
10) GitHub Pages 배포 후 캐시 확인 절차 문서화

주의:
듣기, 쓰기, TOPIK II, adaptive 기능은 현재 우선 작업이 아닙니다.
reading-test는 읽기 시험 실행만 담당합니다.
reading-diagnosis는 읽기 결과 분석과 진단 보고서만 담당합니다.


27. 최종 정리
------------------------------------------------
현재 TOPIK I Reading PBT-type IBT Simulation은 다음 상태를 목표로 유지합니다.

- TOPIK I 읽기 31~70번
- 총 40문항
- 60분
- 100점
- 회차 고정 출제
- 랜덤 출제
- 문제은행 확장 가능
- 오답 다시 풀기
- 남은 오답만 반복 풀이
- reading-diagnosis 자동 연결
- PDF 진단 보고서
- TOPIK I 전용 localStorage 키 사용
- TOPIK II 기능과 분리
- 학생 화면에서 불필요한 개발자 기능 숨김

이 README는 reading-test 폴더의 현재 구조와 운영 기준을 설명합니다.
세부 진단 보고서 구조는 reading-diagnosis 폴더의 README 또는 관련 파일에서 별도로 관리합니다.