.pragma library

// Renders and reads the managed block in ~/.config/hypr/input.lua.
//
// Only what sits between the fences is ever rewritten. Everything else in the
// file -- including hand-written hl.gesture calls with Lua callbacks, which no
// GUI can represent -- is read for context and left exactly as it was.
//
// The same renderer feeds the file and the conflict check, so what you are
// warned about is what gets written.

var BEGIN_FENCE = "-- >>> luddite-gestures managed block >>>"
var END_FENCE = "-- <<< luddite-gestures managed block <<<"

var HEADER =
    "-- Written by Luddite Gestures. Safe to hand-edit: the panel re-reads this\n"
  + "-- block every time it opens, and only ever rewrites what is between the\n"
  + "-- fences. Gestures you write outside them are shown but never touched.\n"

// ---------------------------------------------------------------- rendering

function luaString(value) {
  return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'
}

function luaNumber(n) {
  var v = Number(n)
  if (!isFinite(v)) return "0"
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v))
  return String(parseFloat(v.toFixed(4)))
}

function luaValue(value) {
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return luaNumber(value)
  return luaString(value)
}

// Optional fields are omitted when empty rather than written as "", so the
// block stays as short as the equivalent hand-written line.
function renderGesture(g) {
  var parts = [
    "fingers = " + luaNumber(g.fingers),
    "direction = " + luaString(g.direction),
    "action = " + luaString(g.action)
  ]
  if (g.mode) parts.push("mode = " + luaString(g.mode))
  if (g.mods) parts.push("mods = " + luaString(g.mods))
  if (g.workspace_name) parts.push("workspace_name = " + luaString(g.workspace_name))
  return "hl.gesture({ " + parts.join(", ") + " })"
}

// Only tunables that differ from the Hyprland default are written, so the block
// does not pin values the user never chose.
function renderTunables(tunables, schema) {
  var keys = Object.keys(tunables || {}).sort()
  var lines = []
  for (var i = 0; i < keys.length; i++) {
    var spec = schema.tunableFor(keys[i])
    if (!spec) continue
    var value = tunables[keys[i]]
    if (value === undefined || value === null) continue
    if (String(value) === String(spec.def)) continue
    // A "percent" tunable is edited as a whole number and stored as a fraction.
    var written = spec.scale ? Number(value) / spec.scale : value
    lines.push("    " + keys[i] + " = " + luaValue(written) + ",")
  }
  if (lines.length === 0) return ""
  return "hl.config({\n  gestures = {\n" + lines.join("\n") + "\n  },\n})"
}

function renderBody(gestures, tunables, schema) {
  var chunks = []
  var config = renderTunables(tunables, schema)
  if (config) chunks.push(config)
  var lines = []
  for (var i = 0; i < (gestures || []).length; i++) lines.push(renderGesture(gestures[i]))
  if (lines.length > 0) chunks.push(lines.join("\n"))
  return chunks.join("\n\n")
}

function renderBlock(body) {
  if (!body) return BEGIN_FENCE + "\n" + HEADER + END_FENCE
  return BEGIN_FENCE + "\n" + HEADER + body + "\n" + END_FENCE
}

// ------------------------------------------------------------------ splicing

function splitBlock(text) {
  var source = String(text || "")
  var begin = source.indexOf(BEGIN_FENCE)
  if (begin === -1) return { found: false, before: source, body: "", after: "" }
  var end = source.indexOf(END_FENCE, begin)
  if (end === -1) return { found: false, before: source, body: "", after: "" }
  return {
    found: true,
    before: source.substring(0, begin),
    body: source.substring(begin + BEGIN_FENCE.length, end),
    after: source.substring(end + END_FENCE.length)
  }
}

// An empty body removes the block rather than leaving an empty husk behind.
function applyBlock(text, body) {
  var split = splitBlock(text)

  if (!body) {
    if (!split.found) return String(text || "")
    var joined = split.before.replace(/\n+$/, "\n") + split.after.replace(/^\n+/, "")
    return joined.replace(/\n{3,}$/, "\n")
  }

  var block = renderBlock(body)
  if (split.found) return split.before + block + split.after

  var head = String(text || "")
  if (head.length > 0 && head.charAt(head.length - 1) !== "\n") head += "\n"
  return head + "\n" + block + "\n"
}

// ------------------------------------------------------------------- parsing

// read.lua runs a chunk against recording stubs and prints one tab-separated
// record per line. Turning that into state is a split, not a parser.
//
//   g  <fingers>  <direction>  <action>  <mode>  <mods>  <workspace_name>  <custom>
//   c  <key>  <type>  <value>
function parseHarness(stdout) {
  var result = { gestures: [], tunables: {} }
  var lines = String(stdout || "").split("\n")

  for (var i = 0; i < lines.length; i++) {
    var f = lines[i].split("\t")
    if (f[0] === "g" && f.length >= 8) {
      result.gestures.push({
        fingers: Number(f[1]) || 0,
        direction: f[2],
        action: f[3],
        mode: f[4],
        mods: f[5],
        workspace_name: f[6],
        custom: f[7] === "true"
      })
    } else if (f[0] === "c" && f.length >= 4) {
      result.tunables[f[1]] = f[2] === "number" ? Number(f[3])
        : f[2] === "boolean" ? f[3] === "true"
        : f[3]
    }
  }
  return result
}

// ----------------------------------------------------------------- conflicts

function coverageOf(direction, schema) {
  var c = schema.COVERAGE[direction]
  return c ? c : []
}

function intersects(a, b) {
  for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) !== -1) return true
  return false
}

function covers(outer, inner) {
  for (var i = 0; i < inner.length; i++) if (outer.indexOf(inner[i]) === -1) return false
  return true
}

// Hyprland registers gestures in file order and refuses a new one whose reach an
// earlier gesture already covers entirely -- that is a hard error, and the save
// would fail. A partial overlap is accepted but means the earlier gesture quietly
// wins for the shared directions, which is worth saying out loud.
//
// `ordered` is every gesture in the file, in the order Hyprland sees them, each
// tagged with its origin so a warning can point at the right place.
function findConflicts(ordered, schema) {
  var issues = []
  for (var later = 0; later < ordered.length; later++) {
    var b = ordered[later]
    for (var earlier = 0; earlier < later; earlier++) {
      var a = ordered[earlier]
      if (a.fingers !== b.fingers) continue

      var ca = coverageOf(a.direction, schema)
      var cb = coverageOf(b.direction, schema)
      if (!intersects(ca, cb)) continue

      issues.push({
        severity: covers(ca, cb) ? "shadowed" : "overlap",
        index: later,
        otherIndex: earlier,
        fingers: b.fingers,
        direction: b.direction,
        otherDirection: a.direction,
        managed: !!b.managed,
        otherManaged: !!a.managed
      })
    }
  }
  return issues
}

// Field-level problems the compositor would reject, or silently ignore.
function findFieldErrors(gestures, schema) {
  var errors = []
  for (var i = 0; i < gestures.length; i++) {
    var g = gestures[i]
    if (!schema.isValidDirection(g.direction))
      errors.push({ index: i, text: 'Not a direction Hyprland knows: "' + g.direction + '"' })
    else if (!schema.isValidAction(g.action))
      errors.push({ index: i, text: 'Not an action Hyprland knows: "' + g.action + '"' })
    if (g.fingers < schema.FINGERS_MIN)
      errors.push({ index: i, text: "Hyprland needs at least " + schema.FINGERS_MIN + " fingers" })
    var bad = schema.badModifier(g.mods)
    if (bad)
      errors.push({ index: i, text: '"' + bad + '" is not a modifier — the gesture would never fire' })
    if (g.action === "special" && !g.workspace_name)
      errors.push({ index: i, text: "Special workspace gestures need a workspace name" })
  }
  return errors
}
