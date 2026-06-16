TOPIK I 읽기 유형별 문제지 출력 도구
====================================

1. 목적
이 폴더는 TOPIK I PBT Reading 31~70번 문제를 기준으로 교사용 유형별 문제지를 출력하기 위한 도구입니다.
공식 TOPIK IBT 복제 프로그램이 아니라, 기존 TOPIK I 읽기 문제은행을 이용한 출력 보조 도구입니다.

2. 실행 주소
로컬 서버:
http://localhost:5500/practice-print/index.html?v=topik1_practice_print_test

GitHub Pages:
https://사용자이름.github.io/저장소이름/practice-print/index.html?v=topik1_practice_print_final_1

3. 필요한 파일
- practice-print/index.html
- practice-print/practice-print.js
- reading-test/data/bank/question-bank.json
- reading-test/images 폴더의 이미지 파일

4. 문제은행 경로
practice-print.js는 아래 파일을 읽습니다.

../reading-test/data/bank/question-bank.json

5. TOPIK I 읽기 번호 기준
이 도구는 학생에게 보이는 원본 번호를 31번~70번 기준으로 표시합니다.
문제은행 내부 번호가 1~40으로 되어 있으면 자동으로 31~70번으로 변환합니다.

6. 버튼 설명
- 문제지 미리보기 생성: 선택한 범위와 회차 기준으로 화면에 문제지를 만듭니다.
- 학생용 문제지 PDF로 인쇄 / 저장: 문제만 출력합니다. 정답표는 포함하지 않습니다.
- 문제지+정답표 PDF로 인쇄 / 저장: 문제지 뒤에 정답표를 붙여 출력합니다.
- 교사용 정답표 PDF로 인쇄 / 저장: 정답표만 출력합니다.
- 초기화: 선택 조건과 미리보기를 초기 상태로 되돌립니다.

7. PDF 저장 방법
브라우저 인쇄 창에서 대상 프린터를 "PDF로 저장" 또는 "Microsoft Print to PDF"로 선택합니다.

8. GitHub Pages 캐시 확인
업로드 후 URL 끝에 ?v=버전명을 붙이고 Ctrl+F5로 새로고침합니다.

9. 수정하지 말아야 할 파일
이 출력 도구 작업 때문에 아래 파일을 수정하지 않습니다.

- reading-test/reading-test.js
- reading-diagnosis/reading-diagnosis.js
- reading-test/data/bank/question-bank.json
- reading-test/data/exams/*.json
- reading-test/data/answer-keys/*.json

10. 주의
이미지 문항은 reading-test/images 폴더의 상대 경로를 사용합니다.
공통 지문 세트는 지문을 한 번만 출력하도록 처리합니다.
