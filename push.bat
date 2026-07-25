@echo off
echo Lancement de la mise a jour Git...
git add .
set /p msg="Message du commit (par defaut 'Mise a jour'): "
if "%msg%"=="" set msg="Mise a jour"
git commit -m "%msg%"
git push origin main
echo.
echo Termine ! Appuyez sur une touche pour quitter.
pause >nul