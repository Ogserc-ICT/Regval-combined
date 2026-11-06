<#
  Opens an exported workbook in Excel and checks it (Phase 7 acceptance check).
  Optional: needs desktop Excel on the machine running it. The export itself never does.

  powershell -ExecutionPolicy Bypass -File scripts/workbook/verify-excel.ps1 -Path exports\OGSERC_....xlsm -EffectiveDate 2026-10-22 -Commit abc1234

  Nothing is saved: the workbook is opened, exercised and closed without saving.
#>
param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$EffectiveDate,
  [Parameter(Mandatory = $true)][string]$Commit,
  [switch]$Training
)
$ErrorActionPreference = "Stop"
$full = (Resolve-Path $Path).Path
$results = New-Object System.Collections.Generic.List[string]
$failed = 0
function Check([string]$name, [bool]$ok, [string]$detail) {
  if ($ok) { $script:results.Add("PASS  $name  $detail") } else { $script:results.Add("FAIL  $name  $detail"); $script:failed++ }
}

$xl = New-Object -ComObject Excel.Application
try {
  $xl.Visible = $false; $xl.DisplayAlerts = $false; $xl.EnableEvents = $false; $xl.AutomationSecurity = 1
  $wb = $xl.Workbooks.Open($full, 0, $true)
  $q = "'" + $wb.Name + "'!"
  $xl.CalculateFull()

  # G1: one Effective Date
  $set = $wb.Worksheets.Item("Settings"); $rs = $wb.Worksheets.Item("Registry Settings")
  $eff = [DateTime]::FromOADate($set.Range("B7").Value2).ToString("yyyy-MM-dd")
  Check "G1 Effective Date" ($eff -eq $EffectiveDate) "Settings B7 = $eff"
  Check "G1 one cell feeds both halves" (($rs.Range("B14").Formula -eq "=cfgEffectiveDate") -and ($rs.Range("B14").Value2 -eq $set.Range("B7").Value2)) ("Registry Settings B14 = " + $rs.Range("B14").Formula)
  Check "G1 deadline includes the extension" ($rs.Range("B15").Value2 -eq $set.Range("B10").Value2) ("Registry Settings B15 = " + $rs.Range("B15").Formula)

  # G2 staff names, G3 one signatory list
  $lists = $wb.Worksheets.Item("Lists")
  $codes = @($lists.Range("BK6").Value2, $lists.Range("BM6").Value2, $lists.Range("BO6").Value2)
  Check "G2 staff lists hold names" (-not ($codes -contains 69 -or $codes -contains 82 -or $codes -contains 65)) ("BK6/BM6/BO6 = " + ($codes -join " / "))
  Check "G3 one signatory list" (($set.Range("B29").Formula -like "*Registry Lists*") -or [string]::IsNullOrEmpty($set.Range("B29").Text)) ("Settings B29 = " + $set.Range("B29").Formula)

  # G4 no EXAMPLE rows (clean) / kept (training)
  $found = 0
  foreach ($n in @("Front Desk Log", "Inward Register", "Outward Register", "File Index", "File Movement", "Register", "Payments", "Own-Use")) {
    $hit = $wb.Worksheets.Item($n).UsedRange.Find("EXAMPLE", [Type]::Missing, -4163, 2)   # values, part of a cell
    if ($null -ne $hit) { $found++ }
  }
  if ($Training) { Check "G4 training copy keeps EXAMPLE rows" ($found -gt 0) "$found sheet(s) with EXAMPLE" }
  else { Check "G4 no EXAMPLE rows" ($found -eq 0) "$found sheet(s) with EXAMPLE" }

  # G5 text cells
  $fmt = @(
    $wb.Worksheets.Item("Front Desk Log").Range("K6").NumberFormat,
    $wb.Worksheets.Item("Front Desk").Range("C10").NumberFormat,
    $wb.Worksheets.Item("Inward Register").Range("U6").NumberFormat,
    $wb.Worksheets.Item("Register").Range("AD7").NumberFormat,
    $wb.Worksheets.Item("Register").Range("K7").NumberFormat
  )
  Check "G5 phone / TIN cells are Text" (($fmt | Where-Object { $_ -ne "@" }).Count -eq 0) ("formats: " + ($fmt -join ", "))

  # G10 stamp
  Check "G10 build stamp" ($set.Range("B50").Text -like "$Commit*") ("Settings B50 = " + $set.Range("B50").Text)

  # G14 late charge (the formula is checked on the Register row created by the save below)
  $d100 = $xl.Evaluate("MIN(INDEX(tblFees[Late Initial],4)+INDEX(tblFees[Late Daily],4)*100,INDEX(tblFees[Late Daily Cap],4))")
  Check "G14 category D, 100 days late" ($d100 -eq 10000000) ("= " + $d100)

  # G11 and the macros: run a real Registry Intake save in test mode (no dialogs)
  $year = (Get-Date).Year
  # Test mode skips the macros' own unprotect (as in the workbook's original test harness); unprotect in memory only.
  foreach ($ws in $wb.Worksheets) { if ($ws.ProtectContents) { $ws.Unprotect("ogserc-v2") } }
  $ackBefore = $xl.Run($q + "modRegistry.RX_NextAck", $year)
  [void]$xl.Run($q + "modCommon.TestBegin", "Verify Officer")
  $ri = $wb.Worksheets.Item("Registry Intake")
  $ri.Range("C6").Value2 = (Get-Date).AddHours(-1).ToOADate()
  $ri.Range("C7").Value2 = "Hand delivery"
  $ri.Range("C8").Value2 = "New registration"
  $ri.Range("C9").Value2 = "REG-01D"
  $ri.Range("C10").Value2 = "Verify Power Ltd"
  $ri.Range("C15").Value2 = "Sagamu"
  $ri.Range("C22").Value2 = "08021846578"
  $ri.Range("C30").Value2 = "Verify Officer"
  $ri.Range("C31").Value2 = "Printed slip"
  $xl.EnableEvents = $true
  [void]$xl.Run($q + "modRegistry.RX_SaveIntake")
  $xl.EnableEvents = $false
  $messages = $xl.Run($q + "modCommon.TestEnd")
  $inw = $wb.Worksheets.Item("Inward Register")
  $hit = $inw.UsedRange.Find($ackBefore)
  $logged = ($null -ne $hit) -and ($inw.Cells($hit.Row, 11).Text -eq "Verify Power Ltd")
  Check "G11 intake logs into this workbook's Inward Register" $logged ("$ackBefore; messages: " + (($messages -split "`n")[0]))
  $phoneCell = if ($null -ne $hit) { $inw.Cells($hit.Row, 21).Text } else { "" }
  Check "G5 phone kept with its zero after a save" ($phoneCell -eq "08021846578") "Inward phone = $phoneCell"
  $lo = $wb.Worksheets.Item("Register").ListObjects.Item("tblRegister")
  $regRow = $null
  if ($null -ne $lo.DataBodyRange) { $regRow = $lo.DataBodyRange.Find($ackBefore, [Type]::Missing, -4163, 1) }
  Check "Register row under the same ACK" ($null -ne $regRow) ("messages: " + ($messages -replace "`n", " | "))
  if ($null -ne $regRow) {
    $r = $regRow.Row
    $lcCell = $wb.Worksheets.Item("Register").Cells($r, $lo.ListColumns.Item("Late Charge").Range.Column)
    Check "G14 Late Charge formula" ($lcCell.Formula2 -like "*MIN(i+d*n,cp)*") ("Register Late Charge = " + $lcCell.Formula2.Substring([Math]::Max(0, $lcCell.Formula2.Length - 60)))
    $ph = $wb.Worksheets.Item("Register").Cells($r, $lo.ListColumns.Item("Phone").Range.Column)
    Check "G5 Register phone is Text" (($ph.NumberFormat -eq "@") -and ($ph.Text -eq "08021846578")) ("Register phone = " + $ph.Text + " [" + $ph.NumberFormat + "]")
  }
  $ackAfter = $xl.Run($q + "modRegistry.RX_NextAck", $year)
  Check "One ACK series continues" ($ackAfter -ne $ackBefore) "next after save: $ackAfter"

  $wb.Close($false)
}
catch {
  $results.Add("FAIL  Excel  " + $_.Exception.Message); $failed++
}
finally {
  $xl.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl)
}
$results | ForEach-Object { Write-Output $_ }
if ($failed -gt 0) { Write-Output "$failed check(s) failed"; exit 1 } else { Write-Output "All checks passed" }
