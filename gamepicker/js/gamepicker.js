const games = [
  "Gears of War 1",
  "Fifa 25",
  "Fable 1",
  "Fallout 3",
  "Shadow of Mordor",
  "Street Fighters",
  "Army of Two",
  "Gears of War Judgment",
  "GTA Vice City",
  "GTA V",
  "Crash Team Racing",
  "Skyrim",
  "The Witcher 3",
  "Red Dead Redemption",
  "Palworld",
  "Resident Evil 5",
  "Subnautica",
  "State of Decay",
  "Metro Redux",
  "Just Cause 2",
  "Farcry 2",
  "Resident Evil",
  "Dead Rising",
  "Terraria",
  "GTA San Andreas",
  "Dead Space",
  "Stardew Valley",
  "Yu-Gi-Oh! Legacy of the Duelist : Link Evolution",
];

const random = Math.floor(Math.random() * games.length);

var gamePicked = document.getElementById("gamePicked");

gamePicked.textContent += games[random];