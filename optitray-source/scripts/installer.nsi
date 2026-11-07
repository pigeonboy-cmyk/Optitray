; OptiTray per-user installer (no admin rights). Built by scripts/build.mjs.
; Defines passed in: APP_NAME, APP_VERSION, SRC_DIR, OUT_FILE, ICON
; Optional (code signing on): SIGN_NODE, SIGN_SCRIPT. The installer itself is signed by build.mjs
; after makensis finishes; the uninstaller is signed here, before it is embedded.
Unicode true

!ifdef SIGN_SCRIPT
  !uninstfinalize '"${SIGN_NODE}" "${SIGN_SCRIPT}" "%1"' = 0
!endif
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

!include "FileFunc.nsh"

; Safety: install and uninstall delete $INSTDIR recursively. `Setup.exe /D=<dir>` can point
; $INSTDIR anywhere, so always install into a folder named after the app (C:\Foo -> C:\Foo\OptiTray)
; and only ever wipe a folder that holds our exe.
Function .onInit
  ${GetFileName} "$INSTDIR" $0
  StrCmp $0 "${APP_NAME}" +2
    StrCpy $INSTDIR "$INSTDIR\${APP_NAME}"
FunctionEnd

Function un.onInit
  ${GetFileName} "$INSTDIR" $0
  StrCmp $0 "${APP_NAME}" 0 refuse
  IfFileExists "$INSTDIR\${APP_NAME}.exe" done refuse
  refuse:
    MessageBox MB_OK|MB_ICONSTOP "${APP_NAME} does not appear to be installed in $INSTDIR. Nothing was removed."
    Abort
  done:
FunctionEnd

Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

Section "Install"
  ; Close a running copy so files can be replaced.
  nsExec::Exec 'taskkill /IM "${APP_NAME}.exe" /F'
  Sleep 500
  ; Remove a previous install only (never an arbitrary existing folder).
  IfFileExists "$INSTDIR\${APP_NAME}.exe" 0 +2
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
