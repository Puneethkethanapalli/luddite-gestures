import QtQuick
import qs.Ui

// The bar's way in: one touchpad icon, on the right by default, and the panel
// that opens under it. This is the shape the shell's own clock widget has --
// the bar widget is the manifest entry point, it loads Panel.qml, and it
// forwards the open/close/toggle lifecycle the shell calls for a summon or a
// keybind. The manifest declares no separate panel kind: the popup belongs to
// the icon, the way every other icon's popup does.
BarWidget {
  id: root
  moduleName: "io.github.techluddite.gestures"

  readonly property bool opened: panelLoader.item ? panelLoader.item.opened === true : false
  readonly property bool popoutSwitchClosing: panelLoader.item
    ? panelLoader.item.popoutSwitchClosing === true : false

  function open() { if (panelLoader.item) panelLoader.item.open() }
  function close() { if (panelLoader.item) panelLoader.item.close() }
  function toggle() { if (panelLoader.item) panelLoader.item.toggle() }
  function closeForPopoutSwitch() { if (panelLoader.item) panelLoader.item.closeForPopoutSwitch() }

  function injectPanel() {
    if (!panelLoader.item) return
    panelLoader.item.bar = root.bar
    panelLoader.item.anchorItem = button
    panelLoader.item.hostWidget = root
  }

  implicitWidth: button.implicitWidth
  implicitHeight: button.implicitHeight

  onBarChanged: injectPanel()

  Loader {
    id: panelLoader
    active: true
    source: Qt.resolvedUrl("Panel.qml")
    visible: false
    onLoaded: {
      root.injectPanel()
      Qt.callLater(root.injectPanel)
    }
  }

  BarIconButton {
    id: button
    anchors.fill: parent
    bar: root.bar
    // nf-md-trackpad, U+F07F8, from the Nerd Font the bar already uses.
    text: "󰟸"
    tooltipText: "Luddite Gestures"
    active: root.opened
    onPressed: function (buttonCode) { if (buttonCode === Qt.LeftButton) root.toggle() }
  }
}
