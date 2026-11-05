Attribute VB_Name = "ThisWorkbook"
Attribute VB_Base = "0{00020819-0000-0000-C000-000000000046}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = True
Option Explicit

Private Sub Workbook_Open()
    On Error Resume Next
    Application.EnableEvents = True
    ThisWorkbook.Worksheets("Registry Desk").Activate
    OfferDailyReview
End Sub

' Registry sheets: green cells are buttons (Registry Desk, Front Desk, New Inward, Registry Intake ...).
Private Sub Workbook_SheetSelectionChange(ByVal Sh As Object, ByVal Target As Range)
    On Error GoTo Quit
    RegistryDesk.HandleClick Sh, Target
    Exit Sub
Quit:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    MsgBox "Something went wrong: " & Err.Description, vbExclamation, "OGSERC"
End Sub
