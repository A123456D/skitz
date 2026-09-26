class_name HUD
extends CanvasLayer
## Minimal diegetic HUD: hp, xp, timer, kills, echo chips, level-up cards.

var hp_fill: ColorRect
var hp_back: ColorRect
var xp_fill: ColorRect
var timer_l: Label
var kills_l: Label
var echoes_l: Label
var cards_box: VBoxContainer
var dim: ColorRect
var banner_l: Label

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	hp_back = ColorRect.new(); hp_back.color = Color(0.08, 0.09, 0.13, 0.9)
	hp_back.position = Vector2(16, 16); hp_back.size = Vector2(280, 14)
	root.add_child(hp_back)
	hp_fill = ColorRect.new(); hp_fill.color = Color(1.0, 0.36, 0.36)
	hp_fill.position = Vector2(1, 1); hp_fill.size = Vector2(278, 12)
	hp_back.add_child(hp_fill)

	var xp_back := ColorRect.new(); xp_back.color = Color(0.08, 0.09, 0.13, 0.9)
	xp_back.position = Vector2(16, 34); xp_back.size = Vector2(280, 6)
	root.add_child(xp_back)
	xp_fill = ColorRect.new(); xp_fill.color = Color(0.35, 1.0, 0.62)
	xp_fill.position = Vector2(0, 0); xp_fill.size = Vector2(0, 6)
	xp_back.add_child(xp_fill)

	timer_l = _label(root, Vector2(0, 0), 26, HORIZONTAL_ALIGNMENT_CENTER)
	_anchor(timer_l, 0.5, 1.0, 0.0, 0.0, -80, 80, 14, 54)
	kills_l = _label(root, Vector2(0, 0), 14, HORIZONTAL_ALIGNMENT_RIGHT)
	_anchor(kills_l, 1.0, 1.0, 0.0, 0.0, -260, -20, 16, 38)
	echoes_l = _label(root, Vector2(0, 0), 14, HORIZONTAL_ALIGNMENT_RIGHT)
	_anchor(echoes_l, 1.0, 1.0, 0.0, 0.0, -260, -20, 40, 62)

	dim = ColorRect.new(); dim.color = Color(0.01, 0.02, 0.05, 0.75)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.visible = false
	root.add_child(dim)

	var lu := Label.new(); lu.text = "LEVEL UP — CHOOSE WHAT YOUR PAST BECOMES"
	lu.add_theme_font_size_override("font_size", 18)
	lu.add_theme_color_override("font_color", Color(0.33, 0.9, 1.0))
	lu.set_anchors_preset(Control.PRESET_CENTER)
	lu.position = Vector2(-260, -190); lu.size = Vector2(520, 30)
	lu.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	dim.add_child(lu)

	cards_box = VBoxContainer.new()
	cards_box.set_anchors_preset(Control.PRESET_CENTER)
	cards_box.position = Vector2(-220, -140)
	cards_box.custom_minimum_size = Vector2(440, 0)
	cards_box.add_theme_constant_override("separation", 12)
	dim.add_child(cards_box)

	banner_l = _label(root, Vector2(0, 0), 30, HORIZONTAL_ALIGNMENT_CENTER)
	banner_l.set_anchors_preset(Control.PRESET_CENTER_TOP)
	banner_l.position = Vector2(-400, 170); banner_l.size = Vector2(800, 44)

func _anchor(c: Control, al: float, ar: float, at: float, ab: float, ol: int, orr: int, ot: int, ob: int) -> void:
	c.anchor_left = al; c.anchor_right = ar; c.anchor_top = at; c.anchor_bottom = ab
	c.offset_left = ol; c.offset_right = orr; c.offset_top = ot; c.offset_bottom = ob

func _label(parent: Control, pos: Vector2, fsize: int, align: int) -> Label:
	var l := Label.new()
	l.add_theme_font_size_override("font_size", fsize)
	l.add_theme_color_override("font_color", Color(0.91, 0.93, 0.96))
	l.horizontal_alignment = align
	l.position = pos
	parent.add_child(l)
	return l

func update_hud(p, t: float, kills: int, echoes: int) -> void:
	hp_fill.size.x = 278.0 * clampf(p.hp / p.max_hp, 0.0, 1.0)
	xp_fill.size.x = 280.0 * clampf(p.xp / p.xp_next, 0.0, 1.0)
	var m := int(t) / 60
	var s := int(t) % 60
	timer_l.text = "%d:%02d" % [m, s]
	kills_l.text = "KILLS %d" % kills
	echoes_l.text = "ECHOES %d" % echoes

func banner(txt: String) -> void:
	banner_l.text = txt
	banner_l.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_interval(1.8)
	tw.tween_property(banner_l, "modulate:a", 0.0, 0.6)

func show_choices(options: Array, game) -> void:
	get_tree().paused = true
	dim.visible = true
	for c in cards_box.get_children():
		c.queue_free()
	for i in options.size():
		var u: Dictionary = options[i]
		var b := Button.new()
		b.text = "%s  ·  %s\n%s" % [u["name"], u["cat"], u["desc"]]
		b.custom_minimum_size = Vector2(440, 64)
		b.add_theme_font_size_override("font_size", 15)
		var idx := i
		b.pressed.connect(func() -> void:
			for c2 in cards_box.get_children():
				c2.queue_free()
			dim.visible = false
			get_tree().paused = false
			game.apply_upgrade(options[idx])
		)
		cards_box.add_child(b)
	cards_box.show()
