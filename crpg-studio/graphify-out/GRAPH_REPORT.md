# Graph Report - crpg-studio  (2026-11-03)

## Corpus Check
- 59 files · ~142,758 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 8 file(s) not represented in the graph (top: (none) 6, .example 1, .css 1)

## Summary
- 719 nodes · 1577 edges · 46 communities (34 shown, 12 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 17 edges (avg confidence: 0.83)
- Token cost: 47,653 input · 0 output

## Community Hubs (Navigation)
- AI 스토리 생성
- 메인 퀘스트 진행·드랍
- page.tsx 상태·타입
- 장비 표·아이템
- GM 대화 엔진
- 최종 프롬프트 빌드
- 성장·경험치·적 장비
- 패키지 의존성
- Home 화면 핸들러
- 기본 에셋 API
- 새 게임·프롤로그 시작
- 장르 레퍼런스 문서
- TS 설정
- 프롬프트 스펙·중복검사
- 메모리·목표 API
- 프롬프트 생성 API
- 에셋 업로드·임포트
- 조우·전투 시작
- 프롬프트 빌더 UI
- 이미지 생성·품질검사
- 프롬프트 품질 게이트
- 맵·핀 편집
- 대화 로그·기억
- 기본 맵·NPC 생성
- 프롬프트 병합 API
- 지역 퀘스트 데이터
- IndexedDB 저장
- 파티 초대·명성
- 이동·도달 판정
- 맵 분석 API
- 프롬프트 압축 API
- 일괄 생성 API
- 맵 계획 API
- NPC 추출 API
- 프롤로그 선택지 API
- 프롤로그 생성 API
- 완성 프롬프트 API
- 캐릭터 등록 API
- 시스템 추천 API
- 시작 아이템 API
- 레이아웃
- 퀘스트 중복 병합
- NPC 이미지·서식
- 메인 프롬프트 갱신
- 대화 말풍선

## God Nodes (most connected - your core abstractions)
1. `Home()` - 148 edges
2. `requestGM()` - 87 edges
3. `finishBattle()` - 33 edges
4. `next` - 31 edges
5. `defaultMapGenre()` - 27 edges
6. `CharacterPanel()` - 20 edges
7. `josa()` - 19 edges
8. `POST()` - 16 edges
9. `mainPrologue()` - 15 edges
10. `serveAsset()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `OPENAI_API_KEY (.env.local)` --conceptually_related_to--> `build-final/route.ts (final generation API + AI consistency review)`  [INFERRED]
  README.md → app/api/prompt/_lib/README.md
- `app/ (screens and server API)` --conceptually_related_to--> `Genre base rules and assembly code (README)`  [INFERRED]
  README.md → app/api/prompt/_lib/README.md
- `Home()` --calls--> `skillText()`  [EXTRACTED]
  app/page.tsx → app/_lib/items.ts
- `Home()` --calls--> `infoOf()`  [EXTRACTED]
  app/page.tsx → app/_lib/items.ts
- `requestGM()` --calls--> `infoOf()`  [EXTRACTED]
  app/page.tsx → app/_lib/items.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Prompt assembly and final build pipeline** — app_api_prompt__lib_readme_genre_reference_json, app_api_prompt__lib_readme_reference_builder, app_api_prompt__lib_readme_semantic_review, app_api_prompt__lib_readme_build_final_route [INFERRED 0.85]
- **Material selection constraints** — app_api_prompt__lib_readme_mains_exclusions, app_api_prompt__lib_readme_exclusivegroups, app_api_prompt__lib_readme_optional_materials, app_api_prompt__lib_readme_reference_builder [EXTRACTED 1.00]

## Communities (46 total, 12 thin omitted)

### Community 0 - "AI 스토리 생성"
Cohesion: 0.06
Nodes (55): actLine(), ActOut, ActPlan, assemble(), bigrams(), buildStory(), castLines(), checkBeats() (+47 more)

### Community 1 - "메인 퀘스트 진행·드랍"
Cohesion: 0.07
Nodes (60): dropChance(), gearName(), randomGearKind(), rollGrade(), rollSkill(), mainChain(), actsDone(), advanceMain() (+52 more)

### Community 2 - "page.tsx 상태·타입"
Cohesion: 0.03
Nodes (53): ALL_REGION_QUESTS, Asset, BLESSING, BoardMap, BulkRuleSection, CharacterConfig, characterPresets, cityPlaceCache (+45 more)

### Community 3 - "장비 표·아이템"
Cohesion: 0.06
Nodes (51): GEAR_TABLE, GearRow, bonusText(), BOSS_SKILLS, ENEMY_SKILL_IDS, EnemySkill, Equipped, GearKind (+43 more)

### Community 4 - "GM 대화 엔진"
Cohesion: 0.07
Nodes (47): GET(), ADDRESS, ADDRESS_JOSA, addressesIn(), assignVoices(), contentWords(), decidedLine(), heroIdentity() (+39 more)

### Community 5 - "최종 프롬프트 빌드"
Cohesion: 0.08
Nodes (39): maxDuration, POST(), review(), runtime, buildReferencePrompt(), Choice, cityMap, cityOf() (+31 more)

### Community 6 - "성장·경험치·적 장비"
Cohesion: 0.11
Nodes (33): BONUS, enemyGear(), enemySkill(), enemySkillText(), gradeForTier(), battleXp(), companionStats(), DEED_SHARES (+25 more)

### Community 7 - "패키지 의존성"
Cohesion: 0.10
Nodes (26): dependencies, lucide-react@^0.468.0, next@^15.3.0, openai@^5.0.0, react@^19.0.0, react-dom@^19.0.0, devDependencies, @types/node@^22.0.0 (+18 more)

### Community 8 - "Home 화면 핸들러"
Cohesion: 0.10
Nodes (17): gestureMotion(), Home(), changeAsset(), changeNpc(), endTalk(), foldNpcMemory(), generateNpc(), placeAsset() (+9 more)

### Community 9 - "기본 에셋 API"
Cohesion: 0.16
Nodes (15): GET(), runtime, GET(), runtime, runtime, GET(), names, runtime (+7 more)

### Community 10 - "새 게임·프롤로그 시작"
Cohesion: 0.18
Nodes (24): mainPrologue(), combinedStartingItems(), defaultActions(), defaultCharacterConfig(), defaultMapGenre(), defaultPrologueImage(), getStartingLocation(), loadOpeningChoices() (+16 more)

### Community 11 - "장르 레퍼런스 문서"
Cohesion: 0.12
Nodes (14): build-final/route.ts (final generation API + AI consistency review), cities[].locations, genre-reference.json, Genre base rules and assembly code (README), Optional materials (factions, cities, npcs, mains, quests, events, opportunities, starts), reference-builder.ts (selection, placeholder substitution, particle correction, exclusions, 7000-char limit), semantic-review.ts (validates AI-reviewed issues and safe fix scope), Three genres (정통 무협, 정통 판타지, 현대 게이트·헌터) (+6 more)

### Community 12 - "TS 설정"
Cohesion: 0.11
Nodes (17): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+9 more)

### Community 13 - "프롬프트 스펙·중복검사"
Cohesion: 0.17
Nodes (15): Call, clean(), containment(), findDuplicates(), fitText(), grams(), score(), SECTION_ORDER (+7 more)

### Community 14 - "메모리·목표 API"
Cohesion: 0.15
Nodes (7): maxDuration, runtime, maxDuration, runtime, maxDuration, runtime, next

### Community 15 - "프롬프트 생성 API"
Cohesion: 0.21
Nodes (11): allowed, angles, clean(), completion(), formatNPC(), maxDuration, NPC, POST() (+3 more)

### Community 16 - "에셋 업로드·임포트"
Cohesion: 0.18
Nodes (12): genreSystemSuggestions(), addAsset(), create(), imageToData(), importGame(), setImageCell(), uploadImageCell(), uploadMaps() (+4 more)

### Community 17 - "조우·전투 시작"
Cohesion: 0.22
Nodes (11): encounterLevel(), discardItem(), faceThreat(), ignoreNpc(), leaveParty(), meetNpc(), startFight(), startMonsterFight() (+3 more)

### Community 18 - "프롬프트 빌더 UI"
Cohesion: 0.22
Nodes (11): applyCharacterPreset(), buildDraftPrompt(), displayGoal(), draftText(), genrePresetPatch(), getGameGoal(), generateGoalSteps(), parseBulkRules() (+3 more)

### Community 19 - "이미지 생성·품질검사"
Cohesion: 0.29
Nodes (7): reviewGeneratedImage(), maxDuration, POST(), runtime, maxDuration, POST(), runtime

### Community 20 - "프롬프트 품질 게이트"
Cohesion: 0.36
Nodes (9): countEntries(), CREATIVE_COUNTS, entryMatches(), GateIssue, IMMUTABLE_GENRE_RULES, itemLabels(), preserveCreativeItems(), validateDocument() (+1 more)

### Community 21 - "맵·핀 편집"
Cohesion: 0.22
Nodes (9): canvasPinEnd(), canvasPinMove(), changeMap(), imageToDataPreservingGif(), mapClick(), uploadCover(), uploadPinBackground(), uploadPlayerMarker() (+1 more)

### Community 22 - "대화 로그·기억"
Cohesion: 0.36
Nodes (8): groupLog(), historyLine(), rememberStory(), isTalkStart(), npcHistory(), parseTalk(), talkStartIndex(), talkTurns()

### Community 23 - "기본 맵·NPC 생성"
Cohesion: 0.29
Nodes (7): createDefaultMaps(), defaultNpcImage(), completePrompt(), extractNpcs(), missingDefaultPins(), presetMaps(), rawPresetMaps()

### Community 24 - "프롬프트 병합 API"
Cohesion: 0.33
Nodes (4): ids, maxDuration, requiredTitles, runtime

### Community 25 - "지역 퀘스트 데이터"
Cohesion: 0.40
Nodes (4): EXTRA_REGION_QUESTS, REGION_QUESTS, RegionQuest, RegionStep

### Community 26 - "IndexedDB 저장"
Cohesion: 0.33
Nodes (6): deleteProjectRecord(), remove(), saveGames(), openProjectDatabase(), readProjectRecord(), writeProjectRecord()

### Community 27 - "파티 초대·명성"
Cohesion: 0.33
Nodes (6): hashText(), inviteToParty(), inviteWait(), joinChance(), npcTaste(), reputationScore()

### Community 28 - "이동·도달 판정"
Cohesion: 0.53
Nodes (6): cityTarget(), farTargetFor(), sendPlayerAction(), travelPinFor(), reachablePins(), travelLinks()

### Community 29 - "맵 분석 API"
Cohesion: 0.40
Nodes (3): kinds, maxDuration, runtime

### Community 30 - "프롬프트 압축 API"
Cohesion: 0.40
Nodes (3): maxDuration, runtime, Section

### Community 31 - "일괄 생성 API"
Cohesion: 0.40
Nodes (3): ids, maxDuration, runtime

### Community 41 - "퀘스트 중복 병합"
Cohesion: 0.67
Nodes (4): alikeQuest(), applyQuests(), questPairs(), sameQuest()

### Community 42 - "NPC 이미지·서식"
Cohesion: 0.50
Nodes (4): freshAsset(), npcImage(), PrologueRichText(), unknownNpcImage()

## Knowledge Gaps
- **7 isolated node(s):** `Next.js`, `public/npc-style-reference.png (NPC art style reference)`, `Browser localStorage game data (not bundled)`, `Three genres (정통 무협, 정통 판타지, 현대 게이트·헌터)`, `Optional materials (factions, cities, npcs, mains, quests, events, opportunities, starts)` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 239 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `메모리·목표 API` to `맵 계획 API`, `NPC 추출 API`, `프롤로그 선택지 API`, `프롤로그 생성 API`, `GM 대화 엔진`, `최종 프롬프트 빌드`, `완성 프롬프트 API`, `캐릭터 등록 API`, `시스템 추천 API`, `기본 에셋 API`, `시작 아이템 API`, `패키지 의존성`, `프롬프트 생성 API`, `이미지 생성·품질검사`, `프롬프트 병합 API`, `맵 분석 API`, `프롬프트 압축 API`, `일괄 생성 API`?**
  _High betweenness centrality (0.226) - this node is a cross-community bridge._
- **What connects `Next.js`, `public/npc-style-reference.png (NPC art style reference)`, `Browser localStorage game data (not bundled)` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AI 스토리 생성` be split into smaller, more focused modules?**
  _Cohesion score 0.059562841530054644 - nodes in this community are weakly interconnected._
- **Why does `Home()` connect `Home 화면 핸들러` to `AI 스토리 생성`, `메인 퀘스트 진행·드랍`, `page.tsx 상태·타입`, `장비 표·아이템`, `GM 대화 엔진`, `성장·경험치·적 장비`, `새 게임·프롤로그 시작`, `에셋 업로드·임포트`, `조우·전투 시작`, `프롬프트 빌더 UI`, `맵·핀 편집`, `대화 로그·기억`, `기본 맵·NPC 생성`, `IndexedDB 저장`, `파티 초대·명성`, `이동·도달 판정`, `NPC 이미지·서식`, `메인 프롬프트 갱신`, `대화 말풍선`?**
  _High betweenness centrality (0.140) - this node is a cross-community bridge._
- **Should `메인 퀘스트 진행·드랍` be split into smaller, more focused modules?**
  _Cohesion score 0.06779661016949153 - nodes in this community are weakly interconnected._
- **Why does `findFoe()` connect `GM 대화 엔진` to `메인 퀘스트 진행·드랍`, `page.tsx 상태·타입`, `Home 화면 핸들러`, `기본 에셋 API`, `조우·전투 시작`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Should `page.tsx 상태·타입` be split into smaller, more focused modules?**
  _Cohesion score 0.034482758620689655 - nodes in this community are weakly interconnected._