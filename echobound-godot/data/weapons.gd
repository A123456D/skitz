class_name Weapons
## Content, not systems: what each weapon IS. The system lives in WeaponSystem.gd.

const DB := {
	"grave": {
		"name": "GRAVECASTER", "tag": "Slow cannon, enormous shells",
		"mode": "shot", "cd": 0.95, "dmg": 26.0, "spd": 620.0, "count": 1,
		"spread": 0.03, "size": 1.6, "kb": 240.0, "sprite": "gcball",
	},
	"widow": {
		"name": "WIDOW", "tag": "Automatic SMG",
		"mode": "shot", "cd": 0.13, "dmg": 7.0, "spd": 760.0, "count": 1,
		"spread": 0.09, "size": 0.8, "kb": 30.0, "sprite": "widowr",
	},
	"sun": {
		"name": "SUNSPIKE", "tag": "Searing beam, pierces all",
		"mode": "beam", "dps": 54.0, "range": 360.0, "width": 10.0,
	},
}
