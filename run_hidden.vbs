Set WshShell = CreateObject("WScript.Shell")
Set Fso = CreateObject("Scripting.FileSystemObject")
ScriptDir = Fso.GetParentFolderName(WScript.ScriptFullName)
' O comando chama o executavel compilado server_rust.exe. O "0" oculta a janela.
WshShell.Run "cmd /c cd /d """ & ScriptDir & """ && server_rust.exe", 0, False
