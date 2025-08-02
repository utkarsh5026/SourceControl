@echo off

REM Find the JAR file
set JAR_FILE=
if exist "%~dp0source-control.jar" (
    set JAR_FILE=%~dp0source-control.jar
) else if exist "%~dp0..\lib\source-control.jar" (
    set JAR_FILE=%~dp0..\lib\source-control.jar
) else if exist "%~dp0..\app\build\libs\source-control.jar" (
    set JAR_FILE=%~dp0..\app\build\libs\source-control.jar
)

if "%JAR_FILE%"=="" (
    echo Error: Could not find source-control.jar
    exit /b 1
)

REM Execute the application
java -jar "%JAR_FILE%" %*
