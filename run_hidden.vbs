Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = Fso.GetParentFolderName(WScript.ScriptFullName)
' O comando chama o node no arquivo server.js. O "0" oculta a janela.
WshShell.Run "cmd /c cd /d """ & ScriptDir & """ && node server.js", 0, False
