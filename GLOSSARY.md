# Blind-Tippen Multiplayer

Ein lokales Multiplayer-Spiel zum Erlernen des Blind-Tippens: Spieler tippen im Browser
gegeneinander, koordiniert von einem Host-Server im lokalen Netz.

## Language

**Runde**:
Eine Spielinstanz mit fester Dauer, in der alle verbundenen Spieler denselben Text tippen;
die beste Wertung gewinnt. Kann mit 1+ Spielern starten (Solo-Praxis).
_Avoid_: Match, Game, Session

**Wertung**:
Pro Spieler berechnete Zahl, die Tempo und Tasten-Genauigkeit kombiniert.

**Finger-Hinweis**:
UI-Anzeige, die zeigt, welcher Finger die nächste Taste drücken soll. Zählt nicht in der
Wertung (Fingerwahl ist nicht messbar) – reine Lernhilfe.

**Lobby**:
Der Wartebereich, in dem Spieler vor einer Runde zusammenkommen.

**Start-Recht**:
Das Recht, eine Runde zu starten; rotiert unter den Spielern (frühester Beitretender zuerst).

**Host**:
Die Maschine, die den Spiel-Server betreibt; alle Spieler (inkl. Host) verbinden sich per
Browser. Bleibt fix – geht er, endet das Spiel.

**Fehler-Verhalten**:
Falsche Taste blockiert: Cursor bleibt, Stelle rot, korrekte Taste nötig; jeder Fehldruck
zählt in die Tasten-Genauigkeit. (ADR 0003)
