class_name EnemyDB
## Content, not systems: enemy roles. The AI lives in Enemy.gd.

const DB := {
	"husk": {
		"hp": 20.0, "spd": 95.0, "dmg": 8.0, "r": 15.0, "xp": 1,
		"frames": ["pk_husk"], "scale": 1.0,
		"role": "chase", "gib": Color("#c9b493"),
	},
	"lancer": {
		"hp": 26.0, "spd": 82.0, "dmg": 7.0, "r": 15.0, "xp": 2,
		"frames": ["pk_lancer"], "scale": 1.05,
		"role": "kiter", "band": 300.0, "burst": 3, "burst_cd": 2.4, "gib": Color("#d8c9a8"),
	},
	"mourner": {
		"hp": 60.0, "spd": 46.0, "dmg": 6.0, "r": 15.0, "xp": 5,
		"frames": ["pk_mourner"], "scale": 1.05,
		"role": "suppressor", "zone": 150.0, "gib": Color("#9a5ab0"),
	},
	"thief": {
		"hp": 30.0, "spd": 160.0, "dmg": 4.0, "r": 11.0, "xp": 3,
		"frames": ["thief0", "thief1", "thief2", "thief3"],
		"role": "thief", "gib": Color("#d8a850"),
	},
}
