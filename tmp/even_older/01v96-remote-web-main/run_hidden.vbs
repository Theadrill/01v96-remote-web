Set WshShell = CreateObject("WScript.Shell")
' O comando chama o node no arquivo server.js. O "0" oculta a janela.
WshShell.Run "node server.js", 0, False