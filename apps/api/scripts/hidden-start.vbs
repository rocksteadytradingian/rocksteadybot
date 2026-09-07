' Start a process with no console window. Window style 0 is hidden; wait is
' False so this script can exit while the child keeps running.
Option Explicit
If WScript.Arguments.Count < 2 Then WScript.Quit 1

Dim sh, cwd, cmd, i
Set sh = CreateObject("WScript.Shell")
cwd = WScript.Arguments(0)
On Error Resume Next
sh.CurrentDirectory = cwd
If Err.Number <> 0 Then WScript.Quit 1
Err.Clear

cmd = Quote(WScript.Arguments(1))
For i = 2 To WScript.Arguments.Count - 1
  cmd = cmd & " " & Quote(WScript.Arguments(i))
Next
sh.Run cmd, 0, False
If Err.Number <> 0 Then WScript.Quit 1

Function Quote(value)
  Quote = """" & Replace(value, """", """""") & """"
End Function
