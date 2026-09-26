@echo off
rem ECHObound — run the Godot build (binary stays in tools/, not committed)
cd /d "%~dp0"
start "" "tools\Godot_v4.3-stable_win64.exe" --path .
