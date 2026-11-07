; OptiTray per-user installer (no admin rights). Built by scripts/build.mjs.
; Defines passed in: APP_NAME, APP_VERSION, SRC_DIR, OUT_FILE, ICON
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user

Name "${APP_NAME}"
OutFile "${OUT_FILE}"
Icon "${ICON}"
UninstallIcon "${ICON}"
InstallDir "$LOCALAPPDATA\Programs\${APP_NAME}"
BrandingText "${APP_NAME} ${APP_VERSION}"
ShowInstDetails nevershow
AutoCloseWindow true

!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  ; Close a running copy so files can be replaced.
  nsExec::Exec 'taskkill /IM "${APP_NAME}.exe" /F'
  Sleep 500
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${SRC_DIR}\*"
  WriteUninstaller "$INSTDIR\Uninstall ${APP_NAME}.exe"

  CreateShortcut "$SMPROGRAMS\${APP_NAME}.lnk" "$INSTDIR\${APP_NAME}.exe"

  WriteRegStr HKCU "${UNINST_KEY}" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_KEY}" "Publisher" "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\${APP_NAME}.exe"
  WriteRegStr HKCU "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" '"$INSTDIR\Uninstall ${APP_NAME}.exe"'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair" 1

  Exec '"$INSTDIR\${APP_NAME}.exe"'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /IM "${APP_NAME}.exe" /F'
  Sleep 500
  Delete "$SMPROGRAMS\${APP_NAME}.lnk"
  ; Remove the "Start with Windows" entry if the user enabled it.
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "com.optitray.app"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "${APP_NAME}"
  DeleteRegKey HKCU "${UNINST_KEY}"
  RMDir /r "$INSTDIR"
SectionEnd
