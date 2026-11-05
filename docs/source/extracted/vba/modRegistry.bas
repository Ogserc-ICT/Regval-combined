Attribute VB_Name = "modRegistry"
' OGSERC registration registry: the front desk and the registry officer for registration filings.
' Linked to the Registry Correspondence workbook through ONE shared OGSERC/ACK number series:
' whichever workbook acknowledges a filing takes the next number across both, and the other workbook
' gets a matching row (Inward Register here <-> Filings Inward / Register there).
' In the combined workbook the "correspondence workbook" is this workbook itself.
' Buttons are green cells named BTN_<macro>__<n>, as in the correspondence workbook.
Option Explicit

Public Const OWNUSE_TYPE As String = "Own-use notification (REG-01I)"
Private Const REG_SHEETS As String = "|Front Desk|Front Desk Log|Registry Intake|Filings Inward|Acknowledgement Slip|" & _
    "Registry Desk|New Inward|New Outward|Update Item|File Desk|Routing Desk|Registry Guide|Registry Dashboard|" & _
    "Inward Register|Outward Register|Pending Actions|Daily Register|File Index|File Movement|Registry Settings|Registry Lists|"
Private Const FD_DEFAULT_PREFIX As String = "OGSERC/FDR"

Private mPartner As Workbook
Private mOpenedHere As Boolean
Private mLinkError As String

' ================================================================== sheets, mode
Public Function IsRegistrySheet(ByVal nm As String) As Boolean
    IsRegistrySheet = (InStr(1, REG_SHEETS, "|" & nm & "|", vbTextCompare) > 0)
End Function

Public Function RX_SheetExists(ByVal wb As Workbook, ByVal nm As String) As Boolean
    Dim ws As Object
    On Error Resume Next
    Set ws = wb.Worksheets(nm)
    On Error GoTo 0
    RX_SheetExists = Not ws Is Nothing
End Function

' True in the combined workbook (the Inward Register is in this file).
Public Function RX_IsCombined() As Boolean
    RX_IsCombined = RX_SheetExists(ThisWorkbook, "Inward Register")
End Function

' The register that holds acknowledged filings: Filings Inward (linked) or the Inward Register (combined).
Private Function LogPre() As String
    If RX_IsCombined() Then LogPre = "IN" Else LogPre = "RI"
End Function

' ================================================================== button dispatcher
Public Sub RX_HandleClick(ByVal Sh As Object, ByVal Target As Range)
    Dim nm As Name, r As Range, macro As String, p As Long
    If Not IsRegistrySheet(Sh.Name) Then Exit Sub
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
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Tell "Something went wrong: " & Err.Description
End Sub

' ================================================================== name / range helpers
Private Function NR(ByVal nameText As String) As Range
    Set NR = ThisWorkbook.Names(nameText).RefersToRange
End Function

Private Function HasName(ByVal nameText As String) As Boolean
    Dim n As Name
    On Error Resume Next
    Set n = ThisWorkbook.Names(nameText)
    On Error GoTo 0
    HasName = Not n Is Nothing
End Function

Private Function ColOf(ByVal pre As String, ByVal key As String) As Long
    ColOf = NR(pre & "_" & key).Column
End Function

Private Function FirstRowOf(ByVal pre As String) As Long
    FirstRowOf = NR(pre & "_sn").Row
End Function

Private Function LastRowOf(ByVal pre As String) As Long
    Dim r As Range
    Set r = NR(pre & "_sn")
    LastRowOf = r.Row + r.Rows.Count - 1
End Function

Private Function RegSheet(ByVal pre As String) As Worksheet
    Set RegSheet = NR(pre & "_sn").Worksheet
End Function

Private Function Blank(ByVal v As Variant) As Boolean
    If IsError(v) Then
        Blank = False
    ElseIf IsEmpty(v) Then
        Blank = True
    Else
        Blank = (Len(Trim$(CStr(v))) = 0)
    End If
End Function

Private Function Txt(ByVal v As Variant) As String
    If IsError(v) Then Txt = "" Else Txt = Trim$(CStr(v))
End Function

Private Function CellV(ByVal pre As String, ByVal r As Long, ByVal key As String) As Variant
    CellV = RegSheet(pre).Cells(r, ColOf(pre, key)).Value
End Function

Private Sub SetCell(ByVal pre As String, ByVal r As Long, ByVal key As String, ByVal v As Variant)
    If Blank(v) Then
        RegSheet(pre).Cells(r, ColOf(pre, key)).ClearContents
    Else
        RegSheet(pre).Cells(r, ColOf(pre, key)).Value = v
    End If
End Sub

' Row after the last row that has an entry in either key column.
Private Function NextFreeRow(ByVal pre As String, ByVal key1 As String, ByVal key2 As String) As Long
    Dim ws As Worksheet, r As Long, c1 As Long, c2 As Long, first As Long, last As Long
    Set ws = RegSheet(pre)
    c1 = ColOf(pre, key1): c2 = ColOf(pre, key2)
    first = FirstRowOf(pre): last = LastRowOf(pre)
    For r = last To first Step -1
        If Not Blank(ws.Cells(r, c1).Value) Or Not Blank(ws.Cells(r, c2).Value) Then
            If r = last Then NextFreeRow = 0 Else NextFreeRow = r + 1
            Exit Function
        End If
    Next r
    NextFreeRow = first
End Function

Private Function FindIn(ByVal pre As String, ByVal key As String, ByVal v As Variant) As Long
    Dim m As Variant
    FindIn = 0
    If Blank(v) Then Exit Function
    m = Application.Match(CStr(v), NR(pre & "_" & key), 0)
    If IsError(m) Then Exit Function
    If Not IsNumeric(m) Then Exit Function
    FindIn = NR(pre & "_" & key).Row + CLng(m) - 1
    If Txt(RegSheet(pre).Cells(FindIn, ColOf(pre, key)).Value) <> Trim$(CStr(v)) Then FindIn = 0
End Function

Private Function AsDate(ByVal v As Variant, ByRef d As Date) As Boolean
    If IsError(v) Then Exit Function
    If IsEmpty(v) Then Exit Function
    If VarType(v) = vbDate Then
        d = v: AsDate = True
    ElseIf IsNumeric(v) Then
        If CDbl(v) > 0 Then d = CDate(CDbl(v)): AsDate = True
    ElseIf IsDate(v) Then
        d = CDate(v): AsDate = True
    End If
End Function

' Value in list B at the position of `key` in list A (both workbook names of one-column ranges).
Private Function ListMap(ByVal listA As String, ByVal listB As String, ByVal key As String) As String
    Dim a As Range, i As Long
    If Len(Trim$(key)) = 0 Then Exit Function
    Set a = NR(listA)
    For i = 1 To a.Cells.Count
        If LCase$(Txt(a.Cells(i, 1).Value)) = LCase$(Trim$(key)) Then
            ListMap = Txt(NR(listB).Cells(i, 1).Value)
            Exit Function
        End If
    Next i
End Function

' Filing type on the Register for a filing type or a correspondence type.
Private Function EvalTypeFor(ByVal v As String) As String
    If Len(ListMap("RX_FilingTypes", "RX_FilingTypes", v)) > 0 Then
        EvalTypeFor = ListMap("RX_FilingTypes", "RX_FilingTypes", v)
    Else
        EvalTypeFor = ListMap("RX_CorrTypes", "RX_FilingTypes", v)
    End If
End Function

Private Function CorrTypeFor(ByVal ftype As String) As String
    CorrTypeFor = ListMap("RX_FilingTypes", "RX_CorrTypes", ftype)
End Function

Private Function ChannelFor(ByVal mode As String) As String
    ChannelFor = ListMap("RX_ModeNames", "RX_ModeChannels", mode)
    If Len(ChannelFor) = 0 Then ChannelFor = "By hand"
End Function

Private Function ModeFor(ByVal channel As String) As String
    Select Case LCase$(Trim$(channel))
        Case "email": ModeFor = "Email"
        Case "online portal": ModeFor = "Online portal"
        Case "": ModeFor = ""
        Case Else: ModeFor = "Hand delivery"
    End Select
End Function

' ================================================================== forms (B label, C value, D hint, E key, F required, G default)
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

Private Function FV(ByVal key As String) As Variant
    Dim c As Range
    Set c = FormCell("FORM_RX", key)
    If c Is Nothing Then
        FV = Empty
    ElseIf IsError(c.Value) Then
        FV = Empty
    ElseIf Blank(c.Value) Then
        FV = Empty
    Else
        FV = c.Value
    End If
End Function

Private Function FormComplete(ByVal formName As String) As Boolean
    Dim rw As Range, missing As String, firstMissing As Range
    For Each rw In NR(formName).Rows
        If UCase$(CStr(rw.Cells(1, 5).Value)) = "Y" Then
            If Blank(rw.Cells(1, 2).Value) Then
                missing = missing & vbLf & "  - " & Replace(CStr(rw.Cells(1, 1).Value), " *", "")
                If firstMissing Is Nothing Then Set firstMissing = rw.Cells(1, 2)
            End If
        End If
    Next rw
    If Len(missing) > 0 Then
        Tell "Please complete:" & missing
        If Not gTest Then
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
    Dim rw As Range, key As String
    For Each rw In NR(formName).Rows
        key = Trim$(CStr(rw.Cells(1, 4).Value))
        If Len(key) > 0 And Left$(key, 1) <> "@" Then SetCell pre, r, key, rw.Cells(1, 2).Value
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
            If Not Blank(rw.Cells(1, 2).Value) Then
                If Txt(rw.Cells(1, 2).Value) <> Txt(rw.Cells(1, 6).Value) Then FormHasData = True: Exit Function
            End If
        End If
    Next rw
End Function

' Next number in a series = highest number already used in that year + 1 (as in the correspondence workbook).
Private Function AssignNumber(ByVal pre As String, ByVal r As Long, ByVal prefix As String) As String
    Dim ws As Worksheet, yr As Variant, stem As String, i As Long, s As String, n As Long, mx As Long
    Dim cNo As Long, cLock As Long
    Set ws = RegSheet(pre)
    cNo = ColOf(pre, "no"): cLock = ColOf(pre, "lock")
    If Not Blank(ws.Cells(r, cLock).Value) Then AssignNumber = CStr(ws.Cells(r, cLock).Value): Exit Function
    yr = ws.Cells(r, ColOf(pre, "yr")).Value
    If Blank(yr) Or IsError(yr) Then Err.Raise vbObjectError + 513, , "The date needed for the number is missing."
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
    AssignNumber = stem & Format$(mx + 1, "00000")
    ws.Cells(r, cLock).Value = AssignNumber
End Function

' ================================================================== navigation
Private Sub GoSheet(ByVal sheetName As String, Optional ByVal cellAddr As String = "A1")
    Application.EnableEvents = False
    ThisWorkbook.Worksheets(sheetName).Activate
    ThisWorkbook.Worksheets(sheetName).Range(cellAddr).Select
    Application.EnableEvents = True
End Sub
Public Sub RX_GoFrontDesk()
    GoSheet "Front Desk", "C5"
End Sub
Public Sub RX_GoFrontDeskLog()
    GoSheet "Front Desk Log", "E6"
End Sub
Public Sub RX_GoIntake()
    GoSheet "Registry Intake", "C6"
End Sub
Public Sub RX_GoFilings()
    If RX_IsCombined() Then GoSheet "Inward Register", "E6" Else GoSheet "Filings Inward", "D6"
End Sub
Public Sub RX_GoRegister()
    GoSheet "Register", "B7"
End Sub
Public Sub RX_GoOwnUse()
    GoSheet "Own-Use", "B7"
End Sub
Public Sub RX_GoSlip()
    GoSheet "Acknowledgement Slip", "D1"
End Sub

Private Sub GoToRow(ByVal lo As ListObject, ByVal r As Long, ByVal col As String)
    If gTest Then Exit Sub
    Application.EnableEvents = False
    lo.Parent.Activate
    lo.DataBodyRange.Cells(r, lo.ListColumns(col).Index).Select
    Application.EnableEvents = True
End Sub

' ================================================================== front desk (linked workbook: its own front desk)
Public Sub RX_SaveFrontDesk()
    Dim r As Long, no As String, prefix As String
    If Not FormComplete("FORM_FD") Then Exit Sub
    r = NextFreeRow("FD", "sender", "recv")
    If r = 0 Then Tell "The Front Desk Log is full. Start a new workbook for the next period.": Exit Sub
    prefix = FD_DEFAULT_PREFIX
    If HasName("cfgFdPrefix") Then
        If Len(Txt(Setting("cfgFdPrefix"))) > 0 Then prefix = Txt(Setting("cfgFdPrefix"))
    End If
    Application.ScreenUpdating = False
    Application.EnableEvents = False
    On Error GoTo Fail
    WriteForm "FORM_FD", "FD", r
    Application.Calculate
    no = AssignNumber("FD", r, prefix)
    NR("LastFD").Value = no
    ResetForm "FORM_FD"
    Application.Calculate
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Tell "Logged as " & no & " (Front Desk Log row " & r & ")." & vbLf & _
        "No acknowledgement has been issued. Pass the document to the registry officer: it stays on the " & _
        "'Awaiting registry' list until it is acknowledged on Registry Intake."
    Exit Sub
Fail:
    Application.EnableEvents = True
    Application.ScreenUpdating = True
    Tell "Could not save: " & Err.Description
End Sub

Public Sub RX_ClearFrontDesk()
    If FormHasData("FORM_FD") Then
        If Not Ask("Clear everything typed on this form?") Then Exit Sub
    End If
    ResetForm "FORM_FD"
End Sub

' ================================================================== registry intake: pull
Public Sub RX_PullFrontDesk()
    Dim r As Long, ws As Worksheet, k As Variant, v As Variant, c As Range, fdNo As String, ft As String
    fdNo = Txt(NR("RX_FD_PULL").Value)
    r = FindIn("FD", "no", fdNo)
    If r = 0 Then Tell "Choose a front desk intake number from the list in the yellow cell first.": Exit Sub
    Set ws = RegSheet("FD")
    If Not Blank(ws.Cells(r, ColOf("FD", "inno")).Value) Then
        Tell fdNo & " is already registered as " & Txt(ws.Cells(r, ColOf("FD", "inno")).Value) & "."
        Exit Sub
    End If
    If FormHasData("FORM_RX") Then
        If Not Ask("Replace what is typed on this form with the front desk details?") Then Exit Sub
    End If
    Application.EnableEvents = False
    On Error GoTo Fail
    ResetForm "FORM_RX"
    NR("RX_ACK_PULL").ClearContents
    For Each k In Array("recv", "mode", "sender", "subject", "phone", "by", "vols", "remarks")
        v = ws.Cells(r, ColOf("FD", CStr(k))).Value
        If CStr(k) = "sender" Then Set c = FormCell("FORM_RX", "name") Else Set c = FormCell("FORM_RX", CStr(k))
        If Not c Is Nothing Then
            If Not Blank(v) Then c.Value = v
        End If
    Next k
    ft = EvalTypeFor(Txt(ws.Cells(r, ColOf("FD", "type")).Value))
    If Len(ft) > 0 Then FormCell("FORM_RX", "ftype").Value = ft
    Application.EnableEvents = True
    Tell "Details pulled from " & fdNo & "." & vbLf & "Complete the cream cells and click SAVE to issue the acknowledgement."
    Exit Sub
Fail:
    Application.EnableEvents = True
    Tell "Could not complete: " & Err.Description
End Sub

' A filing the Registry has already acknowledged (its OGSERC/ACK number is kept).
Public Sub RX_PullAck()
    Dim pre As String, r As Long, ack As String, k As Variant, v As Variant, c As Range, st As String
    pre = LogPre()
    ack = Txt(NR("RX_ACK_PULL").Value)
    r = FindIn(pre, "no", ack)
    If r = 0 Then Tell "Choose an acknowledgement number from the list in the yellow cell first.": Exit Sub
    st = EntryStatus(pre, r)
    If st <> "Awaiting Register entry" Then Tell ack & ": " & st & ".": Exit Sub
    If FormHasData("FORM_RX") Then
        If Not Ask("Replace what is typed on this form with the details of " & ack & "?") Then Exit Sub
    End If
    Application.EnableEvents = False
    On Error GoTo Fail
    ResetForm "FORM_RX"
    NR("RX_FD_PULL").ClearContents
    NR("RX_ACK_PULL").Value = ack
    For Each k In Array("recv", "mode", "sender", "subject", "relno", "sref", "cac", "lga", "contact", "phone", "email", _
                        "by", "vols", "sch2", "fee", "payref", "amt", "officer", "ackvia", "remarks", "form")
        If HasName(pre & "_" & CStr(k)) Then
            v = CellV(pre, r, CStr(k))
            If CStr(k) = "sender" Then Set c = FormCell("FORM_RX", "name") Else Set c = FormCell("FORM_RX", CStr(k))
            If Not c Is Nothing And Not IsError(v) Then
                If Not Blank(v) Then c.Value = v
            End If
        End If
    Next k
    If pre = "RI" Then v = CellV(pre, r, "ftype") Else v = CellV(pre, r, "evaltype")
    If Not Blank(v) Then FormCell("FORM_RX", "ftype").Value = EvalTypeFor(Txt(v))
    Application.EnableEvents = True
    Tell "Details pulled from " & ack & "." & vbLf & "It already has its acknowledgement, so no new number is issued. " & _
        "Complete the Register details (form filed, primary activity, licence status, operating Y/N) and click SAVE."
    Exit Sub
Fail:
    Application.EnableEvents = True
    Tell "Could not complete: " & Err.Description
End Sub

' "Saved on Register" / "Saved on Own-Use" / "Register row started ..." / "Awaiting Register entry"
Private Function EntryStatus(ByVal pre As String, ByVal r As Long) As String
    Application.Calculate
    If pre = "RI" Then EntryStatus = Txt(CellV(pre, r, "entry")) Else EntryStatus = Txt(CellV(pre, r, "evalsync"))
End Function

Public Sub RX_ClearIntake()
    If FormHasData("FORM_RX") Then
        If Not Ask("Clear everything typed on this form?") Then Exit Sub
    End If
    Application.EnableEvents = False
    ResetForm "FORM_RX"
    NR("RX_FD_PULL").ClearContents
    NR("RX_ACK_PULL").ClearContents
    Application.EnableEvents = True
End Sub

' ================================================================== registry intake: save
Public Sub RX_SaveIntake()
    RX_SaveIntakeCore 0
End Sub
Public Sub RX_SaveIntakePrint()
    RX_SaveIntakeCore 1
End Sub
Public Sub RX_SaveIntakePdf()
    RX_SaveIntakeCore 2
End Sub

Private Sub RX_SaveIntakeCore(ByVal slipMode As Long)
    Dim ack As String, fdNo As String, fdRow As Long, existing As Boolean, ftype As String, isOwnUse As Boolean
    Dim dRecv As Date, lr As Long, corrNote As String, rowNo As Long, ok As Boolean, nm As String, pre As String
    Dim autoSave As Boolean, lo As ListObject, st As String, k As Variant
    If Not FormComplete("FORM_RX") Then Exit Sub
    ftype = Txt(FV("ftype"))
    If Len(EvalTypeFor(ftype)) = 0 Then Tell "Choose the filing type from the list.": Exit Sub
    ftype = EvalTypeFor(ftype)
    isOwnUse = (ftype = OWNUSE_TYPE)
    If Not AsDate(FV("recv"), dRecv) Then Tell "Enter the date and time received as dd/mm/yyyy hh:mm.": Exit Sub
    If Int(dRecv) > AsOf() Then Tell "The date received cannot be in the future.": Exit Sub
    If Not isOwnUse And Len(Txt(FV("form"))) = 0 Then
        Tell "Enter the form filed (REG-01A to REG-01K)." & vbLf & "Own-use notifications are filed on REG-01I: choose the own-use filing type instead."
        Exit Sub
    End If
    If Not isOwnUse And Txt(FV("form")) = "REG-01I" Then
        Tell "REG-01I is the own-use notification: choose the filing type '" & OWNUSE_TYPE & "'."
        Exit Sub
    End If
    If ftype <> FILING_NEW And Not isOwnUse And Len(Txt(FV("relno"))) = 0 Then
        Tell "Quote the registration number this filing is for (Linked registration no.)."
        Exit Sub
    End If
    nm = Txt(FV("name"))
    pre = LogPre()
    ack = Txt(NR("RX_ACK_PULL").Value)
    If Len(ack) > 0 Then
        lr = FindIn(pre, "no", ack)
        If lr = 0 Then Tell ack & " is not in the " & IIf(pre = "RI", "Filings Inward log", "Inward Register") & ". Choose it from the list or clear the cell.": Exit Sub
        st = EntryStatus(pre, lr)
        If st <> "Awaiting Register entry" Then Tell ack & ": " & st & ". Clear the acknowledgement cell to log a different filing.": Exit Sub
        existing = True
    End If
    fdNo = Txt(NR("RX_FD_PULL").Value)
    If Len(fdNo) > 0 Then
        fdRow = FindIn("FD", "no", fdNo)
        If fdRow = 0 Then Tell "Front desk intake " & fdNo & " is not in the Front Desk Log. Choose it from the list or clear the cell.": Exit Sub
        If Not Blank(CellV("FD", fdRow, "inno")) Then
            Tell fdNo & " is already registered as " & Txt(CellV("FD", fdRow, "inno")) & ". Clear the front desk cell to log a different item."
            Exit Sub
        End If
    End If

    BeginAction
    On Error GoTo Failed
    If Not existing Then
        ack = RX_NextAck(Year(dRecv))
        If Len(ack) = 0 Then GoTo Done
        If pre = "RI" Then
            lr = NextFreeRow("RI", "no", "sender")
            If lr = 0 Then Err.Raise vbObjectError + 514, , "The Filings Inward log is full."
            For Each k In Array("recv", "mode", "form", "subject", "relno", "sref", "cac", "lga", "contact", "phone", "email", _
                                "by", "vols", "sch2", "fee", "payref", "amt", "officer", "ackvia", "remarks")
                SetCell "RI", lr, CStr(k), FV(CStr(k))
            Next k
            SetCell "RI", lr, "sender", nm
            SetCell "RI", lr, "ftype", ftype
            SetCell "RI", lr, "no", ack
            SetCell "RI", lr, "source", "Registry Intake (this workbook)"
            SetCell "RI", lr, "fdno", fdNo
            corrNote = RX_LogToCorrespondence(RowPayload(lr))
            SetCell "RI", lr, "corr", corrNote
        Else
            corrNote = RX_LogToCorrespondence(FormPayload(ack, fdNo, ftype))
            If Left$(corrNote, 6) <> "Logged" Then Err.Raise vbObjectError + 515, , corrNote
        End If
    Else
        If pre = "RI" Then
            If Len(fdNo) > 0 Then SetCell "RI", lr, "fdno", fdNo
        End If
        corrNote = "Acknowledged earlier by the Registry"
    End If
    If fdRow > 0 Then
        SetCell "FD", fdRow, "inno", ack
        SetCell "FD", fdRow, "regon", Now
    End If
    If isOwnUse Then
        Set lo = t("tblOwnUse")
        rowNo = NewOwnUseRow(ack, fdNo, dRecv)
    Else
        Set lo = t("tblRegister")
        rowNo = NewRegisterRow(ack, fdNo, ftype, dRecv)
        autoSave = (Len(Txt(FV("activity"))) > 0 And Len(Txt(FV("licence"))) > 0 And Len(Txt(FV("operating"))) > 0)
    End If
    NR("RX_LastAck").Value = ack
    ThisWorkbook.Worksheets("Acknowledgement Slip").Range("D1").Value = ack
    Audit "Registry acknowledgement", ack, ftype & " - " & nm & " - received " & Format$(dRecv, "dd-mmm-yyyy hh:nn") & _
        IIf(Len(fdNo) > 0, " - front desk " & fdNo, "") & " - " & corrNote
    ResetForm "FORM_RX"
    NR("RX_ACK_PULL").ClearContents
    NR("RX_FD_PULL").ClearContents
    ok = True
Done:
    EndAction
    RX_ReleasePartner
    If Not ok Then Exit Sub
    Select Case slipMode
        Case 1: RX_OutputSlip ack, False
        Case 2: RX_OutputSlip ack, True
    End Select
    If isOwnUse Then
        Tell "Acknowledged as " & ack & "." & vbLf & corrNote & vbLf & vbLf & _
            "An Own-Use row has been started. Enter the generator units (kW) and click Save notification to issue the OUN number."
        GoToRow lo, rowNo, "Unit 1 Make/Model"
    ElseIf autoSave Then
        Tell "Acknowledged as " & ack & "." & vbLf & corrNote & vbLf & vbLf & "Saving the Register row now..."
        GoToRow lo, rowNo, "Form Filed"
        SaveSubmissionAt rowNo
    Else
        Tell "Acknowledged as " & ack & "." & vbLf & corrNote & vbLf & vbLf & _
            "A Register row has been started with this number. Complete the blue cells (primary activity, licence status, " & _
            "operating Y/N ...) and click Save submission."
        GoToRow lo, rowNo, "Primary Activity"
    End If
    Exit Sub
Failed:
    Tell "Could not save: " & Err.Description & IIf(Len(ack) > 0 And Not existing, vbLf & "Check whether " & ack & " was logged before trying again.", "")
    ok = False
    Resume Done
End Sub

Private Function NewRegisterRow(ByVal ack As String, ByVal fdNo As String, ByVal ftype As String, ByVal dRecv As Date) As Long
    Dim lo As ListObject, r As Long
    Set lo = t("tblRegister")
    r = AddRow(lo)
    SetV lo, r, "Filing Type", ftype
    SetV lo, r, "Form Filed", FV("form")
    If ftype <> FILING_NEW Then SetV lo, r, "Linked Registration No.", FV("relno")
    SetV lo, r, "Registered Name", FV("name")
    SetV lo, r, "Date Submitted", DateSerial(Year(dRecv), Month(dRecv), Day(dRecv))
    SetV lo, r, "Submission Channel", ChannelFor(Txt(FV("mode")))
    SetV lo, r, "CAC No.", FV("cac")
    SetV lo, r, "Registered Address", FV("address")
    SetV lo, r, "Principal LGA", FV("lga")
    SetV lo, r, "Primary Activity", FV("activity")
    SetV lo, r, "Licence Status", FV("licence")
    SetV lo, r, "Compliance Officer", FV("contact")
    SetV lo, r, "Phone", FV("phone")
    SetV lo, r, "Email", FV("email")
    SetV lo, r, "Operating on Effective Date (Y/N)", FV("operating")
    SetV lo, r, "Planned Start Date", FV("start")
    SetV lo, r, "Remarks", RegistryRemarks()
    SetV lo, r, "Registry Ack No.", ack
    If Len(fdNo) > 0 Then SetV lo, r, "Front Desk Intake No.", fdNo
    NewRegisterRow = r
End Function

Private Function NewOwnUseRow(ByVal ack As String, ByVal fdNo As String, ByVal dRecv As Date) As Long
    Dim lo As ListObject, r As Long
    Set lo = t("tblOwnUse")
    r = AddRow(lo)
    SetV lo, r, "Name", FV("name")
    SetV lo, r, "Date Filed", DateSerial(Year(dRecv), Month(dRecv), Day(dRecv))
    SetV lo, r, "CAC No.", FV("cac")
    SetV lo, r, "Site Address", FV("address")
    SetV lo, r, "LGA", FV("lga")
    SetV lo, r, "Contact Person", FV("contact")
    SetV lo, r, "Phone", FV("phone")
    SetV lo, r, "Email", FV("email")
    SetV lo, r, "Remarks", RegistryRemarks()
    SetV lo, r, "Registry Ack No.", ack
    If Len(fdNo) > 0 Then SetV lo, r, "Front Desk Intake No.", fdNo
    NewOwnUseRow = r
End Function

Private Function RegistryRemarks() As String
    Dim s As String
    s = Txt(FV("remarks"))
    If Len(Txt(FV("officer"))) > 0 Then s = s & IIf(Len(s) > 0, "; ", "") & "Received by " & Txt(FV("officer"))
    If Len(Txt(FV("sch2"))) > 0 Then s = s & "; Schedule 2 documents at receipt: " & Txt(FV("sch2"))
    If Len(Txt(FV("fee"))) > 0 Then s = s & "; fee evidence: " & Txt(FV("fee"))
    If Len(Txt(FV("payref"))) > 0 Then s = s & "; payment ref. " & Txt(FV("payref"))
    If Len(Txt(FV("amt"))) > 0 Then s = s & "; amount shown " & Txt(FV("amt"))
    RegistryRemarks = s
End Function

' ================================================================== filings saved straight on the Register / Own-Use sheet
' Called by Save submission / Save notification when the row has no Registry Ack No. yet:
' logs the new acknowledgement in Filings Inward (linked) and in the correspondence Inward Register.
Public Function RX_LogDirectEntry(ByVal lo As ListObject, ByVal r As Long, ByVal ack As String) As String
    Dim isOU As Boolean, nm As String, d As Date, lr As Long, p As String, note As String, ftype As String, mode As String
    Dim lga As String, contact As String, form As String, relno As String, subj As String
    On Error GoTo Fail
    isOU = (lo.Name = "tblOwnUse")
    If isOU Then
        nm = GetS(lo, r, "Name")
        AsDate GetV(lo, r, "Date Filed"), d
        ftype = OWNUSE_TYPE
        mode = "Hand delivery"
        lga = GetS(lo, r, "LGA")
        contact = GetS(lo, r, "Contact Person")
        form = "REG-01I"
        subj = OWNUSE_TYPE
    Else
        nm = GetS(lo, r, "Registered Name")
        AsDate GetV(lo, r, "Date Submitted"), d
        ftype = GetS(lo, r, "Filing Type")
        mode = ModeFor(GetS(lo, r, "Submission Channel"))
        If Len(mode) = 0 Then mode = "Hand delivery"
        lga = GetS(lo, r, "Principal LGA")
        contact = GetS(lo, r, "Compliance Officer")
        form = GetS(lo, r, "Form Filed")
        relno = GetS(lo, r, "Linked Registration No.")
        subj = ftype & " - " & form
    End If
    p = KV("no", ack) & KV("recv", d) & KV("mode", mode) & KV("ctype", CorrTypeFor(ftype)) & KV("ftype", ftype) & _
        KV("sender", nm) & KV("subject", subj) & KV("cac", GetS(lo, r, "CAC No.")) & KV("lga", lga) & _
        KV("contact", contact) & KV("phone", GetS(lo, r, "Phone")) & KV("email", GetS(lo, r, "Email")) & _
        KV("officer", CurrentUser()) & KV("ackvia", "Not yet issued") & KV("relno", relno) & _
        KV("remarks", "Saved directly on the " & IIf(isOU, "Own-Use", "Register") & " sheet")
    If LogPre() = "RI" Then
        lr = NextFreeRow("RI", "no", "sender")
        If lr > 0 Then
            SetCell "RI", lr, "no", ack
            SetCell "RI", lr, "source", IIf(isOU, "Own-Use sheet (direct entry)", "Register (direct entry)")
            SetCell "RI", lr, "recv", d
            SetCell "RI", lr, "mode", mode
            SetCell "RI", lr, "ftype", ftype
            SetCell "RI", lr, "form", form
            SetCell "RI", lr, "sender", nm
            SetCell "RI", lr, "subject", subj
            SetCell "RI", lr, "cac", GetS(lo, r, "CAC No.")
            SetCell "RI", lr, "lga", lga
            SetCell "RI", lr, "contact", contact
            SetCell "RI", lr, "phone", PV(p, "phone")
            SetCell "RI", lr, "email", PV(p, "email")
            SetCell "RI", lr, "officer", CurrentUser()
            SetCell "RI", lr, "ackvia", "Not yet issued"
            SetCell "RI", lr, "relno", relno
            note = RX_LogToCorrespondence(RowPayload(lr))
            SetCell "RI", lr, "corr", note
        Else
            note = "The Filings Inward log is full"
        End If
    Else
        note = RX_LogToCorrespondence(p)
    End If
    RX_LogDirectEntry = note
    Exit Function
Fail:
    RX_LogDirectEntry = "Not logged: " & Err.Description
End Function

' ================================================================== shared OGSERC/ACK series
' Next acknowledgement number for a year: highest used in this workbook or in the Inward Register, + 1.
' Returns "" if the officer cancels because the correspondence workbook cannot be reached.
Public Function RX_NextAck(ByVal yr As Long) As String
    Dim stem As String, mx As Long, wb As Workbook, m2 As Variant, reached As Boolean
    stem = Txt(Setting("cfgAckPrefix")) & "/" & yr & "/"
    mx = RegLink_MaxEvalSerial(stem)
    Set wb = RX_Partner()
    If Not wb Is Nothing Then
        On Error Resume Next
        m2 = Application.Run(CorrProc(wb, "RegLink_MaxInwardSerial"), stem)
        reached = (Err.Number = 0)
        If Not reached Then mLinkError = "its macros did not answer (" & Err.Description & ")"
        Err.Clear
        On Error GoTo 0
        If reached And IsNumeric(m2) Then
            If CLng(m2) > mx Then mx = CLng(m2)
        End If
    End If
    If Not reached And IsLinked() Then
        If Not Ask("The correspondence workbook could not be reached: " & mLinkError & "." & vbLf & vbLf & _
                   "The acknowledgement number cannot be checked against its Inward Register, so it could clash with a number " & _
                   "the Registry issues. Issue " & stem & Format$(mx + 1, "00000") & " anyway and send it later with " & _
                   "SYNC WITH CORRESPONDENCE REGISTRY?") Then Exit Function
    End If
    RX_NextAck = stem & Format$(mx + 1, "00000")
End Function

' Highest serial under `stem` used in this workbook (Register, Own-Use, Filings Inward). Called by the
' correspondence workbook before it issues an inward number.
Public Function RegLink_MaxEvalSerial(ByVal stem As String) As Long
    Dim mx As Long
    mx = MaxInTable("tblRegister", "Ack No.", stem, mx)
    mx = MaxInTable("tblRegister", "Registry Ack No.", stem, mx)
    mx = MaxInTable("tblOwnUse", "Registry Ack No.", stem, mx)
    If HasName("RI_no") Then mx = MaxInRange(NR("RI_no"), stem, mx)
    RegLink_MaxEvalSerial = mx
End Function

Private Function MaxInTable(ByVal tbl As String, ByVal col As String, ByVal stem As String, ByVal mx As Long) As Long
    Dim lo As ListObject
    MaxInTable = mx
    Set lo = t(tbl)
    If lo.DataBodyRange Is Nothing Then Exit Function
    MaxInTable = MaxInRange(lo.ListColumns(col).DataBodyRange, stem, mx)
End Function

Private Function MaxInRange(ByVal rg As Range, ByVal stem As String, ByVal mx As Long) As Long
    Dim v As Variant, i As Long, s As String, n As Long
    MaxInRange = mx
    If rg.Cells.Count = 1 Then
        ReDim v(1 To 1, 1 To 1)
        v(1, 1) = rg.Value
    Else
        v = rg.Value
    End If
    For i = 1 To UBound(v, 1)
        If Not IsError(v(i, 1)) Then
            s = CStr(v(i, 1))
            If Len(s) > Len(stem) Then
                If UCase$(Left$(s, Len(stem))) = UCase$(stem) Then
                    n = CLng(Val(Mid$(s, Len(stem) + 1)))
                    If n > MaxInRange Then MaxInRange = n
                End If
            End If
        End If
    Next i
End Function

' ================================================================== the correspondence workbook
Private Function IsLinked() As Boolean
    If RX_IsCombined() Then IsLinked = True: Exit Function
    If Not HasName("cfgCorrBook") Then Exit Function
    IsLinked = (Len(Txt(Setting("cfgCorrBook"))) > 0)
End Function

Private Function CorrProc(ByVal wb As Workbook, ByVal proc As String) As String
    CorrProc = "'" & Replace(wb.Name, "'", "''") & "'!RegistryDesk." & proc
End Function

Private Function FileNameOnly(ByVal p As String) As String
    Dim i As Long
    i = InStrRev(Replace(p, "/", "\"), "\")
    If i > 0 Then FileNameOnly = Mid$(p, i + 1) Else FileNameOnly = p
End Function

' The correspondence workbook: this workbook (combined), an open workbook, or the file named in Settings
' (opened from the same folder as this workbook, with its events off, and closed again by RX_ReleasePartner).
Public Function RX_Partner() As Workbook
    Dim fn As String, wb As Workbook, p As String, base As String, prevEv As Boolean, found As Boolean
    If RX_IsCombined() Then Set RX_Partner = ThisWorkbook: Exit Function
    If Not mPartner Is Nothing Then Set RX_Partner = mPartner: Exit Function
    mLinkError = ""
    If Not IsLinked() Then mLinkError = "no correspondence workbook is set in Settings": Exit Function
    fn = Txt(Setting("cfgCorrBook"))
    For Each wb In Application.Workbooks
        If LCase$(wb.Name) = LCase$(FileNameOnly(fn)) Then Set mPartner = wb: Exit For
    Next wb
    If mPartner Is Nothing Then
        For Each wb In Application.Workbooks
            If Not wb Is ThisWorkbook Then
                If RX_SheetExists(wb, "Inward Register") And RX_SheetExists(wb, "Front Desk Log") Then Set mPartner = wb: Exit For
            End If
        Next wb
    End If
    If mPartner Is Nothing Then
        If InStr(fn, "\") > 0 Or InStr(fn, "/") > 0 Then
            p = fn
        Else
            base = ThisWorkbook.Path
            If LCase$(Left$(base, 4)) = "http" Then p = base & "/" & fn Else p = base & Application.PathSeparator & fn
        End If
        If LCase$(Left$(p, 4)) <> "http" Then
            found = False
            On Error Resume Next
            found = (Len(Dir(p)) > 0)
            On Error GoTo 0
            If Not found Then mLinkError = "it was not found at " & p: Exit Function
        End If
        prevEv = Application.EnableEvents
        Application.EnableEvents = False
        On Error Resume Next
        Set mPartner = Application.Workbooks.Open(Filename:=p, UpdateLinks:=0, AddToMru:=False)
        If Err.Number <> 0 Then mLinkError = "it could not be opened (" & Err.Description & ")"
        Err.Clear
        On Error GoTo 0
        Application.EnableEvents = prevEv
        If mPartner Is Nothing Then Exit Function
        mOpenedHere = True
        If mPartner.ReadOnly Then
            mLinkError = "it opened read-only (someone else may have it open)"
            mPartner.Close SaveChanges:=False
            Set mPartner = Nothing
            mOpenedHere = False
            Exit Function
        End If
        ThisWorkbook.Activate
    End If
    Set RX_Partner = mPartner
End Function

' Save and close the correspondence workbook if this workbook opened it.
Public Sub RX_ReleasePartner()
    Dim prevEv As Boolean
    If mOpenedHere And Not mPartner Is Nothing Then
        prevEv = Application.EnableEvents
        Application.EnableEvents = False
        On Error Resume Next
        mPartner.Close SaveChanges:=True
        On Error GoTo 0
        Application.EnableEvents = prevEv
    End If
    Set mPartner = Nothing
    mOpenedHere = False
End Sub

' Write the filing to the correspondence Inward Register. Returns the status line kept in Filings Inward.
Private Function RX_LogToCorrespondence(ByVal payload As String) As String
    Dim wb As Workbook, res As Variant
    Set wb = RX_Partner()
    If wb Is Nothing Then
        If IsLinked() Then
            RX_LogToCorrespondence = "Not logged in the Inward Register: " & mLinkError & ". Use SYNC WITH CORRESPONDENCE REGISTRY."
        Else
            RX_LogToCorrespondence = "Not linked: no correspondence workbook is set in Settings"
        End If
        Exit Function
    End If
    On Error Resume Next
    res = Application.Run(CorrProc(wb, "RegLink_LogFiling"), payload)
    If Err.Number <> 0 Then res = "its macros did not answer (" & Err.Description & ")"
    Err.Clear
    On Error GoTo 0
    If CStr(res) = "OK" Or CStr(res) = "EXISTS" Then
        RX_LogToCorrespondence = "Logged in the Inward Register" & IIf(wb Is ThisWorkbook, "", " of " & wb.Name) & " " & Format$(Now, "dd-mmm-yyyy hh:nn")
    Else
        RX_LogToCorrespondence = "Not logged in the Inward Register: " & CStr(res)
    End If
End Function

' Called by the correspondence workbook when the Registry acknowledges a registration filing.
Public Function RegLink_ReceiveInward(ByVal payload As String) As String
    Dim ack As String, r As Long, ex As Long, k As Variant, v As Variant, prevEv As Boolean, lo As ListObject, er As Long
    On Error GoTo Fail
    If RX_IsCombined() Then RegLink_ReceiveInward = "OK": Exit Function
    ack = Txt(PV(payload, "no"))
    If Len(ack) = 0 Then RegLink_ReceiveInward = "No acknowledgement number": Exit Function
    ex = FindIn("RI", "no", ack)
    If ex > 0 Then
        If LCase$(Txt(CellV("RI", ex, "sender"))) = LCase$(Txt(PV(payload, "sender"))) Then
            RegLink_ReceiveInward = "EXISTS"
        Else
            RegLink_ReceiveInward = "CLASH: " & ack & " is already used in Filings Inward for " & Txt(CellV("RI", ex, "sender"))
        End If
        Exit Function
    End If
    Set lo = t("tblRegister")
    er = FindRow(lo, "Ack No.", ack)
    If er > 0 Then
        RegLink_ReceiveInward = "CLASH: " & ack & " is already on the Register for " & GetS(lo, er, "Registered Name")
        Exit Function
    End If
    r = NextFreeRow("RI", "no", "sender")
    If r = 0 Then RegLink_ReceiveInward = "The Filings Inward log is full": Exit Function
    prevEv = Application.EnableEvents
    Application.EnableEvents = False
    SetCell "RI", r, "no", ack
    SetCell "RI", r, "source", "Correspondence workbook"
    For Each k In Array("recv", "mode", "sender", "subject", "sref", "relno", "cac", "lga", "contact", "phone", "email", _
                        "by", "vols", "sch2", "fee", "payref", "amt", "officer", "ackvia", "fdno", "remarks")
        v = PV(payload, CStr(k))
        If Not IsEmpty(v) Then SetCell "RI", r, CStr(k), v
    Next k
    SetCell "RI", r, "ftype", EvalTypeFor(Txt(PV(payload, "ftype")))
    SetCell "RI", r, "corr", "From the correspondence workbook " & Format$(Now, "dd-mmm-yyyy hh:nn")
    Audit "Filing received from the Registry", ack, Txt(PV(payload, "ftype")) & " - " & Txt(PV(payload, "sender"))
    Application.EnableEvents = prevEv
    RegLink_ReceiveInward = "OK"
    Exit Function
Fail:
    Application.EnableEvents = True
    RegLink_ReceiveInward = "ERR: " & Err.Description
End Function

' Button: send acknowledgements not yet in the Inward Register, and fetch filings the Registry acknowledged.
Public Sub RX_SyncCorrespondence()
    Dim wb As Workbook, r As Long, nSent As Long, nFail As Long, res As Variant, note As String, src As String
    If RX_IsCombined() Then Tell "This workbook holds the Inward Register itself: there is nothing to sync.": Exit Sub
    Set wb = RX_Partner()
    If wb Is Nothing Then Tell "Could not reach the correspondence workbook: " & mLinkError & ".": Exit Sub
    Application.ScreenUpdating = False
    For r = FirstRowOf("RI") To LastRowOf("RI")
        If Len(Txt(CellV("RI", r, "no"))) > 0 Then
            src = Txt(CellV("RI", r, "source"))
            If src <> "Correspondence workbook" And Left$(Txt(CellV("RI", r, "corr")), 6) <> "Logged" Then
                note = RX_LogToCorrespondence(RowPayload(r))
                SetCell "RI", r, "corr", note
                If Left$(note, 6) = "Logged" Then nSent = nSent + 1 Else nFail = nFail + 1
            End If
        End If
    Next r
    On Error Resume Next
    res = Application.Run(CorrProc(wb, "RegLink_PushPending"))
    If Err.Number <> 0 Then res = "could not ask the Registry for its filings (" & Err.Description & ")"
    Err.Clear
    On Error GoTo 0
    RX_ReleasePartner
    Application.Calculate
    Application.ScreenUpdating = True
    Tell "Sync with the correspondence workbook done." & vbLf & _
        "Acknowledgements sent to its Inward Register: " & nSent & IIf(nFail > 0, " (" & nFail & " could not be sent - see Filings Inward)", "") & vbLf & _
        "Filings received from the Registry: " & CStr(res)
End Sub

' ================================================================== payloads (key/value text passed between the workbooks)
Private Function Enc(ByVal v As Variant) As String
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If VarType(v) = vbString Then
        If Len(Trim$(v)) = 0 Then Exit Function
        Enc = "$" & v
    ElseIf VarType(v) = vbDate Or IsNumeric(v) Then
        Enc = "#" & Trim$(Str$(CDbl(v)))
    Else
        Enc = "$" & CStr(v)
    End If
End Function

Private Function KV(ByVal key As String, ByVal v As Variant) As String
    Dim e As String
    e = Enc(v)
    If Len(e) > 0 Then KV = Chr$(30) & key & Chr$(31) & e
End Function

Private Function PV(ByVal payload As String, ByVal key As String) As Variant
    Dim p As Long, q As Long, s As String
    PV = Empty
    p = InStr(1, payload, Chr$(30) & key & Chr$(31), vbBinaryCompare)
    If p = 0 Then Exit Function
    p = p + Len(key) + 2
    q = InStr(p, payload, Chr$(30), vbBinaryCompare)
    If q = 0 Then q = Len(payload) + 1
    s = Mid$(payload, p, q - p)
    If Left$(s, 1) = "#" Then
        PV = Val(Mid$(s, 2))
    ElseIf Left$(s, 1) = "$" Then
        PV = Mid$(s, 2)
    End If
End Function

Private Function FormPayload(ByVal ack As String, ByVal fdNo As String, ByVal ftype As String) As String
    Dim k As Variant, p As String
    p = KV("no", ack) & KV("ctype", CorrTypeFor(ftype)) & KV("ftype", ftype) & KV("sender", FV("name")) & KV("fdno", fdNo)
    For Each k In Array("recv", "mode", "subject", "sref", "relno", "cac", "lga", "contact", "phone", "email", "by", "vols", _
                        "sch2", "fee", "payref", "amt", "officer", "ackvia", "remarks")
        p = p & KV(CStr(k), FV(CStr(k)))
    Next k
    If Len(Txt(FV("subject"))) = 0 Then p = p & KV("subject", ftype & " - " & Txt(FV("form")))
    FormPayload = p
End Function

Private Function RowPayload(ByVal r As Long) As String
    Dim k As Variant, p As String, ftype As String
    ftype = Txt(CellV("RI", r, "ftype"))
    p = KV("ctype", CorrTypeFor(ftype)) & KV("ftype", ftype)
    For Each k In Array("no", "recv", "mode", "sender", "subject", "sref", "relno", "cac", "lga", "contact", "phone", "email", _
                        "by", "vols", "sch2", "fee", "payref", "amt", "officer", "ackvia", "fdno", "remarks")
        p = p & KV(CStr(k), CellV("RI", r, CStr(k)))
    Next k
    If Len(Txt(CellV("RI", r, "subject"))) = 0 Then p = p & KV("subject", ftype & " - " & Txt(CellV("RI", r, "form")))
    RowPayload = p
End Function

' ================================================================== acknowledgement slip
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

Private Sub RX_OutputSlip(ByVal ack As String, ByVal toPdf As Boolean)
    Dim ws As Worksheet, f As String
    On Error GoTo Fail
    Set ws = ThisWorkbook.Worksheets("Acknowledgement Slip")
    ws.Range("D1").Value = ack
    Application.Calculate
    If gTest Then Exit Sub
    If toPdf Then
        f = OutputFolder("PDF") & SafeFile("Slip " & ack) & ".pdf"
        ws.ExportAsFixedFormat 0, f, 0, True, False, , , False
        Tell "Saved:" & vbLf & f
    Else
        ws.PrintOut
    End If
    Exit Sub
Fail:
    Tell "Could not print or save the slip: " & Err.Description
End Sub

Private Function SlipAck() As String
    SlipAck = Txt(ThisWorkbook.Worksheets("Acknowledgement Slip").Range("D1").Value)
    If Len(SlipAck) = 0 Then SlipAck = Txt(NR("RX_LastAck").Value)
    If FindIn(LogPre(), "no", SlipAck) = 0 Then
        Tell "Choose an acknowledgement number in the yellow cell on the Acknowledgement Slip first."
        SlipAck = ""
    End If
End Function

Public Sub RX_PrintSlip()
    Dim a As String
    a = SlipAck()
    If Len(a) > 0 Then RX_OutputSlip a, False
End Sub

Public Sub RX_PdfSlip()
    Dim a As String
    a = SlipAck()
    If Len(a) > 0 Then RX_OutputSlip a, True
End Sub
