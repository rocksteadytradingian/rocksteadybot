Set args = WScript.Arguments
If args.Count < 1 Then WScript.Quit 0

repo = args(0)
Set fso = CreateObject("Scripting.FileSystemObject")
cmd = repo & "\apps\desktop\scripts\open-desktop.cmd"
If Not fso.FileExists(cmd) Then WScript.Quit 0

Set sh = CreateObject("WScript.Shell")
desktop = sh.SpecialFolders("Desktop")
If desktop = "" Then WScript.Quit 0

Set lnk = sh.CreateShortcut(desktop & "\RocksteadyBot.lnk")
lnk.TargetPath = cmd
lnk.WorkingDirectory = repo
lnk.WindowStyle = 1
lnk.Description = "Start RocksteadyBot"
ico = repo & "\apps\desktop\assets\icon.ico"
If fso.FileExists(ico) Then lnk.IconLocation = ico
lnk.Save
