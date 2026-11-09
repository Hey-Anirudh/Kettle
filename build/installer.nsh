; Custom welcome page for the Kettle assisted installer.
; Keep this minimal — electron-builder's default NSIS script has strict
; expectations about when macros run.  We only insert the MUI welcome page
; macro; do NOT redefine MUI_WELCOMEPAGE_TITLE/TEXT here (that produces
; duplicate definitions that crash the wizard on startup with 0xC0000005).
!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Uninstaller welcome page is safe to keep.
!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
