class_name SpriteLib
## Loads the baked spritesheet + frame registry and hands out AtlasTextures.
## Swap art/spritesheet.png (and frames.json) to replace any sprite — no code changes.

static var _tex: Texture2D
static var _ground: Texture2D
static var _frames: Dictionary = {}

static func _ensure() -> void:
	if _tex == null:
		_tex = load("res://art/spritesheet.png")
		var raw := FileAccess.get_file_as_string("res://art/frames.json")
		_frames = JSON.parse_string(raw)
	if _ground == null:
		_ground = load("res://art/ground.png")

static func tex(frame: String) -> AtlasTexture:
	_ensure()
	var f: Dictionary = _frames.get(frame, {})
	if f.is_empty():
		push_warning("SpriteLib: missing frame " + frame)
		return null
	var at := AtlasTexture.new()
	at.atlas = _tex
	at.region = Rect2(f["x"], f["y"], f["w"], f["h"])
	return at

static func ground_tex() -> Texture2D:
	_ensure()
	return _ground

## build a Sprite2D for a frame; ay anchors feet (0.9 = 90% of height hangs below origin)
static func sprite(frame: String, ay := 0.9, sx := 1.0) -> Sprite2D:
	_ensure()
	var s := Sprite2D.new()
	s.texture = tex(frame)
	var f: Dictionary = _frames.get(frame, {})
	if not f.is_empty():
		s.offset = Vector2(0, f["h"] * (ay - 0.5))
	s.scale = Vector2(sx, sx)
	return s
