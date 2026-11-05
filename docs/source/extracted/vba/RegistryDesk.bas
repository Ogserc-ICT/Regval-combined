Attribute VB_Name = "RegistryDesk"
Option Explicit

' OGSERC Registry - one-click macros.
' Buttons are green cells. Each button cell is a workbook name "BTN_<Macro>__<n>";
' ThisWorkbook passes every selection to HandleClick, which runs the macro.

Public Silent As Boolean
Public LastMsg As String
Public TestPin As String
Private Const FILE_PREFIX As String = "OGSERC"
Private Const DESK_SHEETS As String = "|Registry Desk|Front Desk|New Inward|New Outward|Update Item|File Desk|Routing Desk|Guide|Dashboard|Pending Actions|Daily Register|Front Desk Log|Registry Guide|Registry Dashboard|Registry Intake|"
Private Const FD_PREFIX As String = "OGSERC/FD"

' ------------------------------------------------------------------ messages
Private Sub Say(ByVal msg As String, Optional ByVal isWarning As Boolean = False)
    LastMsg = msg
    If Silent Then Exit Sub
    If isWarning Then
        MsgBox msg, vbExclamation, "OGSERC Registry"
    Else
        MsgBox msg, vbInformation, "OGSERC Registry"
    End If
End Sub

Private Function Ask(ByVal msg As String) As Boolean
    If Silent Then
        Ask = True
    Else
        Ask = (MsgBox(msg, vbYesNo + vbQuestion, "OGSERC Registry") = vbYes)
    End If
End Function

Private Sub BeginWork()
    Application.ScreenUpdating = False
    Application.EnableEvents = False
End Sub

Private Sub EndWork()
    Application.EnableEvents = True
    Application.ScreenUpdating = True
End Sub

' ------------------------------------------------------------------ button dispatcher
Public Sub HandleClick(ByVal Sh As Object, ByVal Target As Range)
    Dim nm As Name, r As Range, macro As String, p As Long
    If InStr(1, DESK_SHEETS, "|" & Sh.Name & "|") = 0 Then Exit Sub
    If Target.Cells.Count > 40 Then Exit Sub
    For Each nm In ThisWorkbook.Names
        If Left$(nm.Name, 4) = "BTN_" Then
            Set r = Nothing
            On Error Resume Next
            Set r = nm.RefersToRange
            On Error GoTo 0
            If Not r Is Nothing Then
                If r.Worksheet.Name = Sh.Name Then
                    If Not Application.Intersect(r, Target.Cells(1, 1)) Is Nothing Then
                        macro = Mid$(nm.Name, 5)
                        p = InStr(1, macro, "__")
                        If p > 0 Then macro = Left$(macro, p - 1)
                        Application.EnableEvents = False
                        Sh.Range("A1").Select
                        Application.EnableEvents = True
                        On Error GoTo RunFail
                        Application.Run macro
                        Exit Sub
                    End If
                End If
            End If
        End If
    Next nm
    Exit Sub
RunFail:
    EndWork
    Say "Something went wrong: " & Err.Description, True
End Sub

' ------------------------------------------------------------------ name / range helpers
Private Function NR(ByVal nameText As String) As Range
    Set NR = ThisWorkbook.Names(nameText).RefersToRange
End Function

Private Function ColOf(ByVal pre As String, ByVal key As String) As Long
    ColOf = NR(pre & "_" & key).Column
End Function

Private Function AnchorKey(ByVal pre As String) As String
    If pre = "FI" Then AnchorKey = "ref" Else AnchorKey = "sn"
End Function

Private Function FirstRowOf(ByVal pre As String) As Long
    FirstRowOf = NR(pre & "_" & AnchorKey(pre)).Row
End Function

Private Function LastRowOf(ByVal pre As String) As Long
    Dim r As Range
    Set r = NR(pre & "_" & AnchorKey(pre))
    LastRowOf = r.Row + r.Rows.Count - 1
End Function

Private Function RegSheet(ByVal pre As String) As Worksheet
    Set RegSheet = NR(pre & "_" & AnchorKey(pre)).Worksheet
End Function

Private Function IsBlank(ByVal v As Variant) As Boolean
    If IsError(v) Then
        IsBlank = False
    ElseIf IsEmpty(v) Then
        IsBlank = True
    Else
        IsBlank = (Len(Trim$(CStr(v))) = 0)
    End If
End Function

' Row after the last row that has an entry in either key column (rows cleared in the middle are not reused).
Private Function NextFreeRow(ByVal pre As String, ByVal key1 As String, ByVal key2 As String) As Long
    Dim ws As Worksheet, r As Long, c1 As Long, c2 As Long, first As Long, last As Long
    Set ws = RegSheet(pre)
    c1 = ColOf(pre, key1): c2 = ColOf(pre, key2)
    first = FirstRowOf(pre): last = LastRowOf(pre)
    For r = last To first Step -1
        If Not IsBlank(ws.Cells(r, c1).Value) Or Not IsBlank(ws.Cells(r, c2).Value) Then
            If r = last Then NextFreeRow = 0 Else NextFreeRow = r + 1
            Exit Function
        End If
    Next r
    NextFreeRow = first
End Function

Private Function FindRow(ByVal pre As String, ByVal key As String, ByVal v As Variant) As Long
    Dim m As Variant
    FindRow = 0
    If IsBlank(v) Then Exit Function
    m = Application.Match(v, NR(pre & "_" & key), 0)
    If IsError(m) Then Exit Function
    If IsEmpty(m) Or Not IsNumeric(m) Then Exit Function
    If CLng(m) < 1 Then Exit Function
    FindRow = NR(pre & "_" & key).Row + CLng(m) - 1
    If CStr(RegSheet(pre).Cells(FindRow, ColOf(pre, key)).Value) <> CStr(v) Then FindRow = 0
End Function

' ------------------------------------------------------------------ form helpers
' A form is a name covering columns B:G: B label, C value, D hint, E key, F required (Y), G default.
Private Function FormCell(ByVal formName As String, ByVal key As String) As Range
    Dim rw As Range
    For Each rw In NR(formName).Rows
        If LCase$(CStr(rw.Cells(1, 4).Value)) = LCase$(key) Or LCase$(CStr(rw.Cells(1, 4).Value)) = "@" & LCase$(key) Then
            Set FormCell = rw.Cells(1, 2)
            Exit Function
        End If
    Next rw
    Set FormCell = Nothing
End Function

Private Function FormComplete(ByVal formName As String) As Boolean
    Dim rw As Range, missing As String, firstMissing As Range
    For Each rw In NR(formName).Rows
        If UCase$(CStr(rw.Cells(1, 5).Value)) = "Y" Then
            If IsBlank(rw.Cells(1, 2).Value) Then
                missing = missing & vbLf & "  - " & Replace(CStr(rw.Cells(1, 1).Value), " *", "")
                If firstMissing Is Nothing Then Set firstMissing = rw.Cells(1, 2)
            End If
        End If
    Next rw
    If Len(missing) > 0 Then
        Say "Please complete:" & missing, True
        If Not Silent Then
            Application.EnableEvents = False
            firstMissing.Worksheet.Activate
            firstMissing.Select
            Application.EnableEvents = True
        End If
        FormComplete = False
    Else
        FormComplete = True
    End If
End Function

Private Sub WriteForm(ByVal formName As String, ByVal pre As String, ByVal r As Long)
    Dim rw As Range, key As String, v As Variant, ws As Worksheet
    Set ws = RegSheet(pre)
    For Each rw In NR(formName).Rows
        key = Trim$(CStr(rw.Cells(1, 4).Value))
        If Len(key) > 0 And Left$(key, 1) <> "@" Then
            v = rw.Cells(1, 2).Value
            If IsBlank(v) Then
                ws.Cells(r, ColOf(pre, key)).ClearContents
            Else
                ws.Cells(r, ColOf(pre, key)).Value = v
            End If
        End If
    Next rw
End Sub

Private Sub LoadForm(ByVal formName As String, ByVal pre As String, ByVal r As Long)
    Dim rw As Range, key As String, v As Variant, ws As Worksheet
    Set ws = RegSheet(pre)
    For Each rw In NR(formName).Rows
        key = Trim$(CStr(rw.Cells(1, 4).Value))
        If Left$(key, 1) = "@" Then key = Mid$(key, 2)
        If Len(key) > 0 Then
            v = ws.Cells(r, ColOf(pre, key)).Value
            If IsError(v) Then
                rw.Cells(1, 2).ClearContents
            ElseIf IsBlank(v) Then
                rw.Cells(1, 2).ClearContents
            Else
                rw.Cells(1, 2).Value = v
            End If
        End If
    Next rw
End Sub

Private Sub ResetForm(ByVal formName As String)
    Dim rw As Range, key As String, d As String
    For Each rw In NR(formName).Rows
        key = Trim$(CStr(rw.Cells(1, 4).Value))
        If Len(key) > 0 Then
            d = CStr(rw.Cells(1, 6).Formula)
            If Left$(key, 1) = "@" Or Len(d) = 0 Then
                rw.Cells(1, 2).ClearContents
            Else
                rw.Cells(1, 2).Formula = d
            End If
        End If
    Next rw
End Sub

Private Function FormHasData(ByVal formName As String) As Boolean
    Dim rw As Range
    For Each rw In NR(formName).Rows
        If Not rw.Cells(1, 2).HasFormula Then
            If Not IsBlank(rw.Cells(1, 2).Value) Then FormHasData = True: Exit Function
        End If
    Next rw
End Function

' Next number in the series = highest number already used in that year + 1.
Private Function AssignNumber(ByVal pre As String, ByVal r As Long, ByVal prefix As String) As String
    Dim ws As Worksheet, yr As Variant, stem As String, i As Long, s As String, n As Long, mx As Long
    Dim cNo As Long, cLock As Long
    Set ws = RegSheet(pre)
    cNo = ColOf(pre, "no"): cLock = ColOf(pre, "lock")
    If Not IsBlank(ws.Cells(r, cLock).Value) Then AssignNumber = CStr(ws.Cells(r, cLock).Value): Exit Function
    yr = ws.Cells(r, ColOf(pre, "yr")).Value
    If IsBlank(yr) Or IsError(yr) Then Err.Raise vbObjectError + 513, , "The date needed for the number is missing."
    stem = prefix & "/" & CStr(yr) & "/"
    For i = FirstRowOf(pre) To LastRowOf(pre)
        If i <> r Then
            s = CStr(ws.Cells(i, cNo).Text)
            If Left$(s, Len(stem)) = stem Then
                n = CLng(Val(Mid$(s, Len(stem) + 1)))
                If n > mx Then mx = n
            End If
        End If
    Next i
    If pre = "IN" Then mx = SharedMax(stem, mx)     ' one OGSERC/ACK series with the evaluation workbook
    AssignNumber = stem & Format$(mx + 1, "00000")
    ws.Cells(r, cLock).Value = AssignNumber
End Function

Private Function OutputFolder(ByVal subName As String) As String
    Dim basePath As String, sep As String, p As String
    sep = Application.PathSeparator
    basePath = ThisWorkbook.Path
    If Len(basePath) = 0 Or LCase$(Left$(basePath, 4)) = "http" Then
        basePath = Environ("USERPROFILE")
        If Len(basePath) = 0 Then basePath = Environ("HOME")
        basePath = basePath & sep & "Documents"
    End If
    p = basePath & sep & "OGSERC Registry Outputs"
    On Error Resume Next
    MkDir p
    MkDir p & sep & subName
    On Error GoTo 0
    OutputFolder = p & sep & subName & sep
End Function

Private Function SafeFile(ByVal s As String) As String
    Dim bad As Variant
    For Each bad In Array("/", "\", ":", "*", "?", """", "<", ">", "|")
        s = Replace(s, CStr(bad), "-")
    Next bad
    SafeFile = s
End Function

' Hide list rows whose column A formula returns "" so prints have no blank pages.
Private Sub CompactRows(ByVal ws As Worksheet, ByVal hideThem As Boolean)
    Dim r As Long, lastR As Long
    lastR = ws.UsedRange.Row + ws.UsedRange.Rows.Count - 1
    For r = 6 To lastR
        If ws.Cells(r, 1).HasFormula Then
            If hideThem Then
                If CStr(ws.Cells(r, 1).Text) = "" Then ws.Rows(r).Hidden = True
            Else
                ws.Rows(r).Hidden = False
            End If
        End If
    Next r
End Sub

Private Sub OutputSheet(ByVal ws As Worksheet, ByVal toPdf As Boolean, ByVal fileStem As String, ByVal compact As Boolean)
    Dim f As String
    Application.Calculate
    If compact Then CompactRows ws, True
    On Error GoTo Done
    If toPdf Then
        f = OutputFolder("PDF") & SafeFile(fileStem) & ".pdf"
        ws.ExportAsFixedFormat 0, f, 0, True, False, , , False
        If compact Then CompactRows ws, False
        Say "Saved:" & vbLf & f
    Else
        ws.PrintOut
        If compact Then CompactRows ws, False
    End If
    Exit Sub
Done:
    If compact Then CompactRows ws, False
    Say "Could not print or save: " & Err.Description, True
End Sub

' ------------------------------------------------------------------ navigation
Private Sub GoSheet(ByVal sheetName As String, Optional ByVal cellAddr As String = "A1")
    Application.EnableEvents = False
    ThisWorkbook.Worksheets(sheetName).Activate
    ThisWorkbook.Worksheets(sheetName).Range(cellAddr).Select
    Application.EnableEvents = True
End Sub
Public Sub GoDesk()
    GoSheet "Registry Desk", "C4"
End Sub
Public Sub GoNewInward()
    GoSheet "New Inward", "C4"
End Sub
Public Sub GoNewOutward()
    GoSheet "New Outward", "C4"
End Sub
Public Sub GoUpdate()
    GoSheet "Update Item", "C5"
End Sub
Public Sub GoFiles()
    GoSheet "File Desk", "C5"
End Sub
Public Sub GoDashboard()
    GoSheet DeskName("Dashboard")
End Sub
Public Sub GoInward()
    GoSheet "Inward Register", "E6"
End Sub
Public Sub GoOutward()
    GoSheet "Outward Register", "E6"
End Sub
Public Sub GoGuide()
    GoSheet DeskName("Guide")
End Sub
Public Sub GoRoute()
    GoSheet "Routing Desk", "C5"
End Sub
Public Sub GoFrontDesk()
    GoSheet "Front Desk", "C5"
End Sub
Public Sub GoFrontDeskLog()
    GoSheet "Front Desk Log", "E6"
End Sub

' ------------------------------------------------------------------ front desk (no acknowledgement)
Public Sub SaveFrontDesk()
    Dim r As Long, no As String
    If Not FormComplete("FORM_FD") Then Exit Sub
    r = NextFreeRow("FD", "sender", "recv")
    If r = 0 Then Say "The Front Desk Log is full. Start a new workbook for the next period.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_FD", "FD", r
    Application.Calculate
    no = AssignNumber("FD", r, FD_PREFIX)
    NR("LastFD").Value = no
    ResetForm "FORM_FD"
    Application.Calculate
    EndWork
    Say "Logged as " & no & " (Front Desk Log row " & r & ")." & vbLf & _
        "No acknowledgement has been issued. Pass the document to the Registry - it stays on the " & _
        "'Awaiting registry' list until the Registry registers it."
    Exit Sub
Fail:
    EndWork
    Say "Could not save: " & Err.Description, True
End Sub

Public Sub ClearFrontDesk()
    If FormHasData("FORM_FD") Then
        If Not Ask("Clear everything typed on this form?") Then Exit Sub
    End If
    ResetForm "FORM_FD"
End Sub

' Registry: copy a front desk intake into the New Inward form (keeps the front desk time as the receipt time).
Public Sub PullFrontDesk()
    Dim r As Long, ws As Worksheet, k As Variant, v As Variant, c As Range
    r = FindRow("FD", "no", NR("FD_PULL_NO").Value)
    If r = 0 Then Say "Choose a front desk intake number from the list in the yellow cell first.", True: Exit Sub
    Set ws = RegSheet("FD")
    If Not IsBlank(ws.Cells(r, ColOf("FD", "inno")).Value) Then
        Say NR("FD_PULL_NO").Value & " is already registered as " & CStr(ws.Cells(r, ColOf("FD", "inno")).Value) & ".", True
        Exit Sub
    End If
    If FormHasData("FORM_IN") Then
        If Not Ask("Replace what is typed on this form with the front desk details?") Then Exit Sub
    End If
    BeginWork
    On Error GoTo Fail
    ResetForm "FORM_IN"
    For Each k In Array("recv", "mode", "type", "sender", "subject", "phone", "by", "vols", "remarks")
        v = ws.Cells(r, ColOf("FD", CStr(k))).Value
        Set c = FormCell("FORM_IN", CStr(k))
        If Not c Is Nothing And Not IsBlank(v) Then c.Value = v
    Next k
    Application.Calculate
    EndWork
    Say "Details pulled from " & NR("FD_PULL_NO").Value & ". Complete the form and save to issue the acknowledgement."
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

' ------------------------------------------------------------------ incoming
Public Sub SaveInward()
    SaveInwardCore 0
End Sub
Public Sub SaveInwardPrint()
    SaveInwardCore 1
End Sub
Public Sub SaveInwardPdf()
    SaveInwardCore 2
End Sub

Private Sub SaveInwardCore(ByVal slipMode As Long)
    Dim r As Long, no As String, mailNote As String, fdNo As String, fdRow As Long
    Dim evalNote As String
    If Not FormComplete("FORM_IN") Then Exit Sub
    fdNo = Trim$(CStr(NR("FD_PULL_NO").Value))
    If Len(fdNo) > 0 Then
        fdRow = FindRow("FD", "no", fdNo)
        If fdRow = 0 Then Say "Front desk intake " & fdNo & " is not in the Front Desk Log. Choose it from the list or clear the cell.", True: Exit Sub
        If Not IsBlank(RegSheet("FD").Cells(fdRow, ColOf("FD", "inno")).Value) Then
            Say fdNo & " is already registered as " & CStr(RegSheet("FD").Cells(fdRow, ColOf("FD", "inno")).Value) & _
                ". Clear the front desk intake cell to log a different item.", True
            Exit Sub
        End If
    End If
    r = NextFreeRow("IN", "sender", "recv")
    If r = 0 Then Say "The Inward Register is full. Start a new workbook for the next period.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_IN", "IN", r
    Application.Calculate
    no = AssignNumber("IN", r, CStr(NR("AckPrefix").Value))
    If fdRow > 0 Then
        RegSheet("FD").Cells(fdRow, ColOf("FD", "inno")).Value = no
        RegSheet("FD").Cells(fdRow, ColOf("FD", "regon")).Value = Now
        RegSheet("IN").Cells(r, ColOf("IN", "fdno")).Value = fdNo
        NR("FD_PULL_NO").ClearContents
    End If
    NR("LastIn").Value = no
    ThisWorkbook.Worksheets("Acknowledgement Slip").Range("D1").Value = no
    NR("DeskSlipNo").Value = no
    ResetForm "FORM_IN"
    Application.Calculate
    EndWork
    If Len(CStr(RegSheet("IN").Cells(r, ColOf("IN", "evaltype")).Value)) > 0 Then evalNote = SendFilingToEval(r)
    ReleaseEval
    Select Case slipMode
        Case 1: OutputSheet ThisWorkbook.Worksheets("Acknowledgement Slip"), False, "", False
        Case 2: OutputSheet ThisWorkbook.Worksheets("Acknowledgement Slip"), True, "Slip " & no, False
    End Select
    mailNote = SendAckMail(r, False)
    Say "Saved as " & no & " (Inward Register row " & r & ")." & vbLf & _
        "Suggested unit: " & CStr(RegSheet("IN").Cells(r, ColOf("IN", "unit")).Value) & vbLf & _
        "Routing, file reference and handling will be set by the Secretary / Head of Admin on the Routing Desk." & _
        IIf(Len(mailNote) > 0, vbLf & vbLf & mailNote, "") & IIf(Len(evalNote) > 0, vbLf & vbLf & evalNote, "")
    Exit Sub
Fail:
    EndWork
    ReleaseEval
    Say "Could not save: " & Err.Description, True
End Sub

Public Sub ClearInward()
    If FormHasData("FORM_IN") Then
        If Not Ask("Clear everything typed on this form?") Then Exit Sub
    End If
    ResetForm "FORM_IN"
    NR("FD_PULL_NO").ClearContents
End Sub

' ------------------------------------------------------------------ outgoing
Public Sub SaveOutward()
    Dim r As Long, no As String, ws As Worksheet
    If Not FormComplete("FORM_OUT") Then Exit Sub
    r = NextFreeRow("OUT", "addressee", "docdate")
    If r = 0 Then Say "The Outward Register is full. Start a new workbook for the next period.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_OUT", "OUT", r
    Set ws = RegSheet("OUT")
    If IsBlank(ws.Cells(r, ColOf("OUT", "disp")).Value) Then ws.Cells(r, ColOf("OUT", "dispby")).ClearContents
    Application.Calculate
    no = AssignNumber("OUT", r, CStr(NR("OutPrefix").Value))
    NR("LastOut").Value = no
    ResetForm "FORM_OUT"
    Application.Calculate
    EndWork
    Say "Outward number: " & no & vbLf & "Quote it on the document. (Outward Register row " & r & ")"
    Exit Sub
Fail:
    EndWork
    Say "Could not save: " & Err.Description, True
End Sub

Public Sub ClearOutward()
    If FormHasData("FORM_OUT") Then
        If Not Ask("Clear everything typed on this form?") Then Exit Sub
    End If
    ResetForm "FORM_OUT"
End Sub

' ------------------------------------------------------------------ update existing items
Public Sub LoadInward()
    Dim r As Long
    r = FindRow("IN", "no", NR("UPD_IN_NO").Value)
    If r = 0 Then Say "Choose an inward number that is in the Inward Register.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    LoadForm "FORM_UPD_IN", "IN", r
    EndWork
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub SaveUpdateInward()
    Dim r As Long
    r = FindRow("IN", "no", NR("UPD_IN_NO").Value)
    If r = 0 Then Say "Choose an inward number and click LOAD first.", True: Exit Sub
    If IsBlank(FormCell("FORM_UPD_IN", "sender").Value) Then Say "Click LOAD first so you are editing the current details.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_UPD_IN", "IN", r
    Application.Calculate
    LoadForm "FORM_UPD_IN", "IN", r
    EndWork
    Say NR("UPD_IN_NO").Value & " updated. Status: " & CStr(FormCell("FORM_UPD_IN", "status").Value)
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub ForwardToday()
    Dim r As Long
    LoadInward
    r = FindRow("IN", "no", NR("UPD_IN_NO").Value)
    If r = 0 Then Exit Sub
    If IsBlank(RegSheet("IN").Cells(r, ColOf("IN", "routedby")).Value) Then
        If Not Ask(NR("UPD_IN_NO").Value & " has not been routed by the Secretary / Head of Admin yet." & vbLf & _
                   "Forward it anyway?") Then Exit Sub
    End If
    If IsBlank(FormCell("FORM_UPD_IN", "fwd").Value) Then FormCell("FORM_UPD_IN", "fwd").Value = Date
    SaveUpdateInward
End Sub

Public Sub CloseToday()
    LoadInward
    If FindRow("IN", "no", NR("UPD_IN_NO").Value) = 0 Then Exit Sub
    If Not Ask("Close " & NR("UPD_IN_NO").Value & " today without an outgoing letter?") Then Exit Sub
    FormCell("FORM_UPD_IN", "closeman").Value = Date
    If IsBlank(FormCell("FORM_UPD_IN", "fwd").Value) Then FormCell("FORM_UPD_IN", "fwd").Value = Date
    SaveUpdateInward
End Sub

Public Sub LoadOutward()
    Dim r As Long
    r = FindRow("OUT", "no", NR("UPD_OUT_NO").Value)
    If r = 0 Then Say "Choose an outward number that is in the Outward Register.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    LoadForm "FORM_UPD_OUT", "OUT", r
    EndWork
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub SaveUpdateOutward()
    Dim r As Long
    r = FindRow("OUT", "no", NR("UPD_OUT_NO").Value)
    If r = 0 Then Say "Choose an outward number and click LOAD first.", True: Exit Sub
    If IsBlank(FormCell("FORM_UPD_OUT", "addressee").Value) Then Say "Click LOAD first so you are editing the current details.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_UPD_OUT", "OUT", r
    Application.Calculate
    LoadForm "FORM_UPD_OUT", "OUT", r
    EndWork
    Say NR("UPD_OUT_NO").Value & " updated. Status: " & CStr(FormCell("FORM_UPD_OUT", "status").Value)
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub DispatchedToday()
    LoadOutward
    If FindRow("OUT", "no", NR("UPD_OUT_NO").Value) = 0 Then Exit Sub
    If IsBlank(FormCell("FORM_UPD_OUT", "disp").Value) Then FormCell("FORM_UPD_OUT", "disp").Value = Date
    If IsBlank(FormCell("FORM_UPD_OUT", "dispby").Value) Then FormCell("FORM_UPD_OUT", "dispby").Value = NR("DutyOfficer").Value
    SaveUpdateOutward
End Sub

Public Sub DeliveredToday()
    LoadOutward
    If FindRow("OUT", "no", NR("UPD_OUT_NO").Value) = 0 Then Exit Sub
    If IsBlank(FormCell("FORM_UPD_OUT", "disp").Value) Then
        Say "Record the dispatch first (DISPATCHED TODAY).", True
        Exit Sub
    End If
    FormCell("FORM_UPD_OUT", "pod").Value = "Y"
    If IsBlank(FormCell("FORM_UPD_OUT", "deliv").Value) Then FormCell("FORM_UPD_OUT", "deliv").Value = Date
    SaveUpdateOutward
End Sub

' ------------------------------------------------------------------ files
Public Sub IssueFile()
    Dim r As Long, ws As Worksheet, ref As String, i As Long, holder As String
    If Not FormComplete("FORM_FILE_OUT") Then Exit Sub
    ref = CStr(FormCell("FORM_FILE_OUT", "ref").Value)
    Set ws = RegSheet("FM")
    For i = FirstRowOf("FM") To LastRowOf("FM")
        If CStr(ws.Cells(i, ColOf("FM", "ref")).Value) = ref And Not IsBlank(ws.Cells(i, ColOf("FM", "out")).Value) _
           And IsBlank(ws.Cells(i, ColOf("FM", "ret")).Value) Then holder = CStr(ws.Cells(i, ColOf("FM", "to")).Value)
    Next i
    If Len(holder) > 0 Then
        If Not Ask(ref & " is still out with " & holder & ". Issue it anyway?") Then Exit Sub
    End If
    r = NextFreeRow("FM", "ref", "out")
    If r = 0 Then Say "The File Movement register is full.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_FILE_OUT", "FM", r
    ws.Cells(r, ColOf("FM", "out")).Value = Now
    ResetForm "FORM_FILE_OUT"
    Application.Calculate
    EndWork
    Say ref & " issued to " & CStr(ws.Cells(r, ColOf("FM", "to")).Value) & ". Return due " & _
        Format$(ws.Cells(r, ColOf("FM", "retdue")).Value, "dd-mmm-yyyy") & "."
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub ReturnFile()
    Dim ws As Worksheet, ref As String, i As Long, found As Long
    If Not FormComplete("FORM_FILE_RET") Then Exit Sub
    ref = CStr(FormCell("FORM_FILE_RET", "ref").Value)
    Set ws = RegSheet("FM")
    For i = LastRowOf("FM") To FirstRowOf("FM") Step -1
        If CStr(ws.Cells(i, ColOf("FM", "ref")).Value) = ref And IsBlank(ws.Cells(i, ColOf("FM", "ret")).Value) _
           And Not IsBlank(ws.Cells(i, ColOf("FM", "out")).Value) Then found = i: Exit For
    Next i
    If found = 0 Then Say ref & " is not recorded as out. Nothing to return.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    ws.Cells(found, ColOf("FM", "ret")).Value = Date
    ws.Cells(found, ColOf("FM", "retby")).Value = FormCell("FORM_FILE_RET", "retby").Value
    ResetForm "FORM_FILE_RET"
    Application.Calculate
    EndWork
    Say ref & " returned to the Registry (File Movement row " & found & ")."
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub NewFile()
    Dim r As Long, ref As String
    If Not FormComplete("FORM_FILE_NEW") Then Exit Sub
    ' A generated reference (formula) is re-checked against the File Index so it is always the next free number.
    If FormCell("FORM_FILE_NEW", "ref").HasFormula Then
        ref = NextFileRef(CStr(FormCell("FORM_FILE_NEW", "fclass").Value))
        If Len(ref) = 0 Then Say "Set a file class code for '" & CStr(FormCell("FORM_FILE_NEW", "fclass").Value) & _
            "' in Lists (column W), or type the file reference.", True: Exit Sub
        FormCell("FORM_FILE_NEW", "ref").Value = ref
    End If
    ref = CStr(FormCell("FORM_FILE_NEW", "ref").Value)
    If FindRow("FI", "ref", ref) > 0 Then Say ref & " is already in the File Index.", True: Exit Sub
    r = NextFreeRow("FI", "ref", "title")
    If r = 0 Then Say "The File Index is full.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_FILE_NEW", "FI", r
    ResetForm "FORM_FILE_NEW"
    Application.Calculate
    EndWork
    Say ref & " added to the File Index (row " & r & ")."
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

' Next free file reference for a file class: OGSERC/<class code>/001, 002, ...
Private Function NextFileRef(ByVal cls As String) As String
    Dim tbl As Range, i As Long, code As String, stem As String, c As Range, s As String, n As Long, mx As Long
    Set tbl = NR("FILECLASS_TBL")
    For i = 1 To tbl.Rows.Count
        If Len(Trim$(cls)) > 0 And LCase$(Trim$(CStr(tbl.Cells(i, 1).Value))) = LCase$(Trim$(cls)) Then
            code = Trim$(CStr(tbl.Cells(i, 4).Value))
            Exit For
        End If
    Next i
    If Len(code) = 0 Then Exit Function
    stem = FILE_PREFIX & "/" & code & "/"
    For Each c In NR("FI_ref").Cells
        s = CStr(c.Value)
        If UCase$(Left$(s, Len(stem))) = UCase$(stem) Then
            n = CLng(Val(Mid$(s, Len(stem) + 1)))
            If n > mx Then mx = n
        End If
    Next c
    NextFileRef = stem & Format$(mx + 1, "000")
End Function

' ------------------------------------------------------------------ routing (Secretary / Head of Admin only)
Public Sub LoadRoute()
    Dim r As Long
    r = FindRow("IN", "no", NR("ROUTE_IN_NO").Value)
    If r = 0 Then Say "Choose an inward number that is in the Inward Register.", True: Exit Sub
    BeginWork
    On Error GoTo Fail
    LoadForm "FORM_ROUTE", "IN", r
    EndWork
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub SaveRoute()
    Dim r As Long, who As String, ws As Worksheet, newUnit As String, mailNote As String
    r = FindRow("IN", "no", NR("ROUTE_IN_NO").Value)
    If r = 0 Then Say "Choose an inward number and click LOAD first.", True: Exit Sub
    If IsBlank(FormCell("FORM_ROUTE", "sender").Value) Then Say "Click LOAD first so you are routing the current details.", True: Exit Sub
    If Not FormComplete("FORM_ROUTE") Then Exit Sub
    who = Trim$(CStr(FormCell("FORM_ROUTE", "routedby").Value))
    If Not RouterAuthorised(who) Then Exit Sub
    Set ws = RegSheet("IN")
    BeginWork
    On Error GoTo Fail
    WriteForm "FORM_ROUTE", "IN", r
    ws.Cells(r, ColOf("IN", "routedon")).Value = Now
    Application.Calculate
    LoadForm "FORM_ROUTE", "IN", r
    newUnit = CStr(ws.Cells(r, ColOf("IN", "unit")).Value)
    EndWork
    mailNote = SendAckMail(r, True)
    Say NR("ROUTE_IN_NO").Value & " routed to " & newUnit & " by " & who & "." & vbLf & _
        "Status: " & CStr(ws.Cells(r, ColOf("IN", "status")).Value) & _
        IIf(Len(mailNote) > 0, vbLf & vbLf & mailNote, "")
    Exit Sub
Fail:
    EndWork
    Say "Could not save: " & Err.Description, True
End Sub

Public Sub ClearRoute()
    ResetForm "FORM_ROUTE"
    NR("ROUTE_IN_NO").ClearContents
End Sub

' The officer named under "Routed by" must be on the Routing officers list (Lists, columns AF:AI) and either be
' signed in to Windows under the user name set there, or enter the PIN set there.
Private Function RouterAuthorised(ByVal who As String) As Boolean
    Dim tbl As Range, i As Long, uname As String, pin As String, entered As String, found As Boolean
    Set tbl = NR("ROUTER_TBL")
    For i = 1 To tbl.Rows.Count
        If Len(who) > 0 And LCase$(Trim$(CStr(tbl.Cells(i, 1).Value))) = LCase$(who) Then
            found = True
            uname = Trim$(CStr(tbl.Cells(i, 3).Value))
            pin = Trim$(CStr(tbl.Cells(i, 4).Text))
            Exit For
        End If
    Next i
    If Not found Then
        Say "Only the Secretary to the Commission and the Head of Administration can route items." & vbLf & _
            "Choose your name under 'Routed by'.", True
        Exit Function
    End If
    If Len(uname) > 0 Then
        If LCase$(uname) = LCase$(Environ("USERNAME")) Then RouterAuthorised = True: Exit Function
    End If
    If Len(pin) = 0 Then
        Say "No routing PIN is set for " & who & " (Lists, Routing officers), and this computer is not signed in" & _
            " under their Windows user name. The item was not routed.", True
        Exit Function
    End If
    If Silent Then
        entered = TestPin
    Else
        entered = InputBox("Routing PIN for " & who & ":", "OGSERC Registry")
    End If
    If Len(entered) = 0 Then Exit Function
    If entered = pin Then
        RouterAuthorised = True
    Else
        Say "The PIN is not correct. The item was not routed.", True
    End If
End Function

' ------------------------------------------------------------------ acknowledgement email to the concerned division
' Lookup in a one-column key range; returns the same row of a one-column value range.
Private Function LookupIn(ByVal keyName As String, ByVal valName As String, ByVal key As String) As String
    Dim rngK As Range, i As Long
    If Len(Trim$(key)) = 0 Then Exit Function
    Set rngK = NR(keyName)
    For i = 1 To rngK.Rows.Count
        If LCase$(Trim$(CStr(rngK.Cells(i, 1).Value))) = LCase$(Trim$(key)) Then
            LookupIn = Trim$(CStr(NR(valName).Cells(i, 1).Value))
            Exit Function
        End If
    Next i
End Function

' Email addresses for a unit and the division it belongs to (Lists: unit emails col AM, division emails col AP).
Private Function UnitEmails(ByVal unit As String) As String
    Dim divName As String
    divName = LookupIn("UNIT_NAMES", "UNIT_DIVS", unit)
    UnitEmails = MergeAddr(LookupIn("UNIT_NAMES", "UNIT_EMAILS", unit), LookupIn("DIV_NAMES", "DIV_EMAILS", divName))
End Function

Private Function AddrKey(ByVal s As String) As String
    AddrKey = ";" & LCase$(Replace(Replace(s, " ", ""), ",", ";")) & ";"
End Function

Private Function AllIn(ByVal addrs As String, ByVal already As String) As Boolean
    Dim a As Variant
    AllIn = True
    For Each a In Split(Replace(addrs, ",", ";"), ";")
        If Len(Trim$(CStr(a))) > 0 Then
            If InStr(1, AddrKey(already), ";" & LCase$(Trim$(CStr(a))) & ";") = 0 Then AllIn = False: Exit Function
        End If
    Next a
End Function

Private Function MergeAddr(ByVal already As String, ByVal addrs As String) As String
    Dim a As Variant, s As String
    s = Trim$(already)
    For Each a In Split(Replace(addrs, ",", ";"), ";")
        If Len(Trim$(CStr(a))) > 0 Then
            If InStr(1, AddrKey(s), ";" & LCase$(Trim$(CStr(a))) & ";") = 0 Then
                If Len(s) > 0 Then s = s & "; "
                s = s & Trim$(CStr(a))
            End If
        End If
    Next a
    MergeAddr = s
End Function

Private Function SlipPdf(ByVal no As String) As String
    Dim f As String, ws As Worksheet
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("Acknowledgement Slip")
    ws.Range("D1").Value = no
    Application.Calculate
    f = OutputFolder("PDF") & SafeFile("Slip " & no) & ".pdf"
    ws.ExportAsFixedFormat 0, f, 0, True, False, , , False
    SlipPdf = f
    Exit Function
Fail:
    SlipPdf = ""
End Function

Private Function DateText(ByVal v As Variant, ByVal fmt As String) As String
    If IsError(v) Then Exit Function
    If IsDate(v) Or IsNumeric(v) Then
        If Len(CStr(v)) > 0 Then DateText = Format$(v, fmt)
    End If
End Function

' Emails the acknowledgement (slip attached as PDF) to the division the item goes to.
' isRouting = True after the Secretary / Head of Admin routes it: a division already emailed is not emailed again.
' Returns a line for the confirmation message ("" when email is switched off).
Private Function SendAckMail(ByVal r As Long, ByVal isRouting As Boolean) As String
    Dim ws As Worksheet, mailMode As String, unit As String, toList As String, cc As String
    Dim no As String, pdf As String, ol As Object, mi As Object, body As String, subj As String
    Dim already As String, sep As String
    On Error GoTo Fail
    mailMode = LCase$(Trim$(CStr(NR("AckMailMode").Value)))
    If mailMode = "off" Then Exit Function
    Set ws = RegSheet("IN")
    no = CStr(ws.Cells(r, ColOf("IN", "no")).Value)
    unit = CStr(ws.Cells(r, ColOf("IN", "unit")).Value)
    toList = UnitEmails(unit)
    If Len(toList) = 0 Then
        SendAckMail = "Acknowledgement not emailed: no email address is set for '" & unit & "' or its division " & _
            "in Lists (Unit email, column AM / Division email, column AP)."
        Exit Function
    End If
    already = CStr(ws.Cells(r, ColOf("IN", "mailto")).Value)
    If isRouting And AllIn(toList, already) Then Exit Function
    cc = Trim$(CStr(NR("AckMailCC").Value))
    sep = vbCrLf
    If isRouting Then
        subj = "Routed to " & unit & ": " & no & " - " & CStr(ws.Cells(r, ColOf("IN", "sender")).Value)
    Else
        subj = "Acknowledgement " & no & " - " & CStr(ws.Cells(r, ColOf("IN", "type")).Value) & " from " & _
               CStr(ws.Cells(r, ColOf("IN", "sender")).Value)
    End If
    body = "The Registry has received and acknowledged the item below." & sep & sep & _
        "Inward / Ack. No.:  " & no & sep & _
        "Type:  " & CStr(ws.Cells(r, ColOf("IN", "type")).Value) & sep & _
        "Sender:  " & CStr(ws.Cells(r, ColOf("IN", "sender")).Value) & sep & _
        "Subject:  " & CStr(ws.Cells(r, ColOf("IN", "subject")).Value) & sep & _
        "Received:  " & DateText(ws.Cells(r, ColOf("IN", "recv")).Value, "dd-mmm-yyyy hh:nn") & _
        "  (deemed " & DateText(ws.Cells(r, ColOf("IN", "deemed")).Value, "dd-mmm-yyyy") & ")" & sep & _
        "Received by:  " & CStr(ws.Cells(r, ColOf("IN", "officer")).Value) & sep & _
        "Unit:  " & unit & sep & _
        "Division:  " & LookupIn("UNIT_NAMES", "UNIT_DIVS", unit) & sep & sep
    If isRouting Then
        body = body & "Routed by:  " & CStr(ws.Cells(r, ColOf("IN", "routedby")).Value) & sep & _
            "Action required:  " & CStr(ws.Cells(r, ColOf("IN", "action")).Value) & sep & _
            "Priority:  " & CStr(ws.Cells(r, ColOf("IN", "prio")).Value) & sep & _
            "Action officer:  " & CStr(ws.Cells(r, ColOf("IN", "actoff")).Value) & sep & _
            "Response due:  " & DateText(ws.Cells(r, ColOf("IN", "due")).Value, "dd-mmm-yyyy") & sep & _
            "File reference:  " & CStr(ws.Cells(r, ColOf("IN", "fileref")).Value) & sep & sep
    Else
        body = body & "Routing, file reference and handling will follow from the Secretary to the Commission / " & _
            "Head of Administration." & sep & sep
    End If
    body = body & "The acknowledgement slip is attached." & sep & sep & "OGSERC Registry"
    pdf = SlipPdf(no)
    If Silent Then GoTo Record      ' automated checks: no Outlook
    Set ol = CreateObject("Outlook.Application")
    Set mi = ol.CreateItem(0)
    mi.To = toList
    If Len(cc) > 0 Then mi.cc = cc
    mi.Subject = subj
    mi.body = body
    If Len(pdf) > 0 Then mi.Attachments.Add pdf
    If mailMode = "display" Then mi.Display Else mi.Send
Record:
    Application.EnableEvents = False
    ws.Cells(r, ColOf("IN", "mailto")).Value = MergeAddr(already, toList)
    ws.Cells(r, ColOf("IN", "mailed")).Value = Now
    Application.EnableEvents = True
    If mailMode = "display" Then
        SendAckMail = "Acknowledgement email to " & unit & " opened in Outlook - review it and click Send."
    Else
        SendAckMail = "Acknowledgement emailed to " & unit & " (" & toList & ")."
    End If
    Exit Function
Fail:
    Application.EnableEvents = True
    SendAckMail = "Acknowledgement not emailed: " & Err.Description & vbLf & _
        "(Outlook must be installed and signed in on this computer. Use RESEND ACK EMAIL on the Registry Desk.)"
End Function

Public Sub ResendAckMail()
    Dim r As Long, msgTxt As String, ws As Worksheet
    r = FindRow("IN", "no", NR("DeskSlipNo").Value)
    If r = 0 Then Say "Choose an inward number for the slip on the Registry Desk.", True: Exit Sub
    Set ws = RegSheet("IN")
    If Not IsBlank(ws.Cells(r, ColOf("IN", "mailed")).Value) Then
        If Not Ask(NR("DeskSlipNo").Value & " was emailed on " & DateText(ws.Cells(r, ColOf("IN", "mailed")).Value, "dd-mmm-yyyy hh:nn") & _
                   " to " & CStr(ws.Cells(r, ColOf("IN", "mailto")).Value) & "." & vbLf & "Send it again?") Then Exit Sub
    End If
    msgTxt = SendAckMail(r, False)
    If Len(msgTxt) = 0 Then msgTxt = "Acknowledgement email is switched off (Settings, 'Acknowledgement email')."
    Say msgTxt, (InStr(1, msgTxt, "not emailed") > 0)
End Sub

' ------------------------------------------------------------------ slips and reports
Private Function SlipReady() As String
    Dim no As String
    no = CStr(NR("DeskSlipNo").Value)
    If FindRow("IN", "no", no) = 0 Then
        Say "Choose an inward number for the slip on the Registry Desk.", True
        SlipReady = ""
    Else
        ThisWorkbook.Worksheets("Acknowledgement Slip").Range("D1").Value = no
        Application.Calculate
        SlipReady = no
    End If
End Function

Public Sub PrintSlip()
    Dim no As String
    no = SlipReady()
    If Len(no) > 0 Then OutputSheet ThisWorkbook.Worksheets("Acknowledgement Slip"), False, "", False
End Sub

Public Sub PdfSlip()
    Dim no As String
    no = SlipReady()
    If Len(no) > 0 Then OutputSheet ThisWorkbook.Worksheets("Acknowledgement Slip"), True, "Slip " & no, False
End Sub

Private Sub DailyToday()
    Dim c As Range
    Set c = NR("DailyDate")
    If Not c.HasFormula Then
        If Ask("The Daily Register is set to " & Format$(c.Value, "dd-mmm-yyyy") & ". Switch it back to today?") Then c.Formula = "=TODAY()"
    End If
End Sub

Public Sub PrintDaily()
    DailyToday
    OutputSheet ThisWorkbook.Worksheets("Daily Register"), False, "", True
End Sub

Public Sub PdfDaily()
    DailyToday
    OutputSheet ThisWorkbook.Worksheets("Daily Register"), True, _
        "Daily Register " & Format$(NR("DailyDate").Value, "yyyy-mm-dd"), True
End Sub

Public Sub PrintPending()
    OutputSheet ThisWorkbook.Worksheets("Pending Actions"), False, "", True
End Sub

' ------------------------------------------------------------------ housekeeping
Public Sub LockAllNumbers()
    Dim pre As Variant, ws As Worksheet, r As Long, n As Long, g As String
    If Not Ask("Copy every generated number that is not yet locked into its 'Issued No.' cell?") Then Exit Sub
    BeginWork
    On Error GoTo Fail
    For Each pre In Array("IN", "OUT", "FD")
        Set ws = RegSheet(CStr(pre))
        For r = FirstRowOf(CStr(pre)) To LastRowOf(CStr(pre))
            g = CStr(ws.Cells(r, ColOf(CStr(pre), "gen")).Text)
            If Len(g) > 0 And IsBlank(ws.Cells(r, ColOf(CStr(pre), "lock")).Value) Then
                ws.Cells(r, ColOf(CStr(pre), "lock")).Value = g
                n = n + 1
            End If
        Next r
    Next pre
    Application.Calculate
    EndWork
    Say n & " number(s) locked."
    Exit Sub
Fail:
    EndWork
    Say "Could not complete: " & Err.Description, True
End Sub

Public Sub BackupWorkbook()
    Dim f As String
    On Error GoTo Fail
    f = OutputFolder("Backups") & "OGSERC_Registry_Backup_" & Format$(Now, "yyyy-mm-dd_hhnn") & ".xlsm"
    ThisWorkbook.SaveCopyAs f
    Say "Backup saved:" & vbLf & f
    Exit Sub
Fail:
    Say "Backup failed: " & Err.Description, True
End Sub

Private Sub ClearRowInputs(ByVal ws As Worksheet, ByVal r As Long, ByVal lastCol As Long)
    Dim c As Long
    For c = 1 To lastCol
        If Not ws.Cells(r, c).HasFormula Then
            ws.Cells(r, c).ClearContents
            On Error Resume Next
            ws.Cells(r, c).Font.ColorIndex = -4105
            On Error GoTo 0
        End If
    Next c
End Sub

Public Sub ClearExamples()
    Dim specs As Variant, s As Variant, ws As Worksheet, r As Long, k As Long, lastCol As Long, parts() As String
    If Not Ask("Remove all EXAMPLE rows from the registers? Do this once, before live use.") Then Exit Sub
    BeginWork
    On Error GoTo Fail
    specs = Array("IN|sender", "OUT|addressee", "FI|title", "FM|purpose")
    For Each s In specs
        parts = Split(CStr(s), "|")
        Set ws = RegSheet(parts(0))
        lastCol = ws.UsedRange.Column + ws.UsedRange.Columns.Count - 1
        For r = FirstRowOf(parts(0)) To FirstRowOf(parts(0)) + 9
            If Left$(CStr(ws.Cells(r, ColOf(parts(0), parts(1))).Value), 7) = "EXAMPLE" Then
                ClearRowInputs ws, r, lastCol
                k = k + 1
            End If
        Next r
    Next s
    Application.Calculate
    EndWork
    Say k & " example row(s) removed. The registers are ready for live use."
    Exit Sub
Fail:
    EndWork
    Say "Could not clear the examples: " & Err.Description, True
End Sub


' ------------------------------------------------------------------ link to the Registration and Evaluation workbook
' One shared OGSERC/ACK series: before issuing an inward number the Registry also checks the evaluation workbook
' (when it is open, or in the combined workbook), and registration filings acknowledged here are sent to its
' Filings Inward log. Filings acknowledged in the evaluation workbook arrive through RegLink_LogFiling.
Private mEval As Workbook
Private mEvalOpenedHere As Boolean
Private mEvalErr As String

Private Function SheetIn(ByVal wb As Workbook, ByVal nm As String) As Boolean
    Dim ws As Object
    On Error Resume Next
    Set ws = wb.Worksheets(nm)
    On Error GoTo 0
    SheetIn = Not ws Is Nothing
End Function

Private Function IsCombinedBook() As Boolean
    IsCombinedBook = SheetIn(ThisWorkbook, "Register") And SheetIn(ThisWorkbook, "Evaluation")
End Function

' "Guide" / "Dashboard" are named "Registry Guide" / "Registry Dashboard" in the combined workbook.
Private Function DeskName(ByVal baseName As String) As String
    If SheetIn(ThisWorkbook, "Registry " & baseName) Then DeskName = "Registry " & baseName Else DeskName = baseName
End Function

Private Function HasNameHere(ByVal nameText As String) As Boolean
    Dim n As Name
    On Error Resume Next
    Set n = ThisWorkbook.Names(nameText)
    On Error GoTo 0
    HasNameHere = Not n Is Nothing
End Function

Private Function EvalFileSetting() As String
    If HasNameHere("EvalBook") Then EvalFileSetting = Trim$(CStr(NR("EvalBook").Value))
End Function

Private Function EvalProc(ByVal wb As Workbook, ByVal proc As String) As String
    EvalProc = "'" & Replace(wb.Name, "'", "''") & "'!modRegistry." & proc
End Function

' The evaluation workbook: this workbook (combined), an open workbook, or (openIt) the file named in Settings,
' opened from the same folder with its events off and closed again by ReleaseEval.
Private Function EvalBook(ByVal openIt As Boolean) As Workbook
    Dim fn As String, wb As Workbook, p As String, base As String, prevEv As Boolean, found As Boolean, i As Long
    If IsCombinedBook() Then Set EvalBook = ThisWorkbook: Exit Function
    If Not mEval Is Nothing Then Set EvalBook = mEval: Exit Function
    mEvalErr = ""
    fn = EvalFileSetting()
    If Len(fn) = 0 Then mEvalErr = "no evaluation workbook is set in Settings": Exit Function
    i = InStrRev(Replace(fn, "/", "\"), "\")
    For Each wb In Application.Workbooks
        If LCase$(wb.Name) = LCase$(Mid$(fn, i + 1)) Then Set mEval = wb: Exit For
    Next wb
    If mEval Is Nothing Then
        For Each wb In Application.Workbooks
            If Not wb Is ThisWorkbook Then
                If SheetIn(wb, "Register") And SheetIn(wb, "Filings Inward") Then Set mEval = wb: Exit For
            End If
        Next wb
    End If
    If mEval Is Nothing Then
        If Not openIt Then mEvalErr = "it is not open": Exit Function
        If i > 0 Then
            p = fn
        Else
            base = ThisWorkbook.Path
            If LCase$(Left$(base, 4)) = "http" Then p = base & "/" & fn Else p = base & Application.PathSeparator & fn
        End If
        If LCase$(Left$(p, 4)) <> "http" Then
            On Error Resume Next
            found = (Len(Dir(p)) > 0)
            On Error GoTo 0
            If Not found Then mEvalErr = "it was not found at " & p: Exit Function
        End If
        prevEv = Application.EnableEvents
        Application.EnableEvents = False
        On Error Resume Next
        Set mEval = Application.Workbooks.Open(Filename:=p, UpdateLinks:=0, AddToMru:=False)
        If Err.Number <> 0 Then mEvalErr = "it could not be opened (" & Err.Description & ")"
        Err.Clear
        On Error GoTo 0
        Application.EnableEvents = prevEv
        If mEval Is Nothing Then Exit Function
        mEvalOpenedHere = True
        If mEval.ReadOnly Then
            mEvalErr = "it opened read-only (someone else may have it open)"
            mEval.Close SaveChanges:=False
            Set mEval = Nothing
            mEvalOpenedHere = False
            Exit Function
        End If
        ThisWorkbook.Activate
    End If
    Set EvalBook = mEval
End Function

Private Sub ReleaseEval()
    Dim prevEv As Boolean
    If mEvalOpenedHere And Not mEval Is Nothing Then
        prevEv = Application.EnableEvents
        Application.EnableEvents = False
        On Error Resume Next
        mEval.Close SaveChanges:=True
        On Error GoTo 0
        Application.EnableEvents = prevEv
    End If
    Set mEval = Nothing
    mEvalOpenedHere = False
End Sub

' Highest serial already used under `stem` in the evaluation workbook (only checked when it is open).
Private Function SharedMax(ByVal stem As String, ByVal mx As Long) As Long
    Dim wb As Workbook, v As Variant
    SharedMax = mx
    Set wb = EvalBook(False)
    If wb Is Nothing Then Exit Function
    On Error Resume Next
    v = Application.Run(EvalProc(wb, "RegLink_MaxEvalSerial"), stem)
    If Err.Number <> 0 Then v = Empty
    Err.Clear
    On Error GoTo 0
    If Not IsEmpty(v) And IsNumeric(v) Then
        If CLng(v) > mx Then SharedMax = CLng(v)
    End If
    If Not mEvalOpenedHere Then Set mEval = Nothing
End Function

' Highest serial already used under `stem` in the Inward Register (called by the evaluation workbook).
Public Function RegLink_MaxInwardSerial(ByVal stem As String) As Long
    Dim c As Range, s As String, n As Long, mx As Long
    For Each c In NR("IN_no").Cells
        s = CStr(c.Text)
        If Len(s) > Len(stem) Then
            If UCase$(Left$(s, Len(stem))) = UCase$(stem) Then
                n = CLng(Val(Mid$(s, Len(stem) + 1)))
                If n > mx Then mx = n
            End If
        End If
    Next c
    RegLink_MaxInwardSerial = mx
End Function

Private Function LinkEnc(ByVal v As Variant) As String
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If VarType(v) = vbString Then
        If Len(Trim$(v)) = 0 Then Exit Function
        LinkEnc = "$" & v
    ElseIf VarType(v) = vbDate Or IsNumeric(v) Then
        LinkEnc = "#" & Trim$(Str$(CDbl(v)))
    Else
        LinkEnc = "$" & CStr(v)
    End If
End Function

Private Function LinkKV(ByVal key As String, ByVal v As Variant) As String
    Dim e As String
    e = LinkEnc(v)
    If Len(e) > 0 Then LinkKV = Chr$(30) & key & Chr$(31) & e
End Function

Private Function LinkPV(ByVal payload As String, ByVal key As String) As Variant
    Dim p As Long, q As Long, s As String
    LinkPV = Empty
    p = InStr(1, payload, Chr$(30) & key & Chr$(31), vbBinaryCompare)
    If p = 0 Then Exit Function
    p = p + Len(key) + 2
    q = InStr(p, payload, Chr$(30), vbBinaryCompare)
    If q = 0 Then q = Len(payload) + 1
    s = Mid$(payload, p, q - p)
    If Left$(s, 1) = "#" Then
        LinkPV = Val(Mid$(s, 2))
    ElseIf Left$(s, 1) = "$" Then
        LinkPV = Mid$(s, 2)
    End If
End Function

Private Function InwardPayload(ByVal r As Long) As String
    Dim ws As Worksheet, k As Variant, p As String
    Set ws = RegSheet("IN")
    p = LinkKV("ftype", ws.Cells(r, ColOf("IN", "evaltype")).Value)
    For Each k In Array("no", "recv", "mode", "sender", "subject", "sref", "relno", "cac", "lga", "contact", "phone", "email", _
                        "by", "vols", "sch2", "fee", "payref", "amt", "officer", "ackvia", "fdno", "remarks")
        p = p & LinkKV(CStr(k), ws.Cells(r, ColOf("IN", CStr(k))).Value)
    Next k
    InwardPayload = p
End Function

' Send one registration filing to the evaluation workbook's Filings Inward log. Returns a line for the message.
Private Function SendFilingToEval(ByVal r As Long) As String
    Dim wb As Workbook, res As Variant, ws As Worksheet, no As String
    Set ws = RegSheet("IN")
    no = CStr(ws.Cells(r, ColOf("IN", "no")).Value)
    If IsCombinedBook() Then
        SendFilingToEval = "Registration filing: complete its Register entry on Registry Intake (choose " & no & _
            " under 'Ack no. already issued by the Registry')."
        Exit Function
    End If
    Set wb = EvalBook(True)
    If wb Is Nothing Then
        ws.Cells(r, ColOf("IN", "evalsync")).Value = "Not sent: " & mEvalErr
        SendFilingToEval = "Not sent to the evaluation workbook (" & mEvalErr & "). Use SEND FILINGS TO EVALUATION on the Registry Desk."
        Exit Function
    End If
    On Error Resume Next
    res = Application.Run(EvalProc(wb, "RegLink_ReceiveInward"), InwardPayload(r))
    If Err.Number <> 0 Then res = "its macros did not answer (" & Err.Description & ")"
    Err.Clear
    On Error GoTo 0
    If CStr(res) = "OK" Or CStr(res) = "EXISTS" Then
        ws.Cells(r, ColOf("IN", "evalsync")).Value = "Sent " & Format$(Now, "dd-mmm-yyyy hh:nn")
        SendFilingToEval = "Sent to the evaluation workbook (" & wb.Name & "): the registry officer there completes its Register entry on Registry Intake."
    Else
        ws.Cells(r, ColOf("IN", "evalsync")).Value = "Not sent: " & CStr(res)
        SendFilingToEval = "Not sent to the evaluation workbook: " & CStr(res)
    End If
End Function

' Called by the evaluation workbook: log a filing it acknowledged, under the number it issued.
Public Function RegLink_LogFiling(ByVal payload As String) As String
    Dim ack As String, r As Long, ws As Worksheet, k As Variant, v As Variant, prevEv As Boolean, ex As Long
    On Error GoTo Fail
    ack = Trim$(CStr(LinkPV(payload, "no")))
    If Len(ack) = 0 Then RegLink_LogFiling = "No acknowledgement number": Exit Function
    Set ws = RegSheet("IN")
    ex = FindRow("IN", "no", ack)
    If ex > 0 Then
        If LCase$(Trim$(CStr(ws.Cells(ex, ColOf("IN", "sender")).Value))) = LCase$(Trim$(CStr(LinkPV(payload, "sender")))) Then
            RegLink_LogFiling = "EXISTS"
        Else
            RegLink_LogFiling = "CLASH: " & ack & " is already used in the Inward Register for " & CStr(ws.Cells(ex, ColOf("IN", "sender")).Value)
        End If
        Exit Function
    End If
    r = NextFreeRow("IN", "sender", "recv")
    If r = 0 Then RegLink_LogFiling = "The Inward Register is full": Exit Function
    prevEv = Application.EnableEvents
    Application.EnableEvents = False
    For Each k In Array("recv", "mode", "sender", "subject", "sref", "relno", "cac", "lga", "contact", "phone", "email", _
                        "by", "vols", "sch2", "fee", "payref", "amt", "officer", "ackvia", "fdno", "remarks")
        v = LinkPV(payload, CStr(k))
        If Not IsEmpty(v) Then ws.Cells(r, ColOf("IN", CStr(k))).Value = v
    Next k
    v = LinkPV(payload, "ctype")
    If Not IsEmpty(v) Then ws.Cells(r, ColOf("IN", "type")).Value = v
    ws.Cells(r, ColOf("IN", "scat")).Value = "Registrant / licensee"
    ws.Cells(r, ColOf("IN", "lock")).Value = ack
    If Not IsCombinedBook() Then ws.Cells(r, ColOf("IN", "evalsync")).Value = "From the evaluation workbook " & Format$(Now, "dd-mmm-yyyy hh:nn")
    Application.EnableEvents = prevEv
    RegLink_LogFiling = "OK"
    Exit Function
Fail:
    Application.EnableEvents = True
    RegLink_LogFiling = "ERR: " & Err.Description
End Function

' Send every registration filing not yet sent (or that failed) to the evaluation workbook. Returns a summary.
Public Function RegLink_PushPending() As String
    Dim ws As Worksheet, r As Long, st As String, nOk As Long, nFail As Long, note As String, wasOpen As Boolean
    If IsCombinedBook() Then RegLink_PushPending = "nothing to send (combined workbook)": Exit Function
    Set ws = RegSheet("IN")
    wasOpen = Not (mEval Is Nothing)
    For r = FirstRowOf("IN") To LastRowOf("IN")
        If Not IsBlank(ws.Cells(r, ColOf("IN", "sender")).Value) And Left$(CStr(ws.Cells(r, ColOf("IN", "sender")).Value), 7) <> "EXAMPLE" Then
            If Not IsBlank(ws.Cells(r, ColOf("IN", "evaltype")).Value) And Not IsBlank(ws.Cells(r, ColOf("IN", "no")).Value) Then
                st = CStr(ws.Cells(r, ColOf("IN", "evalsync")).Value)
                If Len(st) = 0 Or Left$(st, 8) = "Not sent" Then
                    note = SendFilingToEval(r)
                    If Left$(CStr(ws.Cells(r, ColOf("IN", "evalsync")).Value), 4) = "Sent" Then nOk = nOk + 1 Else nFail = nFail + 1
                End If
            End If
        End If
    Next r
    If Not wasOpen Then ReleaseEval
    RegLink_PushPending = nOk & " sent" & IIf(nFail > 0, ", " & nFail & " not sent (" & mEvalErr & ")", "")
End Function

Public Sub SendFilingsToEval()
    Dim msg As String
    If IsCombinedBook() Then Say "This workbook holds the Register itself: there is nothing to send.": Exit Sub
    Application.ScreenUpdating = False
    msg = RegLink_PushPending()
    ReleaseEval
    Application.ScreenUpdating = True
    Say "Registration filings sent to the evaluation workbook: " & msg & "."
End Sub

Public Sub GoEvalBook()
    Dim wb As Workbook
    If IsCombinedBook() Then GoSheet "Register", "B7": Exit Sub
    Set wb = EvalBook(False)
    If wb Is Nothing Then
        If Len(EvalFileSetting()) = 0 Then Say "Set the evaluation workbook's file name in Settings first.", True: Exit Sub
        On Error Resume Next
        If InStr(EvalFileSetting(), "\") > 0 Or InStr(EvalFileSetting(), "/") > 0 Then
            Set wb = Application.Workbooks.Open(EvalFileSetting())
        Else
            Set wb = Application.Workbooks.Open(ThisWorkbook.Path & Application.PathSeparator & EvalFileSetting())
        End If
        If Err.Number <> 0 Then Say "Could not open the evaluation workbook: " & Err.Description, True
        On Error GoTo 0
    End If
    Set mEval = Nothing
    mEvalOpenedHere = False
    If Not wb Is Nothing Then wb.Activate
End Sub

Public Sub GoIntake()
    GoSheet "Registry Intake", "C6"
End Sub

' ------------------------------------------------------------------ test hook (used only for automated checks)
Public Sub RunSilently(ByVal macroName As String)
    Silent = True
    Application.Run macroName
    Silent = False
End Sub

Public Sub SetSilent()
    Silent = True
End Sub

Public Sub SetTestPin(ByVal p As String)
    TestPin = p
End Sub

Public Function LastMessage() As String
    LastMessage = LastMsg
    LastMsg = ""
End Function
