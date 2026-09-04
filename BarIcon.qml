import QtQuick
import qs.Ui

// The bar's way in: one touchpad icon, on the right by default, that opens the
// panel. The panel itself is a full-screen overlay the shell loads on demand
// (kind "panel"), so this widget owns no window and keeps no state. It asks the
// shell to toggle the plugin -- the same call the launcher entry makes -- and
// the shell routes that to the panel loader because the manifest also declares
// a panel kind. Measured: a plugin whose kinds are only "bar-widget" would be
// routed to the widget's own open() instead, which this one does not have.
BarWidget {
  id: root
  moduleName: "io.github.techluddite.gestures"

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  function toggle() {
    // The bar carries the shell root, and the shell owns the panel loader. The
    // fallback spawns omarchy-shell, which reaches the same function from the
    // outside; it is only there for a bar that was not handed the shell.
    if (root.bar && root.bar.shell && typeof root.bar.shell.toggle === "function")
      root.bar.shell.toggle(root.moduleName)
    else if (root.bar) root.bar.run("omarchy-shell shell toggle " + root.moduleName)
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // nf-md-trackpad, U+F07F8, from the Nerd Font the bar already uses.
    text: "󰟸"
    tooltipText: "Touchpad gestures"
    onPressed: function (buttonCode) { if (buttonCode === Qt.LeftButton) root.toggle() }
  }
}
