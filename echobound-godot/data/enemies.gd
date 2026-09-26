class_name EnemyDB
## Content, not systems: enemy roles. The AI lives in Enemy.gd.

const DB := {
	"husk": {
		"hp": 20.0, "spd": 95.0, "dmg": 8.0, "r": 13.0, "xp": 1,
		"frames": ["husk0", "husk1", "husk2", "husk3"],
		"role": "chase", "gib": "#c96a4a",
	},
	"lancer": {
		"hp": 26.0, "spd": 82.0, "dmg": 7.0, "r": 12.0, "xp": 2,
		"frames": ["lancer0", "lancer1", "lancer2", "lancer3"],
		"role": "kiter", "band": 300.0, "burst": 3, "burst_cd": 2.4, "gib": "#b85a40",
	},
	"mourner": {
		"hp": 60.0, "spd": 46.0, "dmg": 6.0, "r": 15.0, "xp": 5,
		"frames": ["mourner0", "mourner1", "mourner2", "mourner3"],
		"role": "suppressor", "zone": 150.0, "gib": "#8a8f9c",
	},
	"thief": {
		"hp": 30.0, "spd": 160.0, "dmg": 4.0, "r": 11.0, "xp": 3,
		"frames": ["thief0", "thief1", "thief2", "thief3"],
		"role": "thief", "gib": "#d8a850",
	},
}
