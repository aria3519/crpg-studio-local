# 장르별 기본 규칙과 조립 코드

- `genre-reference.json`: 세 장르의 실제 원본 데이터. `정통 무협`, `정통 판타지`, `현대 게이트·헌터`의 `fixed`가 모든 게임에 들어가는 기본 규칙이다. `factions`, `cities`, `npcs`, `mains`, `quests`, `events`, `opportunities`, `starts`는 선택 재료다.
- `mains[].exclusions`: 해당 메인 사건과 함께 선택하면 안 되는 의뢰/돌발/기연 제목 목록.
- `exclusiveGroups`: 묶음마다 최대 하나만 선택할 재료 제목 배열.
- `reference-builder.ts`: 선택, 장소 `{inn}`·`{escort}`·`{tomb}`·`{cave}` 치환, 조사 교정, 제외 재료 적용, 7,000자 제한.
- `semantic-review.ts`: AI가 검토한 문제와 안전한 수정 범위를 검사.
- `../build-final/route.ts`: 최종 생성 API와 AI 정합성 검토 요청.

장소는 `cities[].locations`의 `장소 이름(일반명사)`로 정의한다. 콘텐츠에서는 일반명사를 직접 써서 일괄 치환하지 말고 `{inn}`, `{escort}`, `{tomb}`, `{cave}` 등 자리 표시자를 사용한다.

원본 `.md`를 편집한 후에도 앱은 자동으로 다시 읽지 않는다. 실제 동작을 바꾸려면 이 JSON을 수정하거나 MD→JSON 변환을 다시 수행해야 한다.
