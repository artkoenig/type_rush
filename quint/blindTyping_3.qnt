// Instanz: 10 Pids (Spieler + Zuschauer-Pool), 2 Texte, 9 Tasten, 10 Nicknames.
// Kleiner als die echten Werte, damit quint run schnell und deterministisch
// genug alle Pfade erkundet.
module blindTyping_3 {
  import blindTyping(
    HOST = 1,
    PIDS = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    MAX_PLAYERS = 8,
    DURATIONS = Set(30, 60, 120),
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora", "eve", "fred", "gus", "hal", "ida", "joe")
  ).* from "./blindTyping"
}
