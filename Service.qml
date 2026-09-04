import QtQuick
import Quickshell

// Installs the launcher entry so the panel is reachable from SUPER+SPACE
// without wiring up a keybind first. Omarchy has no install hook and no
// manifest field for registering one, so it happens here.
//
// Only a file carrying the X-LudditeGestures-Managed marker is ever written or
// deleted: an entry of the same name that someone else put there is left alone,
// and so is a symlink at that path, whatever it points to.
//
// Both scripts run through `env -i` with a PATH of two system directories and a
// HOME, under `timeout`, with every binary named by absolute path: nothing from
// the shell's environment reaches them, nothing on a user's PATH is resolved,
// and neither can outlive its deadline. The temp file comes from mktemp, in the
// destination directory, so the final mv is a rename and the name is not one
// anyone could have planted first.
//
// That marker is a desktop-entry key, not a reference to the repository, and it
// must not be renamed to match it. Uninstall deletes an entry only if it carries
// this exact string, so changing it orphans every entry already on disk: the old
// one stops matching, is never cleaned up, and keeps launching a plugin that is
// no longer installed. It stayed as it was when the repo became luddite-gestures.
QtObject {
  id: root

  property string omarchyPath: ""
  property var shell: null
  property var manifest: null

  readonly property string dest:
    Quickshell.env("HOME") + "/.local/share/applications/luddite-gestures.desktop"
  readonly property string marker: "^X-LudditeGestures-Managed=true$"

  readonly property string installScript:
      '[ -f "$1" ] || exit 0\n'
    + '[ -L "$2" ] && exit 0\n'
    + 'if [ -e "$2" ] && ! grep -q "$3" "$2"; then exit 0; fi\n'
    + 'dir=${2%/*}\n'
    + 'mkdir -p "$dir" || exit 0\n'
    + 'tmp=$(mktemp "$dir/.luddite-gestures.XXXXXX") || exit 0\n'
    + 'if sed "s|@ICON@|$4|" "$1" > "$tmp" && chmod 644 "$tmp" && ! cmp -s "$tmp" "$2"; then\n'
    + '  mv -f "$tmp" "$2"\n'
    + 'else\n'
    + '  rm -f "$tmp"\n'
    + 'fi\n'

  readonly property string removeScript:
      '[ -L "$1" ] && exit 0\n'
    + 'grep -q "$2" "$1" 2>/dev/null && rm -f "$1"\n'

  // How both scripts are launched: a cleared environment, a fixed PATH, a
  // deadline, and a shell named by path. `sh` after the script is $0.
  readonly property var runner: [
    "/usr/bin/env", "-i", "PATH=/usr/bin:/bin", "HOME=" + Quickshell.env("HOME"),
    "/usr/bin/timeout", "10", "/bin/sh", "-c"
  ]

  property bool installed: false

  // The shell assigns manifest after createObject() has already run
  // Component.onCompleted, so the paths are built here rather than bound.
  onManifestChanged: {
    var dir = manifest && manifest.__sourceDir
    if (installed || !dir) return
    installed = true
    Quickshell.execDetached(runner.concat([installScript, "sh",
                             dir + "/luddite-gestures.desktop", dest, marker,
                             dir + "/icon.svg"]))
  }

  // Reached on disable and on remove alike: omarchy-plugin-remove disables
  // first, so the service is torn down while the entry is still ours.
  Component.onDestruction: {
    if (!installed) return
    Quickshell.execDetached(runner.concat([removeScript, "sh", dest, marker]))
  }
}
