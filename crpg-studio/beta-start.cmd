@echo off
rem Public beta: game server on port 3001 + the tunnel to https://crpgstudio.com (each in its own window).
cd /d "%~dp0"
start "CRPG beta server" cmd /k npm run beta:start
start "CRPG tunnel" "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --no-autoupdate run crpgstudio
