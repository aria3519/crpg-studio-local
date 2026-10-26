# CRPG Studio Local (v73)

Next.js 기반 로컬 CRPG 제작 스튜디오 전체 프로젝트입니다.

## 설치 및 실행 (Windows PowerShell)

```powershell
cd crpg-studio-local
npm install
Copy-Item .env.example .env.local
```

`.env.local` 파일의 `OPENAI_API_KEY` 값을 실제 OpenAI API 키로 변경합니다.

```powershell
npm run dev
```

브라우저에서 http://localhost:3000 으로 접속합니다.

## 참고
- `app/`: 화면 및 서버 API
- `public/npc-style-reference.png`: NPC 이미지 화풍 참고 자료
- API 사용 시 OpenAI 계정에 별도 요금이 발생할 수 있습니다.
- 기존 프로젝트에서 브라우저 로컬 저장소에만 있던 게임 데이터는 이 ZIP에 포함되지 않습니다.
