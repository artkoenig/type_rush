# Feste Zeit + Wertung statt "erster fertig"

"Rennen" (erster fertig) und "Lernen" (Technik zählt) kollidieren: Bei "erster fertig
gewinnt" schlägt Tempo immer die Technik. Entschieden: Die Runde hat eine feste Dauer; alle
Spieler tippen; die höchste Wertung gewinnt.

**Considered Options**: "Erster fertig gewinnt" (reines Tempo). Abgelehnt: würde korrekte
Technik bestrafen und das Lernziel untergraben.

**Finger-Korrektheit**: Ursprünglich sollte die Wertung Finger-Korrektheit enthalten. Eine
Standard-Tastatur meldet aber nur die Taste, nicht den Finger – die Fingerwahl ist nicht
messbar. Die Wertung belohnt daher Tempo + Tasten-Genauigkeit; Finger-Hinweise dienen als
visuelle Lernhilfe, ohne in der Wertung einzugehen.

**Formel**: `Wertung = (correct / elapsed) · 60 · (correct / (correct + errors))²` —
Tempo (Zeichen pro Minute) × Tasten-Genauigkeit². Bei perfekter Genauigkeit ist der Score
exakt die Zeichen-pro-Minute; jeder Fehler senkt ihn (quadratisch). `elapsed` ist die Zeit
bis zum letzten Tastendruck (eingefroren) bzw. die Runden-Dauer — Idle-Zeit zählt nie gegen.

**Consequences**: Langsam + korrekt kann schnell + ungenau schlagen. Die UI braucht einen
Timer statt einer Finish-Erkennung.
