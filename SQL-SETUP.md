# Supabase SQL 관리

현재 실행용 SQL은 `sql/` 바로 아래 다섯 개입니다. [실행 안내](sql/README.md)를 확인하세요.

1. [기본 DB 스키마](sql/01-base-schema.sql)
2. [보강관리](sql/02-makeup-management.sql)
3. [수업 댓글 기능](sql/03-lesson-comments.sql)
4. [입금·보고·동기화](sql/04-payments-and-reports.sql)
5. [알림](sql/05-notifications.sql)

처음에는 01 → 05 순서로 파일 전체를 실행합니다. 자유수영·테스트 계정은 01에, 대댓글은 03에 포함되어 있어 별도 06·07·08 쿼리는 필요 없습니다.

원본은 `sql/archive/2026-11-24/`에 보관했습니다. 실제 테이블을 삭제하거나 이전 SQL을 다시 실행하지 마세요. 운영 DB에는 아직 적용하지 않았습니다.
