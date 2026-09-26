class_name WeaponSystem
## How weapons WORK. Weapons DB (data/weapons.gd) says what each weapon IS.
## Player, Echoes and (later) enemies all fire through these same functions.

static func fire(game, def: Dictionary, pos: Vector2, aim: float, mul: float, extra_shots: int, crit: float, is_echo: bool) -> void:
	if def.get("mode", "shot") != "shot":
		return
	var n: int = def.get("count", 1) + extra_shots
	var spread: float = def.get("spread", 0.05)
	var is_crit := randf() < crit
	for i in n:
		var ang := aim
		if n > 1:
			ang += (i - (n - 1) / 2.0) * spread * 2.0
		else:
			ang += randf_range(-0.02, 0.02)
		var p := Projectile.new()
		p.setup(game, pos + Vector2.from_angle(ang) * 18.0, Vector2.from_angle(ang) * def["spd"],
			def["dmg"] * mul * (2.0 if is_crit else 1.0), is_echo, def.get("kb", 60.0),
			def.get("sprite", "widowr"), def.get("size", 1.0) * (1.3 if is_crit else 1.0), is_crit)
		game.bullet_layer.add_child(p)
		game.bullets.append(p)
	if is_echo == false:
		game.fx_flash(pos + Vector2.from_angle(aim) * 26.0, aim, 1.7)

static func beam_tick(game, def: Dictionary, pos: Vector2, aim: float, mul: float, is_echo: bool) -> void:
	var dir := Vector2.from_angle(aim)
	var best_len: float = def["range"]
	for e in game.enemies:
		if e.dead:
			continue
		var to: Vector2 = e.position - pos
		var t: float = clampf(to.dot(dir), 0.0, def["range"])
		var perp: Vector2 = to - dir * t
		if perp.length() < e.r + def["width"] * 0.5:
			e.hurt(def["dps"] * mul * Game.DT, is_echo, dir * 20.0)
			best_len = minf(best_len, maxf(t, 12.0))
	game.set_beam(pos, dir * best_len, def["width"], is_echo)
