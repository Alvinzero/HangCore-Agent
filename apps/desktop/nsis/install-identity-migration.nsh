!define LEGACY_PRODUCT_NAME "HangCore Agent"
!define CURRENT_PRODUCT_NAME "HK AI Platform"
!define LEGACY_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${LEGACY_PRODUCT_NAME}"
!define LEGACY_INSTALL_KEY "Software\hangshun\${LEGACY_PRODUCT_NAME}"
!define WINDOWS_RUN_KEY "Software\Microsoft\Windows\CurrentVersion\Run"
!define WINDOWS_STARTUP_APPROVED_KEY "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run"

Var LegacyInstallDetected
Var LegacyInstallDir
Var LegacyUninstaller
Var LegacyUninstallSucceeded
Var LegacyHadDesktopShortcut
Var LegacyHadStartMenuShortcut
Var LegacyAutostartCommand

!macro NSIS_HOOK_PREINSTALL
  StrCpy $LegacyInstallDetected 0
  StrCpy $LegacyUninstallSucceeded 0
  StrCpy $LegacyHadDesktopShortcut 0
  StrCpy $LegacyHadStartMenuShortcut 0
  StrCpy $LegacyAutostartCommand ""

  ReadRegStr $LegacyInstallDir HKCU "${LEGACY_INSTALL_KEY}" ""
  ReadRegStr $LegacyUninstaller HKCU "${LEGACY_UNINSTALL_KEY}" "UninstallString"
  ${If} ${FileExists} "$DESKTOP\${LEGACY_PRODUCT_NAME}.lnk"
    StrCpy $LegacyHadDesktopShortcut 1
  ${EndIf}
  ${If} ${FileExists} "$SMPROGRAMS\${LEGACY_PRODUCT_NAME}.lnk"
    StrCpy $LegacyHadStartMenuShortcut 1
  ${EndIf}
  ReadRegStr $LegacyAutostartCommand HKCU "${WINDOWS_RUN_KEY}" "${LEGACY_PRODUCT_NAME}"

  ${If} $LegacyInstallDir == ""
  ${AndIf} $LegacyUninstaller == ""
  ${AndIf} $LegacyHadDesktopShortcut == 0
  ${AndIf} $LegacyHadStartMenuShortcut == 0
  ${AndIf} $LegacyAutostartCommand == ""
    Goto hangcore_identity_preinstall_done
  ${EndIf}

  StrCpy $LegacyInstallDetected 1

  ; A stale legacy key can point at the current directory. Never uninstall the
  ; directory that this installer is about to update.
  ${If} $LegacyInstallDir == "$INSTDIR"
    StrCpy $LegacyUninstallSucceeded 1
    Goto hangcore_identity_preinstall_done
  ${EndIf}

  ${If} $LegacyUninstaller != ""
    DetailPrint "Migrating ${LEGACY_PRODUCT_NAME} to ${CURRENT_PRODUCT_NAME}"
    ${If} $LegacyInstallDir != ""
      ExecWait '$LegacyUninstaller /UPDATE /P _?=$LegacyInstallDir' $0
    ${Else}
      ExecWait '$LegacyUninstaller /UPDATE /P' $0
    ${EndIf}
    ${If} $0 = 0
      StrCpy $LegacyUninstallSucceeded 1
    ${Else}
      DetailPrint "Legacy uninstaller returned $0; stale launch entries will still be removed"
    ${EndIf}
  ${Else}
    ; The program files are already gone and only stale registry/shortcuts remain.
    StrCpy $LegacyUninstallSucceeded 1
  ${EndIf}

  hangcore_identity_preinstall_done:
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} $LegacyInstallDetected = 1
    ; Remove every launch path that can reopen v0.1.10 after the new version was
    ; installed. Application data is intentionally outside this migration.
    Delete "$DESKTOP\${LEGACY_PRODUCT_NAME}.lnk"
    Delete "$SMPROGRAMS\${LEGACY_PRODUCT_NAME}.lnk"
    DeleteRegValue HKCU "${WINDOWS_RUN_KEY}" "${LEGACY_PRODUCT_NAME}"
    DeleteRegValue HKCU "${WINDOWS_STARTUP_APPROVED_KEY}" "${LEGACY_PRODUCT_NAME}"

    ${If} $LegacyHadDesktopShortcut = 1
      CreateShortcut "$DESKTOP\${CURRENT_PRODUCT_NAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$DESKTOP\${CURRENT_PRODUCT_NAME}.lnk"
    ${EndIf}
    ${If} $LegacyHadStartMenuShortcut = 1
      CreateShortcut "$SMPROGRAMS\${CURRENT_PRODUCT_NAME}.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      !insertmacro SetLnkAppUserModelId "$SMPROGRAMS\${CURRENT_PRODUCT_NAME}.lnk"
    ${EndIf}
    ${If} $LegacyAutostartCommand != ""
      WriteRegStr HKCU "${WINDOWS_RUN_KEY}" "${CURRENT_PRODUCT_NAME}" '$"$INSTDIR\${MAINBINARYNAME}.exe$"'
    ${EndIf}

    ${If} $LegacyUninstallSucceeded = 1
      DeleteRegKey HKCU "${LEGACY_UNINSTALL_KEY}"
      DeleteRegKey HKCU "${LEGACY_INSTALL_KEY}"
      DeleteRegKey /ifempty HKCU "Software\hangshun"
    ${EndIf}
  ${EndIf}
!macroend
