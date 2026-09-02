' Optional hidden launcher. The desktop shortcut uses start-desktop.cmd so
' Windows Smart App Control can show a prompt instead of failing silently.
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(scriptDir)
cmd = scriptDir & "\start-desktop.cmd"
sh.CurrentDirectory = root
sh.Run "cmd.exe /c """ & cmd & """", 1, False
