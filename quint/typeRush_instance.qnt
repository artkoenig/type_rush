// Instanz: 10 Pids, 2 Texte, 9 Tasten, 10 Nicknames.
// Gleiche Konstanten wie die Produktion (30/3/60s).
module typeRush_instance {
  import typeRush(
    PIDS = Set(1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    MAX_PLAYERS = 8,
    LOBBY_DURATION = 30,
    COUNTDOWN_DURATION = 3,
    ROUND_DURATION = 60,
    TEXTS = Set(List("a", "b", "c"), List("d", "e", "f", "g", "h")),
    KEYS = Set("a", "b", "c", "d", "e", "f", "g", "h", "x"),
    NICKNAMES = Set("ann", "ben", "carl", "dora", "eve", "fred", "gus", "hal", "ida", "joe")
  ).* from "./typeRush"
}
