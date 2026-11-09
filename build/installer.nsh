; Custom welcome page for the Kettle assisted installer.
; Uses MUI2 (already loaded by electron-builder) to insert a branded
; welcome screen before the install-directory selection page.

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Kettle"
  !define MUI_WELCOMEPAGE_TEXT "Kettle streams your favorite music with a minimalist, lightning-fast player.$\r$\n$\r$\n- Your library and taste profile stay with you on every device.$\r$\n- Add friends by a shareable KT code and listen together in Jam Sessions.$\r$\n- No sign-up fuss: just a name, and you are in.$\r$\n$\r$\nClick Next to install Kettle."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; Uninstaller welcome page
!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TITLE "Uninstall Kettle"
  !define MUI_UNWELCOMEPAGE_TEXT "Remove Kettle from this PC.$\r$\n$\r$\nYour library, friends and account are stored securely in the shared cloud and will still be here if you reinstall later."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend
